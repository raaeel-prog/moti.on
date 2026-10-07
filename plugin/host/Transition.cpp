#include "MotionCore.h"
#include "TransitionKernel.h"
#include "AEFX_SuiteHelper.h"
#include <cstdio>
#include <memory>

static_assert(MOTION_TRANSITION_VERSION == PF_VERSION(1, 0, 0, PF_Stage_DEVELOP, 1), "Transition PiPL version mismatch");
static_assert(MOTION_TRANSITION_FLAGS == PF_OutFlag_DEEP_COLOR_AWARE, "Transition flags mismatch");
static_assert(MOTION_TRANSITION_FLAGS2 == (PF_OutFlag2_SUPPORTS_SMART_RENDER | PF_OutFlag2_FLOAT_COLOR_AWARE |
    PF_OutFlag2_SUPPORTS_THREADED_RENDERING), "Transition flags2 mismatch");

// Disk IDs and property indices are permanent. Keep this effect separate from
// Glitch and Wave: existing projects retain their original ABI and rendering.
enum { TR_INPUT, TR_AMOUNT, TR_STYLE, TR_ANGLE, TR_FLOW, TR_SAMPLES, TR_COUNT };

static PF_Err TransitionParams(PF_InData* in_data, PF_OutData* out_data) {
    PF_ParamDef def{};
    PF_ADD_FLOAT_SLIDERX("Amount (%)", 0, 100, 0, 100, 0, PF_Precision_HUNDREDTHS, 0, 0, 2001);
    AEFX_CLR_STRUCT(def);
    PF_ADD_POPUP("Style", 6, 1, "Lateral Whip|Optical Punch|Soft Vortex|Lens Pulse|Diagonal Smear|Chromatic Prism", 2002);
    AEFX_CLR_STRUCT(def);
    PF_ADD_ANGLE("Direction", 0, 2003);
    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Flow", -1, 1, -1, 1, 0, PF_Precision_HUNDREDTHS, 0, 0, 2004);
    AEFX_CLR_STRUCT(def);
    PF_ADD_SLIDER("Samples", 1, 128, 1, 128, 24, 2005);
    out_data->num_params = TR_COUNT;
    return PF_Err_NONE;
}

struct TransitionFrame {
    motion::TransitionGeometry geometry;
    PF_LRect output_rect{};
    bool smart = false;
};
static void DeleteTransitionFrame(void* frame) { delete static_cast<TransitionFrame*>(frame); }

static motion::TransitionSettings TransitionSettings(PF_InData* in_data, PF_ParamDef* p[]) {
    motion::TransitionSettings s;
    s.amount = p[TR_AMOUNT]->u.fs_d.value / 100.; s.style = p[TR_STYLE]->u.pd.value;
    s.angle_degrees = FIX_2_FLOAT(p[TR_ANGLE]->u.ad.value); s.flow = p[TR_FLOW]->u.fs_d.value;
    s.samples = p[TR_SAMPLES]->u.sd.value;
    s.downsample_x = in_data->downsample_x.den ? double(in_data->downsample_x.num)/in_data->downsample_x.den : 1;
    s.downsample_y = in_data->downsample_y.den ? double(in_data->downsample_y.num)/in_data->downsample_y.den : 1;
    s.pixel_aspect = in_data->pixel_aspect_ratio.den ? double(in_data->pixel_aspect_ratio.num)/in_data->pixel_aspect_ratio.den : 1;
    s.frame_width = std::max(1, int(std::ceil(in_data->width * s.downsample_x)));
    s.frame_height = std::max(1, int(std::ceil(in_data->height * s.downsample_y)));
    return s;
}

