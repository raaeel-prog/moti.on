#ifndef MOTION_GLITCH_KERNEL_H
#define MOTION_GLITCH_KERNEL_H

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>

namespace motion {

struct GlitchSettings {
    double intensity = 0.6;
    double rgb_split = 15;
    double displacement = 40;
    double frequency = 12;
    std::uint32_t seed = 1;
    double seconds = 0;
    double scale_x = 1;
    double scale_y = 1;
    int source_origin_y = 0;
};

inline double bounded(double value, double minimum, double maximum) {
    return std::isfinite(value) ? std::max(minimum, std::min(value, maximum)) : minimum;
}

inline std::uint32_t hash(std::uint32_t value) {
    value ^= value >> 16;
    value *= 0x7feb352dU;
    value ^= value >> 15;
    value *= 0x846ca68bU;
    return value ^ (value >> 16);
}

// Wrap a finite integral value explicitly before converting it. This handles
// negative timeline times and long sequences without signed integer overflow.
inline std::uint32_t wrapped_integer(double value) {
    if (!std::isfinite(value)) return 0;
    double wrapped = std::fmod(std::floor(value), 4294967296.0);
    if (wrapped < 0) wrapped += 4294967296.0;
    return static_cast<std::uint32_t>(wrapped);
}

inline std::uint32_t event_index(double seconds, double frequency) {
    const double rate = bounded(frequency, 0, 120);
    return rate == 0 ? 0 : wrapped_integer(seconds * rate);
}

struct GlitchRow {
    int shift = 0;
    int split = 0;
};

inline GlitchRow prepare_row(const GlitchSettings& settings, int y) {
    const double amount = bounded(settings.intensity, 0, 1);
    const double scale_x = bounded(settings.scale_x, 0.000001, 1);
    const double scale_y = bounded(settings.scale_y, 0.000001, 1);
    const auto event = event_index(settings.seconds, settings.frequency);
    const auto pattern = hash(settings.seed ^ hash(event + 0x9e3779b9U));
    const double full_y = (static_cast<double>(y) - settings.source_origin_y) / scale_y;
    const double band_height = 8 + pattern % 25;
    const auto band = wrapped_integer(full_y / band_height);
    const auto random = hash(pattern ^ hash(band + 0x68bc21ebU));
    const double activation = static_cast<double>(random & 0xffffU) / 65536.0;
    const double direction = static_cast<double>(hash(random) & 0xffffU) / 32767.5 - 1;
    const double offset = activation < amount
        ? bounded(settings.displacement, 0, 2000) * amount * direction * scale_x : 0;
    return {static_cast<int>(std::round(offset)),
            static_cast<int>(std::round(bounded(settings.rgb_split, 0, 200) * amount * scale_x))};
}

template <typename Pixel> struct ImageView {
    const void* data = nullptr;
    int width = 0;
    int height = 0;
    std::ptrdiff_t row_bytes = 0;

    bool valid() const {
        if (width < 0 || height < 0) return false;
        if (width == 0 || height == 0) return true;
        if (!data || row_bytes == std::numeric_limits<std::ptrdiff_t>::min()) return false;
        const auto stride = row_bytes < 0 ? -row_bytes : row_bytes;
        return static_cast<std::uint64_t>(stride) >= static_cast<std::uint64_t>(width) * sizeof(Pixel)
            && static_cast<std::uint64_t>(stride) * static_cast<std::uint64_t>(height - 1)
                <= static_cast<std::uint64_t>(std::numeric_limits<std::ptrdiff_t>::max());
    }

    Pixel sample(std::int64_t x, std::int64_t y) const {
        Pixel result{};
        if (!data || x < 0 || y < 0 || x >= width || y >= height) return result;
        // Do not assume tightly packed or identically aligned source/output rows.
        const auto* row = static_cast<const unsigned char*>(data) + static_cast<std::ptrdiff_t>(y) * row_bytes;
        std::memcpy(&result, row + static_cast<std::ptrdiff_t>(x) * sizeof(Pixel), sizeof(Pixel));
        return result;
    }
};

template <typename Channel>
inline Channel repremultiply(Channel channel, Channel sample_alpha, Channel output_alpha, unsigned int maximum) {
    if (!sample_alpha || !output_alpha) return 0;
    const double value = static_cast<double>(channel) * output_alpha / sample_alpha;
    return static_cast<Channel>(std::round(std::min(value, static_cast<double>(std::min<unsigned int>(maximum, output_alpha)))));
}

template <typename Pixel>
inline Pixel glitch_pixel(const ImageView<Pixel>& source, std::int64_t x, std::int64_t y,
                          const GlitchRow& row, unsigned int maximum) {
    const auto shifted_x = x + row.shift;
    Pixel output = source.sample(shifted_x, y);
    if (row.split == 0 || output.alpha == 0) return output;
    const Pixel red = source.sample(shifted_x - row.split, y);
    const Pixel blue = source.sample(shifted_x + row.split, y);
    // RGB samples have different coverage. Convert only those channels back to
    // the central sample's coverage, preventing fringes from transparent pixels.
    output.red = repremultiply(red.red, red.alpha, output.alpha, maximum);
    output.blue = repremultiply(blue.blue, blue.alpha, output.alpha, maximum);
    return output;
}

} // namespace motion
#endif
