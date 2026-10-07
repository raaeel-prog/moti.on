#ifndef MOTION_GRADIENT_METAL_SOURCE_H
#define MOTION_GRADIENT_METAL_SOURCE_H

static constexpr const char* gradientMetalMath =
#define GRADIENT_CODE(...) #__VA_ARGS__
#include "GradientMath.inc"
#undef GRADIENT_CODE
;
static constexpr const char* gradientMetalKernels = R"METAL(
struct GView { int width,height,originX,originY,stride; };
struct GBlur { int radius,vertical; };
inline float source_alpha(device const float4* source,GView v,int x,int y) {
    int rx=x-v.originX,ry=y-v.originY;
    if(rx<0||ry<0||rx>=v.width||ry>=v.height)return 0;
    float alpha=source[ry*v.stride+rx].a;
    return isfinite(alpha)?g_clamp(alpha,0.f,1.f):0.f;
}
kernel void gradient_alpha(device const float4* source [[buffer(0)]],device GPixel* out [[buffer(1)]],
                           constant GView& v [[buffer(2)]],constant GParams& p [[buffer(3)]],uint i [[thread_position_in_grid]]) {
    if(i>=uint(p.width*p.height))return;
    int x=int(i)%p.width+p.originX,y=int(i)/p.width+p.originY;
    out[i]={0,0,0,source_alpha(source,v,x,y)};
}
kernel void gradient_base(device const float4* source [[buffer(0)]],device const GPixel* depth [[buffer(1)]],
                          device GPixel* out [[buffer(2)]],constant GView& v [[buffer(3)]],
                          constant GParams& p [[buffer(4)]],uint i [[thread_position_in_grid]]) {
    if(i>=uint(p.width*p.height))return;
    int x=int(i)%p.width+p.originX,y=int(i)/p.width+p.originY;
    out[i]=g_base(p,x,y,source_alpha(source,v,x,y),depth[i].a);
}
kernel void gradient_box(device const GPixel* src [[buffer(0)]],device GPixel* dst [[buffer(1)]],
                         constant GParams& p [[buffer(2)]],constant GBlur& b [[buffer(3)]],uint line [[thread_position_in_grid]]) {
    int lines=b.vertical?p.width:p.height,length=b.vertical?p.height:p.width,r=b.radius;
    if(line>=uint(lines))return;
    GPixel sum={0,0,0,0};float inverse=1.f/float(2*r+1);
    for(int pos=0;pos<length;pos++) {
        if((pos&127)==0) {
            sum=g_zero();
            for(int n=max(0,pos-r);n<=min(length-1,pos+r);n++)
                sum=g_add(sum,src[b.vertical?n*p.width+line:line*p.width+n]);
        } else {
            int add=pos+r,sub=pos-r-1;
            if(add<length)sum=g_add(sum,src[b.vertical?add*p.width+line:line*p.width+add]);
            if(sub>=0)sum=g_sub(sum,src[b.vertical?sub*p.width+line:line*p.width+sub]);
        }
        dst[b.vertical?pos*p.width+line:line*p.width+pos]=g_mul(sum,inverse);
    }
}
kernel void gradient_copy(device const GPixel* src [[buffer(0)]],device GPixel* dst [[buffer(1)]],
                          constant GParams& p [[buffer(2)]],uint i [[thread_position_in_grid]]) {
    if(i<uint(p.width*p.height))dst[i]=src[i];
}
kernel void gradient_diffusion(device GPixel* base [[buffer(0)]],device const GPixel* blurred [[buffer(1)]],
                               constant GParams& p [[buffer(2)]],uint i [[thread_position_in_grid]]) {
    if(i>=uint(p.width*p.height))return;
    int x=int(i)%p.width+p.originX,y=int(i)/p.width+p.originY;
    base[i]=g_lerp(base[i],blurred[i],g_focus(p,x,y));
}
kernel void gradient_extract(device const GPixel* base [[buffer(0)]],device GPixel* work [[buffer(1)]],
                             device GPixel* halo [[buffer(2)]],constant GParams& p [[buffer(3)]],uint i [[thread_position_in_grid]]) {
    if(i>=uint(p.width*p.height))return;
    halo[i]=g_zero();work[i]=g_extract(p,base[i]);
}
kernel void gradient_accumulate(device GPixel* halo [[buffer(0)]],device const GPixel* work [[buffer(1)]],
                                constant GParams& p [[buffer(2)]],constant float& weight [[buffer(3)]],uint i [[thread_position_in_grid]]) {
    if(i<uint(p.width*p.height))halo[i]=g_add(halo[i],g_mul(work[i],weight));
}
kernel void gradient_finish(device const GPixel* base [[buffer(0)]],device const GPixel* halo [[buffer(1)]],
                            device float4* output [[buffer(2)]],constant GView& v [[buffer(3)]],
                            constant GParams& p [[buffer(4)]],constant int& pad [[buffer(5)]],uint i [[thread_position_in_grid]]) {
    if(i>=uint(v.width*v.height))return;
    int x=int(i)%v.width,y=int(i)/v.width,index=(y+pad)*p.width+x+pad;
    GPixel out=g_finish(p,base[index],p.glow>0?halo[index]:g_zero(),x+v.originX,y+v.originY);
    output[y*v.stride+x]=float4(out.b,out.g,out.r,out.a);
}
)METAL";
#endif
