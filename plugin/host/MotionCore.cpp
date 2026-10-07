#include "MotionCore.h"
#include "GlitchKernel.h"
#include "WaveKernel.h"
#include <cstdio>
#include <vector>

static_assert(MOTION_CORE_VERSION == PF_VERSION(1, 2, 0, PF_Stage_DEVELOP, 1), "PiPL version mismatch");
static_assert(MOTION_CORE_OUT_FLAGS == (PF_OutFlag_DEEP_COLOR_AWARE | PF_OutFlag_NON_PARAM_VARY), "PiPL flags mismatch");

static PF_Err ParamsSetup(PF_InData* in_data, PF_OutData* out_data) {
    PF_ParamDef def{};
    PF_ADD_SLIDER("Glitch Intensity", 0, 100, 0, 100, 60, INTENSITY_DISK_ID);
    AEFX_CLR_STRUCT(def);
    PF_ADD_SLIDER("Color Split Offset", 0, 200, 0, 200, 15, COLORSPLIT_DISK_ID);
    PF_ADD_FLOAT_SLIDERX("Frequency (changes/sec)", 0, 120, 0, 60, 12, PF_Precision_HUNDREDTHS, 0, 0, FREQUENCY_DISK_ID);
    PF_ADD_FLOAT_SLIDERX("Displacement (pixels)", 0, 2000, 0, 200, 40, PF_Precision_TENTHS, 0, 0, DISPLACEMENT_DISK_ID);
    AEFX_CLR_STRUCT(def);
    PF_ADD_SLIDER("Random Seed", 0, 1000000, 0, 1000, 1, SEED_DISK_ID);
    out_data->num_params = GLITCH_NUM_PARAMS;
    return PF_Err_NONE;
}

template<typename Pixel> struct RenderContext {
    motion::ImageView<Pixel> source;
    const std::vector<motion::GlitchRow>* rows;
    A_long origin_x, origin_y;
    unsigned int maximum;
};

template<typename Pixel>
static PF_Err GlitchPixel(void* refcon, A_long x, A_long y, Pixel*, Pixel* output) {
    const auto& context = *static_cast<const RenderContext<Pixel>*>(refcon);
    *output = motion::glitch_pixel(context.source,
        static_cast<std::int64_t>(x) - context.origin_x,
        static_cast<std::int64_t>(y) - context.origin_y,
        (*context.rows)[static_cast<std::size_t>(y)], context.maximum);
    return PF_Err_NONE;
}

static PF_Err Render(PF_InData* in_data, PF_ParamDef* params[], PF_LayerDef* output) {
    const auto& input = params[GLITCH_INPUT]->u.ld;
    if (!output || output->width < 0 || output->height < 0) return PF_Err_BAD_CALLBACK_PARAM;
    if (output->width == 0 || output->height == 0) return PF_Err_NONE;
    if (PF_WORLD_IS_DEEP(&input) != PF_WORLD_IS_DEEP(output)) return PF_Err_BAD_CALLBACK_PARAM;
    motion::GlitchSettings settings;
    settings.intensity = motion::bounded(params[GLITCH_INTENSITY]->u.sd.value / 100.0, 0, 1);
    settings.rgb_split = params[GLITCH_COLOR_SPLIT]->u.sd.value;
    settings.frequency = params[GLITCH_FREQUENCY]->u.fs_d.value;
    settings.displacement = params[GLITCH_DISPLACEMENT]->u.fs_d.value;
    settings.seed = static_cast<std::uint32_t>(motion::bounded(params[GLITCH_SEED]->u.sd.value, 0, 1000000));
    settings.seconds = in_data->time_scale ? static_cast<double>(in_data->current_time) / in_data->time_scale : 0;
    settings.scale_x = in_data->downsample_x.den ? static_cast<double>(in_data->downsample_x.num) / in_data->downsample_x.den : 1;
    settings.scale_y = in_data->downsample_y.den ? static_cast<double>(in_data->downsample_y.num) / in_data->downsample_y.den : 1;
    settings.source_origin_y = in_data->output_origin_y;
    std::vector<motion::GlitchRow> rows(static_cast<std::size_t>(output->height));
    for (A_long y = 0; y < output->height; ++y) rows[static_cast<std::size_t>(y)] = motion::prepare_row(settings, y);
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    // Iterate the entire output (not extent_hint): distortion samples neighbors
    // outside the opaque input rectangle. Null src makes the suite cover dst.
    if (PF_WORLD_IS_DEEP(output)) {
        RenderContext<PF_Pixel16> context{{input.data, input.width, input.height, input.rowbytes}, &rows,
            in_data->output_origin_x, in_data->output_origin_y, PF_MAX_CHAN16};
        motion::ImageView<PF_Pixel16> destination{output->data, output->width, output->height, output->rowbytes};
        if (!context.source.valid() || !destination.valid()) return PF_Err_BAD_CALLBACK_PARAM;
        return suites.Iterate16Suite1()->iterate(in_data, 0, output->height, nullptr, nullptr,
            &context, GlitchPixel<PF_Pixel16>, output);
    }
    RenderContext<PF_Pixel8> context{{input.data, input.width, input.height, input.rowbytes}, &rows,
        in_data->output_origin_x, in_data->output_origin_y, PF_MAX_CHAN8};
    motion::ImageView<PF_Pixel8> destination{output->data, output->width, output->height, output->rowbytes};
    if (!context.source.valid() || !destination.valid()) return PF_Err_BAD_CALLBACK_PARAM;
    return suites.Iterate8Suite1()->iterate(in_data, 0, output->height, nullptr, nullptr,
        &context, GlitchPixel<PF_Pixel8>, output);
}