static PF_Err TransitionPreRender(PF_InData* in_data, PF_PreRenderExtra* extra) {
    if (!extra || !extra->input || !extra->output || !extra->cb) return PF_Err_BAD_CALLBACK_PARAM;
    PF_ParamDef values[TR_COUNT]{}; PF_ParamDef* params[TR_COUNT]{};
    PF_Err err = PF_Err_NONE; int checked = 0;
    for (int i = 1; i < TR_COUNT && !err; ++i) {
        err = PF_CHECKOUT_PARAM(in_data, i, in_data->current_time, in_data->time_step, in_data->time_scale, &values[i]);
        if (!err) { params[i] = &values[i]; checked = i; }
    }
    motion::TransitionSettings settings;
    if (!err) settings = TransitionSettings(in_data, params);
    for (int i = 1; i <= checked; ++i) {
        const PF_Err checkin = PF_CHECKIN_PARAM(in_data, &values[i]); if (!err) err = checkin;
    }
    if (err) return err;
    auto frame = std::make_unique<TransitionFrame>();
    frame->geometry = motion::prepare_transition(settings);
    frame->smart = true;
    PF_RenderRequest request = extra->input->output_request;
    // Every style can sample across the frame. Request the complete input, not
    // the output ROI; spatial normalization must not change with a tiled render.
    request.rect = {0, 0, settings.frame_width, settings.frame_height};
    request.field = PF_Field_FRAME; request.channel_mask = PF_ChannelMask_ARGB;
    request.preserve_rgb_of_zero_alpha = TRUE;
    PF_CheckoutResult input{};
    err = extra->cb->checkout_layer(in_data->effect_ref, TR_INPUT, TR_INPUT, &request,
        in_data->current_time, in_data->time_step, in_data->time_scale, &input);
    if (err) return err;
    PF_LRect rect = extra->input->output_request.rect;
    rect.left = std::max<A_long>(0, rect.left); rect.top = std::max<A_long>(0, rect.top);
    rect.right = std::max(rect.left, std::min<A_long>(settings.frame_width, rect.right));
    rect.bottom = std::max(rect.top, std::min<A_long>(settings.frame_height, rect.bottom));
    frame->output_rect = rect;
    extra->output->result_rect = rect;
    extra->output->max_result_rect = request.rect;
    extra->output->solid = FALSE; // geometric/dispersion sampling may change alpha
    extra->output->pre_render_data = frame.release();
    extra->output->delete_pre_render_data_func = DeleteTransitionFrame;
    return PF_Err_NONE;
}

template<typename Pixel> struct TransitionContext {
    motion::ImageView<Pixel> source;
    motion::TransitionGeometry geometry;
    double output_left, output_top, source_left, source_top, maximum;
};
template<typename Pixel> static PF_Err TransitionPixel(void* refcon, A_long x, A_long y, Pixel*, Pixel* out) {
    const auto& c = *static_cast<const TransitionContext<Pixel>*>(refcon);
    *out = motion::transition_pixel(c.source, x+c.output_left, y+c.output_top,
        c.geometry, c.maximum, c.source_left, c.source_top);
    return PF_Err_NONE;
}

template<typename Pixel> static TransitionContext<Pixel> TransitionContextFor(PF_InData* in_data,
    const PF_EffectWorld& input, const TransitionFrame& frame, double maximum) {
    // AE_Effect.h: smart checkout worlds expose their origin in layer coords.
    // The legacy callback instead gives the input origin relative to output.
    // Never infer the checked-out input origin from the requested output ROI.
    const double source_left = frame.smart ? input.origin_x : in_data->output_origin_x;
    const double source_top = frame.smart ? input.origin_y : in_data->output_origin_y;
    return {{input.data, input.width, input.height, input.rowbytes}, frame.geometry,
        double(frame.output_rect.left), double(frame.output_rect.top), source_left, source_top, maximum};
}

