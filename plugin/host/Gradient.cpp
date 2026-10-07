#include "MotionCore.h"
#include "GradientKernel.h"
#include "GradientMetal.h"
#include "AEFX_SuiteHelper.h"
#include "AE_EffectGPUSuites.h"
#include <cstdio>
#include <memory>
#include <type_traits>
#ifdef MOTION_GRADIENT_QA_TRACE
#include <atomic>
#include <mutex>
#include <thread>
static std::atomic<int> gradientQARenders{0};
static void GradientThreadTrace(const char* stage, bool gpu, int active, A_long time) {
    static std::mutex mutex; std::lock_guard<std::mutex> lock(mutex);
    if (auto file=std::fopen("/tmp/motion-gradient-native-trace.txt","a")) {
        std::fprintf(file,"%s gpu=%d active=%d thread=%zu time=%ld\n",stage,gpu,active,
            std::hash<std::thread::id>{}(std::this_thread::get_id()),long(time)); std::fclose(file);
    }
}
struct GradientTraceScope {
    bool gpu; A_long time;
    GradientTraceScope(bool gpu, A_long time): gpu(gpu), time(time) { GradientThreadTrace("begin",gpu,++gradientQARenders,time); }
    ~GradientTraceScope() { GradientThreadTrace("end",gpu,gradientQARenders--,time); }
};
static void GradientTrace(const char* stage, bool gpu, int format, const PF_EffectWorld* input, const PF_EffectWorld* output, PF_Err error) {
    static std::mutex mutex; std::lock_guard<std::mutex> lock(mutex);
    if (auto file=std::fopen("/tmp/motion-gradient-native-trace.txt","a")) {
        std::fprintf(file,"%s gpu=%d format=%d input=%dx%d@%d,%d output=%dx%d error=%d\n",stage,gpu,format,
            input?int(input->width):0,input?int(input->height):0,input?int(input->origin_x):0,input?int(input->origin_y):0,
            output?int(output->width):0,output?int(output->height):0,int(error)); std::fclose(file);
    }
}
#else
static void GradientTrace(const char*, bool, int, const PF_EffectWorld*, const PF_EffectWorld*, PF_Err) {}
#endif

namespace gr = motion::gradient;
// Parameter indices, disk IDs and effect identity are permanent v1 ABI.
enum { G_INPUT, G_MODE, G_CENTER_X, G_CENTER_Y, G_SCALE, G_ASPECT, G_ANGLE,
    G_CYCLES, G_OFFSET, G_DEPTH, G_DEPTH_RADIUS, G_BULGE, G_TURBULENCE,
    G_TURBULENCE_SCALE, G_SEED, G_GLOW, G_GLOW_RADIUS, G_GLOW_THRESHOLD,
    G_HIGHLIGHT, G_DIFFUSION, G_DIFFUSION_RADIUS, G_FOCUS_X, G_FOCUS_Y,
    G_FOCUS_RADIUS, G_FOCUS_SOFTNESS, G_GRAIN, G_ANIMATION, G_DURATION,
    G_PHASE, G_COLOR_PROCESSING, G_STOP_START, G_SCHEMA = 54, G_COUNT = 55 };
static_assert(MOTION_GRADIENT_FLAGS == (PF_OutFlag_DEEP_COLOR_AWARE | PF_OutFlag_I_EXPAND_BUFFER | PF_OutFlag_NON_PARAM_VARY), "Gradient flags drift");
static_assert(MOTION_GRADIENT_FLAGS2 == (PF_OutFlag2_SUPPORTS_SMART_RENDER | PF_OutFlag2_FLOAT_COLOR_AWARE | PF_OutFlag2_SUPPORTS_THREADED_RENDERING | PF_OutFlag2_SUPPORTS_GPU_RENDER_F32), "Gradient flags2 drift");

