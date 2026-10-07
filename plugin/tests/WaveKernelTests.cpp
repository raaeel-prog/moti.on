#include "WaveKernel.h"
#include <array>
#include <cassert>
#include <cstdio>
#include <random>
#include <vector>

struct Pixel8 { std::uint8_t alpha, red, green, blue; };
struct Pixel16 { std::uint16_t alpha, red, green, blue; };

template<typename Pixel> bool equal(Pixel a, Pixel b) {
    return a.alpha == b.alpha && a.red == b.red && a.green == b.green && a.blue == b.blue;
}

bool near(double a, double b, double tolerance = 1e-8) { return std::abs(a - b) < tolerance; }

template<typename Pixel> void pixels(unsigned maximum) {
    using Channel = decltype(Pixel{}.alpha);
    const auto c = [=](unsigned value) { return static_cast<Channel>(value * maximum / 255); };
    const std::array<Pixel, 8> storage{{
        {c(255), c(200), c(100), c(50)}, {c(128), c(100), c(40), c(20)}, {}, {},
        {c(255), c(50), c(20), c(10)}, {c(64), c(50), c(10), c(5)}, {0, c(8), 0, 0}, {}
    }};
    const auto row_bytes = static_cast<std::ptrdiff_t>(4 * sizeof(Pixel));
    motion::ImageView<Pixel> source{storage.data(), 3, 2, row_bytes};
    assert(source.valid());
    motion::WaveSettings settings;
    settings.amplitude = 0;
    const auto bypass = motion::prepare_wave(settings);
    for (int y = 0; y < 2; ++y) for (int x = 0; x < 3; ++x) {
        assert(equal(motion::wave_pixel(source, x, y, bypass), source.sample(x, y)));
        assert(equal(motion::wave_bilinear(source, x, y), source.sample(x, y)));
        // A nonzero output origin must not alter source coordinates.
        const std::int64_t output_x = x + 7, output_y = y + 9;
        assert(equal(motion::wave_pixel(source, output_x - 7, output_y - 9, bypass), source.sample(x, y)));
    }
    assert(motion::wave_pixel(source, 3, 0, bypass).alpha == 0);
    motion::ImageView<Pixel> reverse{storage.data() + 4, 3, 2, -row_bytes};
    assert(reverse.valid());
    assert(equal(motion::wave_pixel(reverse, 0, 1, bypass), source.sample(0, 0)));
    // Pixel alignment and row padding are independent of the host buffer.
    std::vector<unsigned char> unaligned(2 * row_bytes + 1);
    std::memcpy(unaligned.data() + 1, storage.data(), 2 * row_bytes);
    motion::ImageView<Pixel> packed{unaligned.data() + 1, 3, 2, row_bytes};
    assert(packed.valid());
    assert(equal(motion::wave_pixel(packed, 1, 1, bypass), source.sample(1, 1)));
    motion::ImageView<Pixel> bad_stride{storage.data(), 3, 2, 1};
    assert(!bad_stride.valid());
    motion::ImageView<Pixel> bad_pointer{nullptr, 3, 2, row_bytes};
    assert(!bad_pointer.valid());
    motion::ImageView<Pixel> empty{nullptr, 0, 0, 0};
    assert(empty.valid() && motion::wave_pixel(empty, 0, 0, bypass).alpha == 0);

    const Pixel only{static_cast<Channel>(maximum), static_cast<Channel>(maximum / 2), 0, 0};
    motion::ImageView<Pixel> single{&only, 1, 1, static_cast<std::ptrdiff_t>(sizeof(Pixel))};
    assert(equal(motion::wave_bilinear(single, 0, 0), only));
    assert(equal(motion::wave_pixel(single, 0, 0, bypass), only));
    const auto half = motion::wave_bilinear(single, -0.5, 0);
    assert(half.alpha == static_cast<unsigned>(std::round(maximum * 0.5)));
    assert(half.red == static_cast<unsigned>(std::round((maximum / 2) * 0.5)));
    assert(equal(motion::wave_bilinear(single, 0.5, 0), half));
    assert(equal(motion::wave_bilinear(single, 0, 0.5), half));
    assert(motion::wave_bilinear(single, -1, 0).alpha == 0);
    assert(motion::wave_bilinear(single, 0, 1).alpha == 0);
    assert(motion::wave_bilinear(single, std::numeric_limits<double>::quiet_NaN(), 0).alpha == 0);
    assert(motion::wave_bilinear(single, std::numeric_limits<double>::max(), 0).alpha == 0);

    // Valid premultiplied source samples retain coverage through subpixel edges.
    const std::array<Pixel, 4> translucent{{
        {c(200), c(100), c(80), c(60)}, {c(100), c(50), c(40), c(30)}, {}, {}
    }};
    motion::ImageView<Pixel> alpha_source{translucent.data(), 2, 2, static_cast<std::ptrdiff_t>(2 * sizeof(Pixel))};
    const auto middle = motion::wave_bilinear(alpha_source, 0.5, 0.5);
    assert(middle.alpha == static_cast<unsigned>(std::round((c(200) + c(100)) / 4.0)));
    assert(middle.red == static_cast<unsigned>(std::round((c(100) + c(50)) / 4.0)));
    assert(middle.green <= middle.alpha && middle.blue <= middle.alpha);

    std::mt19937 random(1701);
    std::uniform_real_distribution<double> values(-1000, 1000);
    for (int iteration = 0; iteration < 3000; ++iteration) {
        settings.amplitude = iteration == 0 ? -1 : values(random);
        settings.wavelength = values(random);
        settings.direction_degrees = values(random);
        settings.phase_degrees = values(random);
        settings.seconds = values(random);
        settings.speed = values(random);
        settings.scale_x = iteration % 2 ? 0.5 : 1;
        settings.scale_y = iteration % 3 ? 0.25 : 1;
        const auto wave = motion::prepare_wave(settings);
        const auto got = motion::wave_pixel(alpha_source, 1, 1, wave);
        assert(got.red <= got.alpha && got.green <= got.alpha && got.blue <= got.alpha);
        assert(equal(got, motion::wave_pixel(alpha_source, 1, 1, wave)));
    }
}