extern "C" DllExport PF_Err GlitchMain(PF_Cmd cmd, PF_InData* in_data, PF_OutData* out_data,
    PF_ParamDef* params[], PF_LayerDef* output, void*) {
    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                std::snprintf(out_data->return_msg, sizeof(out_data->return_msg),
                    "Moti.on Glitch 1.2\rNative 8/16 bpc CPU renderer");
                return PF_Err_NONE;
            case PF_Cmd_GLOBAL_SETUP:
                out_data->my_version = MOTION_CORE_VERSION;
                out_data->out_flags = MOTION_CORE_OUT_FLAGS;
                out_data->out_flags2 = MOTION_CORE_OUT_FLAGS2;
                return PF_Err_NONE;
            case PF_Cmd_PARAMS_SETUP: return ParamsSetup(in_data, out_data);
            case PF_Cmd_RENDER: return Render(in_data, params, output);
            default: return PF_Err_NONE;
        }
    } catch (const std::bad_alloc&) {
        return PF_Err_OUT_OF_MEMORY;
    } catch (PF_Err error) {
        return error;
    } catch (...) {
        return PF_Err_INTERNAL_STRUCT_DAMAGED;
    }
}

enum {
    WAVE_INPUT = 0,
    WAVE_AMPLITUDE,
    WAVE_WAVELENGTH,
    WAVE_DIRECTION,
    WAVE_SPEED,
    WAVE_PHASE,
    WAVE_NUM_PARAMS
};

static PF_Err WaveParamsSetup(PF_InData* in_data, PF_OutData* out_data) {
    PF_ParamDef def{};
    // IDs 1001-1004 remain unchanged for existing projects. Append new controls.
    PF_ADD_FLOAT_SLIDERX("Amplitude (pixels)", -100000, 100000, 0, 100, 10, PF_Precision_TENTHS, 0, 0, 1001);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Wavelength (pixels)", 1, 1000, 1, 100, 40, PF_Precision_TENTHS, 0, 0, 1002);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Direction", 90, 1003);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Speed (cycles/sec)", -1000, 1000, -10, 10, 1, PF_Precision_HUNDREDTHS, 0, 0, 1004);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Phase (degrees)", -36000, 36000, -360, 360, 0, PF_Precision_TENTHS, 0, 0, 1005);
    out_data->num_params = WAVE_NUM_PARAMS;
    return PF_Err_NONE;
}

template<typename Pixel> struct WaveContext {
    motion::ImageView<Pixel> source;
    motion::WaveGeometry wave;
    A_long origin_x, origin_y;
};

template<typename Pixel>
static PF_Err WavePixel(void* refcon, A_long x, A_long y, Pixel*, Pixel* output) {
    const auto& context = *static_cast<const WaveContext<Pixel>*>(refcon);
    *output = motion::wave_pixel(context.source,
        static_cast<std::int64_t>(x) - context.origin_x,
        static_cast<std::int64_t>(y) - context.origin_y, context.wave);
    return PF_Err_NONE;
}