static PF_Err GradientParams(PF_InData* in_data, PF_OutData* out_data) {
    PF_ParamDef def{};
    PF_ADD_POPUP("Shape", 3, 1, "Linear|Radial|Angular", 3001);
#define G_FLOAT(LABEL, INDEX, MIN, MAX, DEFAULT) AEFX_CLR_STRUCT(def); PF_ADD_FLOAT_SLIDERX(LABEL, MIN, MAX, MIN, MAX, DEFAULT, PF_Precision_HUNDREDTHS, 0, 0, 3000 + INDEX)
    G_FLOAT("Center X", G_CENTER_X, -2, 3, .5);
    G_FLOAT("Center Y", G_CENTER_Y, -2, 3, .5);
    G_FLOAT("Scale", G_SCALE, .01, 10, 1);
    G_FLOAT("Aspect", G_ASPECT, .1, 10, 1);
    G_FLOAT("Rotation (degrees)", G_ANGLE, -36000, 36000, 0);
    G_FLOAT("Cycles", G_CYCLES, .1, 20, 1);
    G_FLOAT("Offset", G_OFFSET, -100, 100, 0);
    G_FLOAT("Depth", G_DEPTH, 0, 2, .25);
    G_FLOAT("Depth radius (px)", G_DEPTH_RADIUS, 0, 500, 40);
    G_FLOAT("Bulge", G_BULGE, -2, 2, .2);
    G_FLOAT("Turbulence", G_TURBULENCE, 0, 2, .15);
    G_FLOAT("Turbulence scale (px)", G_TURBULENCE_SCALE, 1, 2000, 200);
    AEFX_CLR_STRUCT(def); PF_ADD_SLIDER("Variation", 0, 1000000, 0, 1000, 1, 3014);
    G_FLOAT("Glow", G_GLOW, 0, 5, .35);
    G_FLOAT("Glow radius (px)", G_GLOW_RADIUS, 0, 500, 32);
    G_FLOAT("Glow threshold", G_GLOW_THRESHOLD, 0, 10, .6);
    G_FLOAT("Highlight protection", G_HIGHLIGHT, 0, 1, .5);
    G_FLOAT("Diffusion", G_DIFFUSION, 0, 1, 0);
    G_FLOAT("Diffusion radius (px)", G_DIFFUSION_RADIUS, 0, 500, 30);
    G_FLOAT("Focus X", G_FOCUS_X, -2, 3, .5);
    G_FLOAT("Focus Y", G_FOCUS_Y, -2, 3, .5);
    G_FLOAT("Focus radius", G_FOCUS_RADIUS, 0, 2, .25);
    G_FLOAT("Focus softness", G_FOCUS_SOFTNESS, .001, 2, .25);
    G_FLOAT("Grain", G_GRAIN, 0, 1, 0);
    AEFX_CLR_STRUCT(def); PF_ADD_POPUP("Animation", 2, 1, "Static|Loop", 3026);
    G_FLOAT("Loop duration (seconds)", G_DURATION, .1, 120, 4);
    G_FLOAT("Phase (degrees)", G_PHASE, -36000, 36000, 0);
    AEFX_CLR_STRUCT(def); PF_ADD_POPUP("Light processing", 2, 1, "Project space|sRGB linear light", 3029);
    const gr::Settings defaults;
    for (int i = 0; i < 8; ++i) {
        char label[32]; const auto& stop = defaults.stops[i];
        std::snprintf(label, sizeof(label), "Stop %d active", i + 1);
        AEFX_CLR_STRUCT(def); PF_ADD_CHECKBOX(label, "", stop.enabled, 0, 3100 + i * 3);
        std::snprintf(label, sizeof(label), "Stop %d color", i + 1);
        AEFX_CLR_STRUCT(def); PF_ADD_COLOR(label, int(stop.color.r * 255 + .5f), int(stop.color.g * 255 + .5f), int(stop.color.b * 255 + .5f), 3101 + i * 3);
        std::snprintf(label, sizeof(label), "Stop %d position", i + 1);
        AEFX_CLR_STRUCT(def); PF_ADD_FLOAT_SLIDERX(label, 0, 1, 0, 1, i < 4 ? i / 3. : 1., PF_Precision_HUNDREDTHS, 0, 0, 3102 + i * 3);
    }
    AEFX_CLR_STRUCT(def);
    def.flags = PF_ParamFlag_CANNOT_TIME_VARY; def.ui_flags = PF_PUI_DISABLED;
    PF_ADD_SLIDER("Schema version", 1, 1, 1, 1, 1, 3999);
    out_data->num_params = G_COUNT;
#undef G_FLOAT
    return PF_Err_NONE;
}

