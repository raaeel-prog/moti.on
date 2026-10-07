#ifndef MOTION_TRANSITION_KERNEL_H
#define MOTION_TRANSITION_KERNEL_H

#include "GlitchKernel.h"
#include <array>
#include <type_traits>

namespace motion {

// Stable style numbers are shared with the shipped camera recipes. No global
// state, temporal history, allocation or random sequence is used per pixel.
struct TransitionSettings {
    double amount = 0; // normalized 0..1
    int style = 1;
    double angle_degrees = 0;
    double flow = 0; // signed travel through the cut, -1..1
    int samples = 24;
    double pixel_aspect = 1;
    double downsample_x = 1, downsample_y = 1;
    int frame_width = 1, frame_height = 1;
};

struct TransitionGeometry {
    double amount, flow, along_x, along_y, cx, cy, radius, aspect;
    int style, samples;
};

inline TransitionGeometry prepare_transition(const TransitionSettings& s) {
    const double angle = bounded(s.angle_degrees, -360000, 360000) * 0.017453292519943295;
    const double dx = std::max(.000001, bounded(s.downsample_x, .000001, 1));
    const double dy = std::max(.000001, bounded(s.downsample_y, .000001, 1));
    return {bounded(s.amount, 0, 1), bounded(s.flow, -1, 1), std::cos(angle), std::sin(angle),
        (s.frame_width - 1) * .5, (s.frame_height - 1) * .5,
        std::max(.5, s.frame_height * .5), bounded(s.pixel_aspect, .01, 100) * dy / dx,
        std::max(1, std::min(6, s.style)), std::max(1, std::min(128, s.samples))};
}

struct TransitionPoint { double x, y; };

inline TransitionPoint transition_coordinate(double x, double y, const TransitionGeometry& g, double shutter, int channel = 0) {
    double nx = (x - g.cx) * g.aspect / g.radius, ny = (y - g.cy) / g.radius;
    const double a = g.amount, r2 = nx * nx + ny * ny;
    switch (g.style) {
        case 1: { // Whip: translational shutter streaks, signed travel at CUT.
            const double travel = a * (g.flow * .6 + shutter * 1.3);
            nx -= g.along_x * travel; ny -= g.along_y * travel;
            break;
        }
        case 2: { // Punch: an optical zoom with radial shutter integration.
            const double zoom = 1 + a * (.9 + .3 * g.flow + .7 * shutter);
            nx /= zoom; ny /= zoom;
            break;
        }
        case 3: { // Vortex: differential angular motion, strongest near center.
            const double theta = a * (.75 * g.flow + 1.1 * shutter) / (1 + .45 * r2);
            const double c = std::cos(theta), s = std::sin(theta), zoom = 1 + .22 * a;
            const double tx = (nx * c - ny * s) / zoom;
            ny = (nx * s + ny * c) / zoom; nx = tx;
            break;
        }
        case 4: { // Lens: nonlinear barrel bend with defocus along the radius.
            const double scale = 1 / (1 + .5 * a) + .22 * a * r2 / (1 + r2) + .30 * a * shutter;
            nx *= scale; ny *= scale;
            break;
        }
        case 5: { // Smear: diagonal shutter with a spatially varying scan bend.
            const double across = -nx * g.along_y + ny * g.along_x;
            const double travel = a * (.22 * g.flow + 2.8 * shutter) * (.65 + .35 * std::min(2., std::abs(across)));
            nx -= g.along_x * travel; ny -= g.along_y * travel;
            const double bend = a * .10 * std::sin(across * 3 + g.flow);
            nx += g.along_x * bend; ny += g.along_y * bend;
            break;
        }
        default: { // Prism: wavelength-dependent lens coordinates and slight spin.
            const double theta = a * (.08 * g.flow + .08 * shutter);
            const double c = std::cos(theta), s = std::sin(theta);
            const double split = channel * .05 * a * (1 + .3 * r2);
            const double scale = (1 + split + .12 * a * shutter) / (1 + .18 * a);
            const double tx = (nx * c - ny * s) * scale + channel * g.along_x * .025 * a;
            ny = (nx * s + ny * c) * scale + channel * g.along_y * .025 * a; nx = tx;
            break;
        }
    }
    return {g.cx + nx * g.radius / g.aspect, g.cy + ny * g.radius};
}

inline double transition_mirror(double v, int size) {
    if (size <= 1 || !std::isfinite(v)) return 0;
    const double edge = size - 1., period = edge * 2;
    double p = std::fmod(v, period); if (p < 0) p += period;
    return p <= edge ? p : period - p;
}

using TransitionRGBA = std::array<double, 4>; // premultiplied alpha,R,G,B

template<typename Pixel>
inline TransitionRGBA transition_bilinear(const ImageView<Pixel>& source, double x, double y) {
    x = transition_mirror(x, source.width); y = transition_mirror(y, source.height);
    const auto x0 = static_cast<int>(std::floor(x)), y0 = static_cast<int>(std::floor(y));
    const auto x1 = std::min(x0 + 1, source.width - 1), y1 = std::min(y0 + 1, source.height - 1);
    const double fx = x - x0, fy = y - y0;
    const Pixel p[4] = {source.sample(x0,y0), source.sample(x1,y0), source.sample(x0,y1), source.sample(x1,y1)};
    const double weights[4] = {(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy};
    TransitionRGBA value{};
    for (int i = 0; i < 4; ++i) {
        value[0] += p[i].alpha * weights[i]; value[1] += p[i].red * weights[i];
        value[2] += p[i].green * weights[i]; value[3] += p[i].blue * weights[i];
    }
    return value;
}

template<typename Channel> inline Channel transition_channel(double v, double maximum) {
    if constexpr (std::is_floating_point_v<Channel>) return static_cast<Channel>(v); // preserve HDR/negative RGB
    return static_cast<Channel>(std::round(std::max(0., std::min(maximum, v))));
}

template<typename Pixel>
inline Pixel transition_pixel(const ImageView<Pixel>& source, double x, double y,
    const TransitionGeometry& g, double maximum, double source_left = 0, double source_top = 0) {
    // No interpolation or alpha conversion at neutral, including float HDR and
    // RGB beneath zero alpha. This is bit-exact and independent of sample count.
    if (g.amount == 0) return source.sample(static_cast<std::int64_t>(x-source_left), static_cast<std::int64_t>(y-source_top));
    if (!source.data || source.width <= 0 || source.height <= 0) return {};
    TransitionRGBA sum{}; double total = 0;
    for (int i = 0; i < g.samples; ++i) {
        const double t = g.samples == 1 ? 0 : static_cast<double>(i) / (g.samples - 1) - .5;
        const double weight = 1 - .8 * std::abs(t);
        const auto center = transition_coordinate(x, y, g, t);
        auto pixel = transition_bilinear(source, center.x-source_left, center.y-source_top);
        if (g.style == 6) {
            const auto red = transition_coordinate(x, y, g, t, 1), blue = transition_coordinate(x, y, g, t, -1);
            const auto rp = transition_bilinear(source, red.x-source_left, red.y-source_top);
            const auto bp = transition_bilinear(source, blue.x-source_left, blue.y-source_top);
            // Dispersion has three sample alphas. Combine their coverage, then
            // repremultiply each straight channel; do not copy unrelated alpha.
            const double alpha = (rp[0] + pixel[0] + bp[0]) / 3;
            pixel[1] = rp[0] > 0 ? rp[1] / rp[0] * alpha : 0;
            pixel[2] = pixel[0] > 0 ? pixel[2] / pixel[0] * alpha : 0;
            pixel[3] = bp[0] > 0 ? bp[3] / bp[0] * alpha : 0;
            pixel[0] = alpha;
        }
        for (int c = 0; c < 4; ++c) sum[c] += pixel[c] * weight;
        total += weight;
    }
    using Channel = decltype(Pixel{}.red);
    return {transition_channel<Channel>(sum[0]/total, maximum), transition_channel<Channel>(sum[1]/total, maximum),
        transition_channel<Channel>(sum[2]/total, maximum), transition_channel<Channel>(sum[3]/total, maximum)};
}
} // namespace motion
#endif