static PF_Err TransitionRenderWorld(PF_InData* in_data, PF_OutData* out_data,
    PF_EffectWorld* input, PF_EffectWorld* output, const TransitionFrame& frame) {
    if (!input || !output || output->width < 0 || output->height < 0) return PF_Err_BAD_CALLBACK_PARAM;
    if (!output->width || !output->height) return PF_Err_NONE;
    AEFX_SuiteScoper<PF_WorldSuite2> world(in_data, kPFWorldSuite, kPFWorldSuiteVersion2, out_data);
    PF_PixelFormat format, output_format;
    PF_Err err = world->PF_GetPixelFormat(input, &format); if (err) return err;
    err = world->PF_GetPixelFormat(output, &output_format); if (err) return err;
    if (format != output_format) return PF_Err_BAD_CALLBACK_PARAM;
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    switch (format) {
        case PF_PixelFormat_ARGB32: {
            auto c = TransitionContextFor<PF_Pixel8>(in_data, *input, frame, PF_MAX_CHAN8);
            if (!c.source.valid()) return PF_Err_BAD_CALLBACK_PARAM;
            return suites.Iterate8Suite2()->iterate(in_data, 0, output->height, nullptr, nullptr, &c, TransitionPixel<PF_Pixel8>, output);
        }
        case PF_PixelFormat_ARGB64: {
            auto c = TransitionContextFor<PF_Pixel16>(in_data, *input, frame, PF_MAX_CHAN16);
            if (!c.source.valid()) return PF_Err_BAD_CALLBACK_PARAM;
            return suites.Iterate16Suite2()->iterate(in_data, 0, output->height, nullptr, nullptr, &c, TransitionPixel<PF_Pixel16>, output);
        }
        case PF_PixelFormat_ARGB128: {
            auto c = TransitionContextFor<PF_PixelFloat>(in_data, *input, frame, 1);
            if (!c.source.valid()) return PF_Err_BAD_CALLBACK_PARAM;
            return suites.IterateFloatSuite2()->iterate(in_data, 0, output->height, nullptr, nullptr, &c, TransitionPixel<PF_PixelFloat>, output);
        }
        default: return PF_Err_BAD_CALLBACK_PARAM;
    }
}

static PF_Err TransitionSmartRender(PF_InData* in_data, PF_OutData* out_data, PF_SmartRenderExtra* extra) {
    if (!extra || !extra->input || !extra->input->pre_render_data) return PF_Err_BAD_CALLBACK_PARAM;
    PF_EffectWorld *input = nullptr, *output = nullptr;
    PF_Err err = extra->cb->checkout_layer_pixels(in_data->effect_ref, TR_INPUT, &input);
    if (err) return err;
    // Pixel checkout is checked in on all return/exception paths.
    struct Checkin { PF_InData* in; PF_SmartRenderExtra* extra;
        ~Checkin() { extra->cb->checkin_layer_pixels(in->effect_ref, TR_INPUT); } } checkin{in_data, extra};
    err = extra->cb->checkout_output(in_data->effect_ref, &output);
    if (!err) err = TransitionRenderWorld(in_data, out_data, input, output, *static_cast<const TransitionFrame*>(extra->input->pre_render_data));
    return err;
}

extern "C" DllExport PF_Err TransitionMain(PF_Cmd cmd, PF_InData* in_data, PF_OutData* out_data,
    PF_ParamDef* params[], PF_LayerDef* output, void* extra) {
    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                std::snprintf(out_data->return_msg, sizeof(out_data->return_msg), "Moti.on Native Transition 1.0\rSix image transitions. Native 8/16/32 bpc CPU renderer."); return PF_Err_NONE;
            case PF_Cmd_GLOBAL_SETUP:
                out_data->my_version = MOTION_TRANSITION_VERSION; out_data->out_flags = MOTION_TRANSITION_FLAGS;
                out_data->out_flags2 = MOTION_TRANSITION_FLAGS2; return PF_Err_NONE;
            case PF_Cmd_PARAMS_SETUP: return TransitionParams(in_data, out_data);
            case PF_Cmd_SMART_PRE_RENDER: return TransitionPreRender(in_data, static_cast<PF_PreRenderExtra*>(extra));
            case PF_Cmd_SMART_RENDER: return TransitionSmartRender(in_data, out_data, static_cast<PF_SmartRenderExtra*>(extra));
            case PF_Cmd_RENDER: {
                if (!params || !params[0]) return PF_Err_BAD_CALLBACK_PARAM;
                for (int i=1;i<TR_COUNT;++i) if (!params[i]) return PF_Err_BAD_CALLBACK_PARAM;
                TransitionFrame frame{motion::prepare_transition(TransitionSettings(in_data, params)), {}};
                return TransitionRenderWorld(in_data, out_data, &params[0]->u.ld, output, frame);
            }
            default: return PF_Err_NONE;
        }
    } catch (const std::bad_alloc&) { return PF_Err_OUT_OF_MEMORY; }
      catch (PF_Err error) { return error; }
      catch (...) { return PF_Err_INTERNAL_STRUCT_DAMAGED; }
}