static PF_Err ReadGradient(PF_InData* in, PF_OutData* out, PF_ParamDef* p[], gr::Frame& frame) {
    for (int i = 1; i < G_COUNT; ++i) if (!p[i]) return PF_Err_BAD_CALLBACK_PARAM;
    auto& s = frame.settings;
    s.mode = p[G_MODE]->u.pd.value - 1;
#define G_READ(FIELD, INDEX) s.FIELD = float(p[INDEX]->u.fs_d.value)
    G_READ(centerX,G_CENTER_X); G_READ(centerY,G_CENTER_Y); G_READ(scale,G_SCALE); G_READ(aspect,G_ASPECT);
    G_READ(angle,G_ANGLE); G_READ(cycles,G_CYCLES); G_READ(offset,G_OFFSET); G_READ(depth,G_DEPTH);
    G_READ(depthRadius,G_DEPTH_RADIUS); G_READ(bulge,G_BULGE); G_READ(turbulence,G_TURBULENCE);
    G_READ(turbulenceScale,G_TURBULENCE_SCALE); s.seed = p[G_SEED]->u.sd.value;
    G_READ(glow,G_GLOW); G_READ(glowRadius,G_GLOW_RADIUS); G_READ(glowThreshold,G_GLOW_THRESHOLD);
    G_READ(highlightProtection,G_HIGHLIGHT); G_READ(diffusion,G_DIFFUSION); G_READ(diffusionRadius,G_DIFFUSION_RADIUS);
    G_READ(focusX,G_FOCUS_X); G_READ(focusY,G_FOCUS_Y); G_READ(focusRadius,G_FOCUS_RADIUS);
    G_READ(focusSoftness,G_FOCUS_SOFTNESS); G_READ(grain,G_GRAIN);
    s.animation = p[G_ANIMATION]->u.pd.value - 1;
    G_READ(duration,G_DURATION); G_READ(phase,G_PHASE); s.colorProcessing = p[G_COLOR_PROCESSING]->u.pd.value - 1;
#undef G_READ
    AEFX_SuiteScoper<PF_ColorParamSuite1> colors(in, kPFColorParamSuite, kPFColorParamSuiteVersion1, out);
    for (int i = 0; i < 8; ++i) {
        int index = G_STOP_START + i * 3;
        s.stops[i].enabled = p[index]->u.bd.value != 0;
        PF_PixelFloat color{};
        const PF_Err err = colors->PF_GetFloatingPointColorFromColorDef(in->effect_ref, p[index + 1], &color);
        if (err) return err;
        s.stops[i].color = {color.red, color.green, color.blue, 1};
        s.stops[i].position = float(p[index + 2]->u.fs_d.value);
    }
    frame.layerWidth = std::max(1, in->width); frame.layerHeight = std::max(1, in->height);
    frame.downsampleX = in->downsample_x.den ? float(in->downsample_x.num) / in->downsample_x.den : 1;
    frame.downsampleY = in->downsample_y.den ? float(in->downsample_y.num) / in->downsample_y.den : 1;
    frame.pixelAspect = in->pixel_aspect_ratio.den ? float(in->pixel_aspect_ratio.num) / in->pixel_aspect_ratio.den : 1;
    frame.timeSeconds = in->time_scale ? double(in->current_time) / in->time_scale : 0;
    return PF_Err_NONE;
}
struct GradientFrame { gr::Frame frame; PF_LRect outputRect{}; };
static void DeleteFrame(void* value) { delete static_cast<GradientFrame*>(value); }
static bool Empty(PF_LRect rect) { return rect.right <= rect.left || rect.bottom <= rect.top; }
static PF_LRect Expand(PF_LRect rect, int padding) {
    if (Empty(rect)) return rect;
    const auto coordinate = [](std::int64_t value) { return A_long(std::clamp(value,
        std::int64_t(std::numeric_limits<A_long>::min()), std::int64_t(std::numeric_limits<A_long>::max()))); };
    return {coordinate(std::int64_t(rect.left)-padding), coordinate(std::int64_t(rect.top)-padding),
        coordinate(std::int64_t(rect.right)+padding), coordinate(std::int64_t(rect.bottom)+padding)};
}
static PF_LRect Intersect(PF_LRect a, PF_LRect b) {
    PF_LRect r{std::max(a.left,b.left),std::max(a.top,b.top),std::min(a.right,b.right),std::min(a.bottom,b.bottom)};
    r.right = std::max(r.right,r.left); r.bottom = std::max(r.bottom,r.top); return r;
}
static PF_Err GradientPreRender(PF_InData* in, PF_OutData* out, PF_PreRenderExtra* extra) {
    if (!extra || !extra->input || !extra->output || !extra->cb) return PF_Err_BAD_CALLBACK_PARAM;
    PF_ParamDef values[G_COUNT]{}; PF_ParamDef* params[G_COUNT]{};
    int checked = 0; PF_Err err = PF_Err_NONE;
    for (int i = 1; i < G_COUNT && !err; ++i) {
        err = PF_CHECKOUT_PARAM(in, i, in->current_time, in->time_step, in->time_scale, &values[i]);
        if (!err) { params[i] = &values[i]; checked = i; }
    }
    auto frame = std::make_unique<GradientFrame>();
    if (!err) err = ReadGradient(in,out,params,frame->frame);
    for (int i = 1; i <= checked; ++i) { const auto e = PF_CHECKIN_PARAM(in,&values[i]); if (!err) err = e; }
    if (err) return err;
    const int padding = gr::required_padding(frame->frame);
    PF_RenderRequest request = extra->input->output_request;
    // Every filter has finite support. Include all dependencies of this ROI,
    // including pixels expanded by earlier effects beyond the original layer.
    request.rect = Expand(request.rect,padding); request.channel_mask = PF_ChannelMask_ARGB;
    request.preserve_rgb_of_zero_alpha = TRUE; request.field = PF_Field_FRAME;
    PF_CheckoutResult source{};
    err = extra->cb->checkout_layer(in->effect_ref, G_INPUT, G_INPUT, &request, in->current_time, in->time_step, in->time_scale, &source);
    if (err) return err;
    const auto maximum = Expand(source.max_result_rect,padding);
    frame->outputRect = Empty(source.result_rect) ? PF_LRect{} : Intersect(extra->input->output_request.rect,Expand(source.result_rect,padding));
    extra->output->result_rect = frame->outputRect; extra->output->max_result_rect = maximum;
    extra->output->solid = FALSE;
    if (extra->input->what_gpu == PF_GPU_Framework_METAL && extra->input->gpu_data)
        extra->output->flags |= PF_RenderOutputFlag_GPU_RENDER_POSSIBLE;
    extra->output->pre_render_data = frame.release(); extra->output->delete_pre_render_data_func = DeleteFrame;
    return PF_Err_NONE;
}

