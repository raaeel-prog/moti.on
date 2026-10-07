#ifndef MOTION_GRADIENT_KERNEL_H
#define MOTION_GRADIENT_KERNEL_H

#include <algorithm>
#include <array>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <new>
#include <vector>

namespace motion::gradient {

// All image values are normalized premultiplied RGBA, including HDR/negative RGB.
struct Pixel { float r = 0, g = 0, b = 0, a = 0; };
struct Stop { bool enabled = false; Pixel color{}; float position = 0; };
struct Settings {
    std::array<Stop, 8> stops{{
        {true, {.025f,.035f,.12f,1}, 0},
        {true, {.16f,.12f,.85f,1}, 1.f/3},
        {true, {.98f,.28f,.45f,1}, 2.f/3},
        {true, {1,.84f,.66f,1}, 1},
        {false, {1,.84f,.66f,1}, 1}, {false, {1,.84f,.66f,1}, 1},
        {false, {1,.84f,.66f,1}, 1}, {false, {1,.84f,.66f,1}, 1}}};
    int mode = 0;
    float centerX = .5f, centerY = .5f, scale = 1, aspect = 1, angle = 0;
    float cycles = 1, offset = 0, depth = .25f, depthRadius = 40, bulge = .2f;
    float turbulence = .15f, turbulenceScale = 200;
    std::uint32_t seed = 1;
    float glow = .35f, glowRadius = 32, glowThreshold = .6f, highlightProtection = .5f;
    float diffusion = 0, diffusionRadius = 30;
    float focusX = .5f, focusY = .5f, focusRadius = .25f, focusSoftness = .25f;
    float grain = 0;
    int animation = 0;
    float duration = 4, phase = 0;
    int colorProcessing = 0;
};
struct Frame {
    Settings settings{};
    int layerWidth = 1, layerHeight = 1; // full-resolution dimensions
    float pixelAspect = 1, downsampleX = 1, downsampleY = 1;
    double timeSeconds = 0;
};
struct Rect { int left = 0, top = 0, right = 0, bottom = 0; };
struct ConstImage {
    const Pixel* data = nullptr;
    int width = 0, height = 0;
    std::ptrdiff_t stridePixels = 0;
    int originX = 0, originY = 0;
};
struct Image {
    Pixel* data = nullptr;
    int width = 0, height = 0;
    std::ptrdiff_t stridePixels = 0;
    int originX = 0, originY = 0;
};
enum class Status { success, cancelled, outOfMemory, unsupported, failure };
using AbortFn = bool (*)(void*); // true requests cooperative cancellation
constexpr std::size_t maxRenderBytes = std::size_t(2) * 1024 * 1024 * 1024;

// Conservative dependency/output padding, in downsampled layer pixels.
inline int required_padding(const Frame& frame);
inline Status render_cpu(ConstImage source, Image destination, const Frame& frame,
                         AbortFn abort = nullptr, void* abortContext = nullptr);

namespace detail {
using uint = std::uint32_t;
using std::fmin; using std::fmax; using std::fabs; using std::floor;
using std::pow; using std::sqrt; using std::atan2;
#define GRADIENT_CODE(...) __VA_ARGS__
#include "GradientMath.inc"
#undef GRADIENT_CODE
static_assert(sizeof(GPixel)==sizeof(Pixel), "Gradient pixel layout");
inline float finite(float v,float fallback,float lo,float hi) {
    return std::isfinite(v)?std::max(lo,std::min(hi,v)):fallback;
}
inline GParams prepare(const Frame& f,int w,int h,int ox,int oy) {
    const auto& s=f.settings;GParams p{};
    for(const auto& stop:s.stops) if(stop.enabled) {
        auto& d=p.stops[p.stopCount++];
        d={finite(stop.color.r,0,-16,64),finite(stop.color.g,0,-16,64),finite(stop.color.b,0,-16,64),finite(stop.position,0,0,1)};
    }
    if(!p.stopCount) {p.stopCount=1;p.stops[0]={0,0,0,0};}
    std::stable_sort(p.stops,p.stops+p.stopCount,[](const GStop& a,const GStop& b){return a.position<b.position;});
    p.mode=std::max(0,std::min(2,s.mode));p.colorProcessing=s.colorProcessing==1;
    if(p.colorProcessing) for(int i=0;i<p.stopCount;i++) {
        p.stops[i].r=g_decode(p.stops[i].r);p.stops[i].g=g_decode(p.stops[i].g);p.stops[i].b=g_decode(p.stops[i].b);
    }
    p.seed=int(std::min(s.seed,1000000u));p.width=w;p.height=h;p.originX=ox;p.originY=oy;
    p.layerWidth=float(std::max(1,f.layerWidth));p.layerHeight=float(std::max(1,f.layerHeight));
    p.dx=finite(f.downsampleX,1,.0001f,1);p.dy=finite(f.downsampleY,1,.0001f,1);
    p.pixelAspect=finite(f.pixelAspect,1,.01f,100);
    p.centerX=finite(s.centerX,.5f,-2,3);p.centerY=finite(s.centerY,.5f,-2,3);
    p.scale=finite(s.scale,1,.01f,10);p.aspect=finite(s.aspect,1,.1f,10);
    float angle=finite(s.angle,0,-360000,360000)*.017453292519943295f;
    p.cosine=std::cos(angle);p.sine=std::sin(angle);
    p.cycles=finite(s.cycles,1,.1f,20);p.offset=finite(s.offset,0,-100,100);
    p.depth=finite(s.depth,.25f,0,2);p.bulge=finite(s.bulge,.2f,-2,2);
    p.turbulence=finite(s.turbulence,.15f,0,2);p.turbulenceScale=finite(s.turbulenceScale,200,1,2000);
    p.glow=finite(s.glow,.35f,0,5);p.glowThreshold=finite(s.glowThreshold,.6f,0,10);
    p.highlightProtection=finite(s.highlightProtection,.5f,0,1);p.diffusion=finite(s.diffusion,0,0,1);
    p.focusX=finite(s.focusX,.5f,-2,3);p.focusY=finite(s.focusY,.5f,-2,3);
    p.focusRadius=finite(s.focusRadius,.25f,0,2);p.focusSoftness=finite(s.focusSoftness,.25f,.001f,2);
    p.grain=finite(s.grain,0,0,1);
    double phase=double(finite(s.phase,0,-360000,360000))/360.;
    if(s.animation==1 && std::isfinite(f.timeSeconds)) phase+=std::fmod(f.timeSeconds,double(finite(s.duration,4,.1f,120)))/finite(s.duration,4,.1f,120);
    phase-=std::floor(phase);p.loopPhase=float(phase);
    p.loopCos=float(std::cos(phase*6.283185307179586));p.loopSin=float(std::sin(phase*6.283185307179586));
    return p;
}
inline int radius(float r,float ds) {return int(std::ceil(finite(r,0,0,500)*finite(ds,1,.0001f,1)/3.f));}
inline bool image_valid(int width,int height,std::ptrdiff_t stride,const void* data) {
    if(width<0||height<0||width>131072||height>131072)return false;
    if(width==0||height==0)return true;
    if(!data||stride==std::numeric_limits<std::ptrdiff_t>::min()||std::abs(stride)<width)return false;
    // Prevent signed pointer-offset overflow before reading untrusted geometry.
    return std::abs(stride)<=(std::numeric_limits<std::ptrdiff_t>::max()/sizeof(Pixel)-width)/std::max(1,height);
}
inline GPixel read(ConstImage src,int x,int y) {
    const auto rx=std::int64_t(x)-src.originX,ry=std::int64_t(y)-src.originY;
    if(!src.data||rx<0||ry<0||rx>=src.width||ry>=src.height) return g_zero();
    const Pixel p=src.data[ry*src.stridePixels+rx];
    return {p.r,p.g,p.b,std::isfinite(p.a)?g_clamp(p.a,0,1):0};
}
inline bool cancelled(AbortFn abort,void* context) {return abort && abort(context);}
// Each scan rebases every 128 pixels. That bounds floating summation drift and
// makes tiled and full-frame results agree while retaining O(N) work.
inline Status box(const std::vector<GPixel>& in,std::vector<GPixel>& out,int w,int h,int r,bool vertical,AbortFn abort,void* ctx) {
    const int lines=vertical?w:h,length=vertical?h:w;
    const float inverse=1.f/float(2*r+1);
    for(int line=0;line<lines;line++) {
        if((line&31)==0 && cancelled(abort,ctx))return Status::cancelled;
        GPixel sum{};
        for(int pos=0;pos<length;pos++) {
            if((pos&127)==0) {
                sum={};
                for(int n=std::max(0,pos-r);n<=std::min(length-1,pos+r);n++)
                    sum=g_add(sum,in[vertical?std::size_t(n)*w+line:std::size_t(line)*w+n]);
            } else {
                int add=pos+r,sub=pos-r-1;
                if(add<length)sum=g_add(sum,in[vertical?std::size_t(add)*w+line:std::size_t(line)*w+add]);
                if(sub>=0)sum=g_sub(sum,in[vertical?std::size_t(sub)*w+line:std::size_t(line)*w+sub]);
            }
            out[vertical?std::size_t(pos)*w+line:std::size_t(line)*w+pos]=g_mul(sum,inverse);
        }
    }
    return Status::success;
}
inline Status blur_round(std::vector<GPixel>& image,std::vector<GPixel>& temp,int w,int h,int rx,int ry,AbortFn abort,void* ctx) {
    auto status=box(image,temp,w,h,rx,false,abort,ctx);if(status!=Status::success)return status;
    return box(temp,image,w,h,ry,true,abort,ctx);
}
inline bool geometry(Image dest,int padding,int& w,int& h,int& ox,int& oy,std::size_t& count) {
    const std::int64_t ww=std::int64_t(dest.width)+2*padding,hh=std::int64_t(dest.height)+2*padding;
    const std::int64_t xx=std::int64_t(dest.originX)-padding,yy=std::int64_t(dest.originY)-padding;
    if(ww<=0||hh<=0||ww>131072||hh>131072||xx<std::numeric_limits<int>::min()||yy<std::numeric_limits<int>::min()||
       xx+ww>std::numeric_limits<int>::max()||yy+hh>std::numeric_limits<int>::max()) return false;
    count=std::size_t(ww)*std::size_t(hh);
    if(count>maxRenderBytes/(sizeof(GPixel)*4))return false;
    w=int(ww);h=int(hh);ox=int(xx);oy=int(yy);return true;
}
} // namespace detail

inline int required_padding(const Frame& f) {
    const auto& s=f.settings;
    const float ds=std::max(detail::finite(f.downsampleX,1,.0001f,1),detail::finite(f.downsampleY,1,.0001f,1));
    int radius=0;
    if(detail::finite(s.depth,.25f,0,2)>0)radius+=3*detail::radius(s.depthRadius,ds);
    if(detail::finite(s.diffusion,0,0,1)>0)radius+=3*detail::radius(s.diffusionRadius,ds);
    if(detail::finite(s.glow,.35f,0,5)>0)radius+=3*detail::radius(s.glowRadius,ds);
    return radius;
}
inline Status render_cpu(ConstImage source,Image dest,const Frame& f,AbortFn abort,void* ctx) {
    using namespace detail;
    if(!image_valid(source.width,source.height,source.stridePixels,source.data)||
       !image_valid(dest.width,dest.height,dest.stridePixels,dest.data))return Status::failure;
    if(dest.width==0||dest.height==0)return Status::success;
    if(cancelled(abort,ctx))return Status::cancelled;
    const int pad=required_padding(f);int w,h,ox,oy;std::size_t count;
    if(!geometry(dest,pad,w,h,ox,oy,count))return Status::outOfMemory;
    try {
        auto p=prepare(f,w,h,ox,oy);
        std::vector<GPixel> base(count),work(count),temp(count),halo(count);
        for(int y=0;y<h;y++) {
            if((y&31)==0 && cancelled(abort,ctx))return Status::cancelled;
            for(int x=0;x<w;x++)work[std::size_t(y)*w+x]={0,0,0,read(source,x+ox,y+oy).a};
        }
        if(p.depth>0)for(int i=0;i<3;i++) {
            auto status=blur_round(work,temp,w,h,radius(f.settings.depthRadius,p.dx),radius(f.settings.depthRadius,p.dy),abort,ctx);
            if(status!=Status::success)return status;
        }
        for(int y=0;y<h;y++) {
            if((y&31)==0 && cancelled(abort,ctx))return Status::cancelled;
            for(int x=0;x<w;x++) {
                const auto i=std::size_t(y)*w+x;
                base[i]=g_base(p,x+ox,y+oy,read(source,x+ox,y+oy).a,work[i].a);
            }
        }
        if(p.diffusion>0) {
            work=base;
            for(int i=0;i<3;i++) {
                auto status=blur_round(work,temp,w,h,radius(f.settings.diffusionRadius,p.dx),radius(f.settings.diffusionRadius,p.dy),abort,ctx);
                if(status!=Status::success)return status;
            }
            for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
                const auto i=std::size_t(y)*w+x;base[i]=g_lerp(base[i],work[i],g_focus(p,x+ox,y+oy));
            }
        }
        if(p.glow>0) {
            for(std::size_t i=0;i<count;i++)work[i]=g_extract(p,base[i]);
            for(int pass=0;pass<3;pass++) {
                auto status=blur_round(work,temp,w,h,radius(f.settings.glowRadius,p.dx),radius(f.settings.glowRadius,p.dy),abort,ctx);
                if(status!=Status::success)return status;
                const float weight=pass==0?.5f:pass==1?.3f:.2f;
                for(std::size_t i=0;i<count;i++)halo[i]=g_add(halo[i],g_mul(work[i],weight));
            }
        }
        for(int y=0;y<dest.height;y++) {
            if((y&31)==0 && cancelled(abort,ctx))return Status::cancelled;
            for(int x=0;x<dest.width;x++) {
                const auto i=std::size_t(y+pad)*w+x+pad;
                const auto out=g_finish(p,base[i],halo[i],x+dest.originX,y+dest.originY);
                dest.data[std::ptrdiff_t(y)*dest.stridePixels+x]={out.r,out.g,out.b,out.a};
            }
        }
        return Status::success;
    } catch(const std::bad_alloc&) {return Status::outOfMemory;}
      catch(...) {return Status::failure;}
}

} // namespace motion::gradient
#endif