static PF_Err WaveRender(PF_InData* in_data, PF_ParamDef* params[], PF_LayerDef* output) {
    if (!in_data || !params || !output || output->width < 0 || output->height < 0)
        return PF_Err_BAD_CALLBACK_PARAM;
    if (output->width == 0 || output->height == 0) return PF_Err_NONE;
    for (int parameter = WAVE_INPUT; parameter < WAVE_NUM_PARAMS; ++parameter)
        if (!params[parameter]) return PF_Err_BAD_CALLBACK_PARAM;
    const auto& input = params[WAVE_INPUT]->u.ld;
    if (PF_WORLD_IS_DEEP(&input) != PF_WORLD_IS_DEEP(output)) return PF_Err_BAD_CALLBACK_PARAM;
    motion::WaveSettings settings;
    settings.amplitude = params[WAVE_AMPLITUDE]->u.fs_d.value;
    settings.wavelength = params[WAVE_WAVELENGTH]->u.fs_d.value;
    settings.direction_degrees = FIX_2_FLOAT(params[WAVE_DIRECTION]->u.ad.value);
    settings.speed = params[WAVE_SPEED]->u.fs_d.value;
    settings.phase_degrees = params[WAVE_PHASE]->u.fs_d.value;
    settings.seconds = in_data->time_scale ? static_cast<double>(in_data->current_time) / in_data->time_scale : 0;
    settings.scale_x = in_data->downsample_x.den ? static_cast<double>(in_data->downsample_x.num) / in_data->downsample_x.den : 1;
    settings.scale_y = in_data->downsample_y.den ? static_cast<double>(in_data->downsample_y.num) / in_data->downsample_y.den : 1;
    const auto wave = motion::prepare_wave(settings);
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    // Distortion samples neighbors outside extent_hint, so iterate all output.
    // The iterate suite supplies progress/cancellation and may process pixels
    // concurrently; the context is immutable and has no shared mutable state.
    if (PF_WORLD_IS_DEEP(output)) {
        WaveContext<PF_Pixel16> context{{input.data, input.width, input.height, input.rowbytes}, wave,
            in_data->output_origin_x, in_data->output_origin_y};
        motion::ImageView<PF_Pixel16> destination{output->data, output->width, output->height, output->rowbytes};
        if (!context.source.valid() || !destination.valid()) return PF_Err_BAD_CALLBACK_PARAM;
        return suites.Iterate16Suite1()->iterate(in_data, 0, output->height, nullptr, nullptr,
            &context, WavePixel<PF_Pixel16>, output);
    }
    WaveContext<PF_Pixel8> context{{input.data, input.width, input.height, input.rowbytes}, wave,
        in_data->output_origin_x, in_data->output_origin_y};
    motion::ImageView<PF_Pixel8> destination{output->data, output->width, output->height, output->rowbytes};
    if (!context.source.valid() || !destination.valid()) return PF_Err_BAD_CALLBACK_PARAM;
    return suites.Iterate8Suite1()->iterate(in_data, 0, output->height, nullptr, nullptr,
        &context, WavePixel<PF_Pixel8>, output);
}

extern "C" DllExport PF_Err WaveMain(PF_Cmd cmd, PF_InData* in_data, PF_OutData* out_data,
    PF_ParamDef* params[], PF_LayerDef* output, void*) {
    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                std::snprintf(out_data->return_msg, sizeof(out_data->return_msg),
                    "Moti.on Wave Core\rNative 8/16 bpc CPU renderer");
                return PF_Err_NONE;
            case PF_Cmd_GLOBAL_SETUP:
                out_data->my_version = MOTION_CORE_VERSION;
                out_data->out_flags = MOTION_CORE_OUT_FLAGS;
                out_data->out_flags2 = MOTION_CORE_OUT_FLAGS2;
                return PF_Err_NONE;
            case PF_Cmd_PARAMS_SETUP: return WaveParamsSetup(in_data, out_data);
            case PF_Cmd_RENDER: return WaveRender(in_data, params, output);
            default: return PF_Err_NONE;
        }
    } catch (const std::bad_alloc&) {
        return PF_Err_OUT_OF_MEMORY;
    } catch (PF_Err error) {
        return error;
    } catch (...) {
        return PF_Err_INTERNAL_STRUCT_DAMAGED;
    }
}