static bool Abort(void* context) { auto in = static_cast<PF_InData*>(context); return PF_ABORT(in) != PF_Err_NONE; }
static PF_Err StatusError(gr::Status s) {
    switch(s) { case gr::Status::success: return PF_Err_NONE; case gr::Status::cancelled: return PF_Interrupt_CANCEL;
        case gr::Status::outOfMemory: return PF_Err_OUT_OF_MEMORY; default: return PF_Err_BAD_CALLBACK_PARAM; }
}
template<typename Pixel> static PF_Err RenderCPU(PF_InData* in, const PF_EffectWorld& input, PF_EffectWorld& output,
    const GradientFrame& frame, double maximum, bool smart) {
    if (input.width < 0 || input.height < 0 || output.width < 0 || output.height < 0) return PF_Err_BAD_CALLBACK_PARAM;
    const size_t sourceCount = size_t(input.width)*input.height, targetCount = size_t(output.width)*output.height;
    if ((sourceCount + targetCount) > gr::maxRenderBytes/sizeof(gr::Pixel)/2) return PF_Err_OUT_OF_MEMORY;
    std::vector<gr::Pixel> source(sourceCount), target(targetCount);
    for (int y=0;input.data && y<input.height;++y) {
        if (Abort(in)) return PF_Interrupt_CANCEL;
        const auto row = reinterpret_cast<const Pixel*>(reinterpret_cast<const char*>(input.data)+ptrdiff_t(y)*input.rowbytes);
        for (int x=0;x<input.width;++x) if (row) source[size_t(y)*input.width+x] = {
            float(row[x].red/maximum),float(row[x].green/maximum),float(row[x].blue/maximum),float(row[x].alpha/maximum)};
    }
    const int sx = smart ? input.origin_x : -in->pre_effect_source_origin_x, sy = smart ? input.origin_y : -in->pre_effect_source_origin_y;
    const int dx = smart ? frame.outputRect.left : sx-in->output_origin_x, dy = smart ? frame.outputRect.top : sy-in->output_origin_y;
    auto err = StatusError(gr::render_cpu({source.data(),int(input.width),int(input.height),input.width,sx,sy},
        {target.data(),int(output.width),int(output.height),output.width,dx,dy},frame.frame,Abort,in));
    if (err) return err;
    const auto channel = [maximum](float value) {
        if constexpr (std::is_same_v<Pixel,PF_PixelFloat>) return std::isfinite(value) ? value : 0.f;
        else return float(std::round(std::max(0.,std::min(maximum,double(value)*maximum))));
    };
    for(int y=0;y<output.height;++y) {
        auto row=reinterpret_cast<Pixel*>(reinterpret_cast<char*>(output.data)+ptrdiff_t(y)*output.rowbytes);
        for(int x=0;x<output.width;++x) { const auto& p=target[size_t(y)*output.width+x];
            row[x].red=channel(p.r); row[x].green=channel(p.g); row[x].blue=channel(p.b); row[x].alpha=channel(p.a); }
    }
    return PF_Err_NONE;
}
struct GPUMemoryContext { PF_InData* in; const PF_GPUDeviceSuite1* suite; A_u_long device; PF_Err error = PF_Err_NONE; };
static void* AllocateGPU(void* context,size_t bytes) { auto& c=*static_cast<GPUMemoryContext*>(context); void* buffer=nullptr;
    c.error=c.suite->AllocateDeviceMemory(c.in->effect_ref,c.device,bytes,&buffer); return c.error ? nullptr : buffer; }