void geometry() {
    motion::WaveSettings settings;
    settings.speed = 0;
    settings.direction_degrees = 0;
    auto wave = motion::prepare_wave(settings);
    auto position = motion::wave_source_coordinate(20, 0, wave);
    assert(near(position.x, 17) && position.y == 0);
    position = motion::wave_source_coordinate(20, 10, wave);
    assert(near(position.x, 13) && position.y == 10);
    settings.direction_degrees = 90;
    position = motion::wave_source_coordinate(0, 20, motion::prepare_wave(settings));
    assert(position.x == 0 && near(position.y, 17));
    settings.direction_degrees = 0;
    settings.amplitude = -1;
    position = motion::wave_source_coordinate(20, 0, motion::prepare_wave(settings));
    assert(near(position.x, 20.3));
    settings.amplitude = 10;
    settings.phase_degrees = 90;
    const auto phased = motion::wave_source_coordinate(20, 0, motion::prepare_wave(settings));
    assert(std::abs(phased.x - 17) > 1);
    settings.phase_degrees += 3600;
    position = motion::wave_source_coordinate(20, 0, motion::prepare_wave(settings));
    assert(near(phased.x, position.x));

    settings.phase_degrees = 35;
    settings.direction_degrees = 32;
    settings.speed = -0.8;
    settings.seconds = 0.75;
    const auto full = motion::wave_source_coordinate(80, 120, motion::prepare_wave(settings));
    settings.scale_x = 0.5;
    settings.scale_y = 0.25;
    const auto reduced = motion::wave_source_coordinate(40, 30, motion::prepare_wave(settings));
    assert(near(reduced.x * 2, full.x) && near(reduced.y * 4, full.y));
    settings.scale_x = settings.scale_y = 1;
    settings.seconds += 10 / 0.8;
    position = motion::wave_source_coordinate(80, 120, motion::prepare_wave(settings));
    assert(near(position.x, full.x) && near(position.y, full.y));
    settings.seconds = -0.75;
    settings.speed = 0.8;
    position = motion::wave_source_coordinate(80, 120, motion::prepare_wave(settings));
    assert(near(position.x, full.x) && near(position.y, full.y));
    settings.speed = 0;
    const auto stopped = motion::wave_source_coordinate(80, 120, motion::prepare_wave(settings));
    settings.seconds = 995;
    position = motion::wave_source_coordinate(80, 120, motion::prepare_wave(settings));
    assert(near(position.x, stopped.x) && near(position.y, stopped.y));

    settings = {};
    const auto nan = std::numeric_limits<double>::quiet_NaN();
    settings.amplitude = nan;
    assert(motion::prepare_wave(settings).amplitude == 0);
    settings.amplitude = 10;
    settings.wavelength = nan;
    settings.seconds = std::numeric_limits<double>::max();
    settings.direction_degrees = nan;
    settings.phase_degrees = std::numeric_limits<double>::infinity();
    settings.scale_x = nan;
    settings.scale_y = 0;
    settings.speed = 1000;
    position = motion::wave_source_coordinate(100, 100, motion::prepare_wave(settings));
    assert(std::isfinite(position.x) && std::isfinite(position.y));
    settings.wavelength = -100;
    const auto clamped = motion::prepare_wave(settings);
    settings.wavelength = 1;
    assert(clamped.spatial_y == motion::prepare_wave(settings).spatial_y);
}

int main() {
    pixels<Pixel8>(255);
    pixels<Pixel16>(32768);
    geometry();
    std::puts("PASS: Wave 8/16bpc, identity/borders/1px, stride/alignment, premultiplied alpha, phase/time, direction, downsample/origin, finite bounds, deterministic fuzz");
}
