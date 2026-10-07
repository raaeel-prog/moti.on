#ifndef MOTION_WAVE_KERNEL_H
#define MOTION_WAVE_KERNEL_H

#include "GlitchKernel.h"

namespace motion {

struct WaveSettings {
    double amplitude = 10;
    double wavelength = 40;
    double direction_degrees = 90;
    double speed = 1;
    double phase_degrees = 0;
    double seconds = 0;
    double scale_x = 1;
    double scale_y = 1;
};

struct WaveGeometry {
    double amplitude = 0;
    double spatial_x = 0;
    double spatial_y = 0;
    double displacement_x = 0;
    double displacement_y = 0;
    double phase = 0;
};

inline double wave_finite(double value, double fallback) {
    return std::isfinite(value) ? value : fallback;
}

inline WaveGeometry prepare_wave(const WaveSettings& settings) {
    constexpr double tau = 6.28318530717958647692;
    WaveGeometry result;
    result.amplitude = bounded(wave_finite(settings.amplitude, 0), -100000, 100000);
    const double wavelength = bounded(wave_finite(settings.wavelength, 1), 1, 1000);
    const double scale_x = bounded(wave_finite(settings.scale_x, 1), 0.000001, 1);
    const double scale_y = bounded(wave_finite(settings.scale_y, 1), 0.000001, 1);
    const double direction = std::fmod(wave_finite(settings.direction_degrees, 0), 360) * tau / 360;
    double along_x = std::cos(direction);
    double along_y = std::sin(direction);
    // Exact cardinal directions avoid fractional sampling from sin(pi) noise.
    if (std::abs(along_x) < 1e-14) along_x = 0;
    if (std::abs(along_y) < 1e-14) along_y = 0;
    result.spatial_x = -along_y * tau / (wavelength * scale_x);
    result.spatial_y = along_x * tau / (wavelength * scale_y);
    result.displacement_x = result.amplitude * along_x * scale_x;
    result.displacement_y = result.amplitude * along_y * scale_y;

    const double speed = bounded(wave_finite(settings.speed, 0), -1000, 1000);
    const double seconds = wave_finite(settings.seconds, 0);
    // Both harmonics repeat every ten cycles (the second evolves at 1.3x).
    // Reduce before multiplying, keeping extreme and negative times finite.
    const double cycles = speed == 0 ? 0 : std::fmod(seconds, 10 / std::abs(speed)) * speed;
    const double phase_cycles = std::fmod(wave_finite(settings.phase_degrees, 0), 3600) / 360;
    result.phase = std::fmod(cycles + phase_cycles, 10) * tau;
    return result;
}

struct WaveCoordinate { double x, y; };

inline WaveCoordinate wave_source_coordinate(std::int64_t x, std::int64_t y, const WaveGeometry& wave) {
    const double spatial = static_cast<double>(x) * wave.spatial_x + static_cast<double>(y) * wave.spatial_y;
    const double displacement = std::sin(spatial + wave.phase) + 0.3 * std::cos(2 * spatial - 1.3 * wave.phase);
    return {static_cast<double>(x) - displacement * wave.displacement_x,
            static_cast<double>(y) - displacement * wave.displacement_y};
}

template<typename Pixel>
inline Pixel wave_bilinear(const ImageView<Pixel>& source, double x, double y) {
    // Transparent border sampling includes the last row/column and 1px images.
    // Bounds are checked before any float-to-integer conversion.
    if (!std::isfinite(x) || !std::isfinite(y) || x <= -1 || y <= -1 ||
        x >= source.width || y >= source.height) return {};
    const auto x0 = static_cast<std::int64_t>(std::floor(x));
    const auto y0 = static_cast<std::int64_t>(std::floor(y));
    const double fx = x - static_cast<double>(x0);
    const double fy = y - static_cast<double>(y0);
    const Pixel p00 = source.sample(x0, y0);
    const Pixel p10 = source.sample(x0 + 1, y0);
    const Pixel p01 = source.sample(x0, y0 + 1);
    const Pixel p11 = source.sample(x0 + 1, y0 + 1);
    const auto channel = [fx, fy](auto a, auto b, auto c, auto d) {
        const double top = a * (1 - fx) + b * fx;
        const double bottom = c * (1 - fx) + d * fx;
        return static_cast<decltype(a)>(std::round(top * (1 - fy) + bottom * fy));
    };
    // Interpolate all premultiplied channels with identical weights. Splitting
    // RGB from alpha here would create fringes on partially transparent layers.
    return {channel(p00.alpha, p10.alpha, p01.alpha, p11.alpha),
            channel(p00.red, p10.red, p01.red, p11.red),
            channel(p00.green, p10.green, p01.green, p11.green),
            channel(p00.blue, p10.blue, p01.blue, p11.blue)};
}

template<typename Pixel>
inline Pixel wave_pixel(const ImageView<Pixel>& source, std::int64_t x, std::int64_t y, const WaveGeometry& wave) {
    if (wave.amplitude == 0) return source.sample(x, y);
    const auto position = wave_source_coordinate(x, y, wave);
    return wave_bilinear(source, position.x, position.y);
}

} // namespace motion
#endif