static void ReleaseGPU(void* context,void* buffer) { auto& c=*static_cast<GPUMemoryContext*>(context); c.suite->FreeDeviceMemory(c.in->effect_ref,c.device,buffer); }
static PF_Err GradientRender(PF_InData* in, PF_OutData* out, PF_EffectWorld* input, PF_EffectWorld* output,
    const GradientFrame& frame, PF_SmartRenderExtra* extra = nullptr, bool gpu = false) {
    if (!input || !output || (!output->data && !gpu && output->width && output->height)) return PF_Err_BAD_CALLBACK_PARAM;
    if (!output->width || !output->height) return PF_Err_NONE;
    AEFX_SuiteScoper<PF_WorldSuite2> world(in,kPFWorldSuite,kPFWorldSuiteVersion2,out);
    PF_PixelFormat format, destFormat; PF_Err err=world->PF_GetPixelFormat(input,&format);
    if (!err) err=world->PF_GetPixelFormat(output,&destFormat);
    if (err) return err; if (format!=destFormat) return PF_Err_BAD_CALLBACK_PARAM;
    if (gpu) {
        if (!extra || extra->input->what_gpu!=PF_GPU_Framework_METAL || format!=PF_PixelFormat_GPU_BGRA128) return PF_Err_BAD_CALLBACK_PARAM;
        AEFX_SuiteScoper<PF_GPUDeviceSuite1> suite(in,kPFGPUDeviceSuite,kPFGPUDeviceSuiteVersion1,out);
        PF_GPUDeviceInfo info{}; err=suite->GetDeviceInfo(in->effect_ref,extra->input->device_index,&info);
        void *src=nullptr,*dst=nullptr;
        if (!err) err=suite->GetGPUWorldData(in->effect_ref,input,&src);
        if (!err) err=suite->GetGPUWorldData(in->effect_ref,output,&dst);
        if (err) return err;
        GPUMemoryContext memory{in,suite.operator->(),extra->input->device_index}; std::string message;
        auto status=gr::render_metal(static_cast<gr::MetalBackend*>(const_cast<void*>(extra->input->gpu_data)),info.command_queuePV,
            {src,int(input->width),int(input->height),size_t(input->rowbytes),int(input->origin_x),int(input->origin_y)},
            {dst,int(output->width),int(output->height),size_t(output->rowbytes),int(frame.outputRect.left),int(frame.outputRect.top)},
            frame.frame,{&memory,AllocateGPU,ReleaseGPU},&message,Abort,in);
        if (!message.empty()) std::snprintf(out->return_msg,sizeof(out->return_msg),"%s",message.c_str());
        return memory.error ? memory.error : StatusError(status);
    }
    switch(format) {
        case PF_PixelFormat_ARGB32: return RenderCPU<PF_Pixel8>(in,*input,*output,frame,PF_MAX_CHAN8,extra!=nullptr);
        case PF_PixelFormat_ARGB64: return RenderCPU<PF_Pixel16>(in,*input,*output,frame,PF_MAX_CHAN16,extra!=nullptr);
        case PF_PixelFormat_ARGB128: return RenderCPU<PF_PixelFloat>(in,*input,*output,frame,1,extra!=nullptr);
        default: return PF_Err_BAD_CALLBACK_PARAM;
    }
}
static PF_Err GradientSmartRender(PF_InData* in, PF_OutData* out, PF_SmartRenderExtra* extra,bool gpu) {
#ifdef MOTION_GRADIENT_QA_TRACE
    GradientTraceScope traceScope(gpu,in->current_time);
#endif
    if (!extra || !extra->input || !extra->input->pre_render_data) return PF_Err_BAD_CALLBACK_PARAM;
    PF_EffectWorld *input=nullptr,*output=nullptr;
    PF_Err err=extra->cb->checkout_layer_pixels(in->effect_ref,G_INPUT,&input); if(err)return err;
    struct Checkin { PF_InData* in; PF_SmartRenderExtra* extra; ~Checkin(){extra->cb->checkin_layer_pixels(in->effect_ref,G_INPUT);} } checkin{in,extra};
    err=extra->cb->checkout_output(in->effect_ref,&output);
    if (!err) err=GradientRender(in,out,input,output,*static_cast<const GradientFrame*>(extra->input->pre_render_data),extra,gpu);
    GradientTrace("smart-render",gpu,0,input,output,err);
    return err;
}
extern "C" DllExport PF_Err GradientMain(PF_Cmd cmd,PF_InData* in,PF_OutData* out,PF_ParamDef* params[],PF_LayerDef* output,void* extra) {
    try {
        switch(cmd) {
            case PF_Cmd_ABOUT: std::snprintf(out->return_msg,sizeof(out->return_msg),"Moti.on Gradient 1.0\rEditable gradients, depth, glow and optical diffusion. CPU / Metal.");return PF_Err_NONE;
            case PF_Cmd_GLOBAL_SETUP: out->my_version=MOTION_GRADIENT_VERSION;out->out_flags=MOTION_GRADIENT_FLAGS;out->out_flags2=MOTION_GRADIENT_FLAGS2;return PF_Err_NONE;
            case PF_Cmd_PARAMS_SETUP:return GradientParams(in,out);
            case PF_Cmd_SMART_PRE_RENDER:return GradientPreRender(in,out,static_cast<PF_PreRenderExtra*>(extra));
            case PF_Cmd_SMART_RENDER:return GradientSmartRender(in,out,static_cast<PF_SmartRenderExtra*>(extra),false);
            case PF_Cmd_SMART_RENDER_GPU:return GradientSmartRender(in,out,static_cast<PF_SmartRenderExtra*>(extra),true);
            case PF_Cmd_FRAME_SETUP: {
                if (!params || !params[0]) return PF_Err_BAD_CALLBACK_PARAM;
                gr::Frame frame; auto err=ReadGradient(in,out,params,frame); if(err)return err;
                const int padding=gr::required_padding(frame);
                const std::int64_t width=std::int64_t(params[0]->u.ld.width)+2*padding;
                const std::int64_t height=std::int64_t(params[0]->u.ld.height)+2*padding;
                if(width<0 || height<0 || width>std::numeric_limits<A_long>::max() || height>std::numeric_limits<A_long>::max())return PF_Err_OUT_OF_MEMORY;
                out->width=A_long(width);out->height=A_long(height);
                out->origin.h=A_short(padding);out->origin.v=A_short(padding);return PF_Err_NONE;
            }
            case PF_Cmd_GPU_DEVICE_SETUP: {
                auto e=static_cast<PF_GPUDeviceSetupExtra*>(extra);
                out->out_flags2 &= ~PF_OutFlag2_SUPPORTS_GPU_RENDER_F32;
                if (!e || !e->input || !e->output) return PF_Err_BAD_CALLBACK_PARAM;
                e->output->gpu_data=nullptr;
                if (e->input->what_gpu!=PF_GPU_Framework_METAL) return PF_Err_NONE;
                AEFX_SuiteScoper<PF_GPUDeviceSuite1> suite(in,kPFGPUDeviceSuite,kPFGPUDeviceSuiteVersion1,out);
                PF_GPUDeviceInfo info{};auto err=suite->GetDeviceInfo(in->effect_ref,e->input->device_index,&info);if(err)return err;
                if(!info.compatibleB || !info.devicePV || !info.command_queuePV)return PF_Err_NONE;
                e->output->gpu_data=gr::create_metal_backend(info.devicePV);
                if(e->output->gpu_data)out->out_flags2|=PF_OutFlag2_SUPPORTS_GPU_RENDER_F32;return PF_Err_NONE;
            }
            case PF_Cmd_GPU_DEVICE_SETDOWN: {auto e=static_cast<PF_GPUDeviceSetdownExtra*>(extra);if(e && e->input)gr::destroy_metal_backend(static_cast<gr::MetalBackend*>(e->input->gpu_data));return PF_Err_NONE;}
            case PF_Cmd_RENDER: {
                if(!params || !params[0])return PF_Err_BAD_CALLBACK_PARAM;
                GradientFrame f;auto err=ReadGradient(in,out,params,f.frame);if(err)return err;
                return GradientRender(in,out,&params[0]->u.ld,output,f);
            }
            default:return PF_Err_NONE;
        }
    } catch(const std::bad_alloc&){return PF_Err_OUT_OF_MEMORY;}catch(PF_Err e){return e;}catch(...){return PF_Err_INTERNAL_STRUCT_DAMAGED;}
}
