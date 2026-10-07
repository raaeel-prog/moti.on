// This single source is compiled as C++ and embedded as Metal source. Keep its
// arithmetic float-only and its structs plain: CPU/GPU share the exact formulas.
GRADIENT_CODE(
struct GPixel { float r, g, b, a; };
struct GStop { float r, g, b, position; };
struct GParams {
    GStop stops[8];
    int stopCount, mode, colorProcessing, seed;
    int width, height, originX, originY;
    float layerWidth, layerHeight, dx, dy, pixelAspect;
    float centerX, centerY, scale, aspect, cosine, sine, cycles, offset;
    float depth, bulge, turbulence, turbulenceScale;
    float glow, glowThreshold, highlightProtection, diffusion;
    float focusX, focusY, focusRadius, focusSoftness, grain;
    float loopPhase, loopCos, loopSin;
};
inline float g_clamp(float x, float lo, float hi) { return fmin(hi, fmax(lo,x)); }
inline float g_smooth(float x) { x=g_clamp(x,0.f,1.f); return x*x*(3.f-2.f*x); }
inline float g_mix(float a,float b,float t) { return a+(b-a)*t; }
inline GPixel g_zero() { return {0,0,0,0}; }
inline GPixel g_add(GPixel a,GPixel b) { return {a.r+b.r,a.g+b.g,a.b+b.b,a.a+b.a}; }
inline GPixel g_sub(GPixel a,GPixel b) { return {a.r-b.r,a.g-b.g,a.b-b.b,a.a-b.a}; }
inline GPixel g_mul(GPixel a,float x) { return {a.r*x,a.g*x,a.b*x,a.a*x}; }
inline GPixel g_lerp(GPixel a,GPixel b,float t) { return g_add(a,g_mul(g_sub(b,a),t)); }
inline uint g_hash(uint x) { x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; return x^(x>>16); }
inline float g_random(int x,int y,uint seed) {
    uint v=g_hash(uint(x)*0x9e3779b9u ^ uint(y)*0x85ebca6bu ^ seed);
    return float(v>>8)*(1.f/16777216.f);
}
inline float g_noise(float x,float y,uint seed) {
    int ix=int(floor(x)), iy=int(floor(y));
    float fx=g_smooth(x-float(ix)),fy=g_smooth(y-float(iy));
    return g_mix(g_mix(g_random(ix,iy,seed),g_random(ix+1,iy,seed),fx),
                 g_mix(g_random(ix,iy+1,seed),g_random(ix+1,iy+1,seed),fx),fy)*2.f-1.f;
}
inline float g_decode(float x) {
    float v=fabs(x), o=v<=.04045f?v/12.92f:pow((v+.055f)/1.055f,2.4f);
    return x<0?-o:o;
}
inline float g_encode(float x) {
    float v=fabs(x), o=v<=.0031308f?v*12.92f:1.055f*pow(v,1.f/2.4f)-.055f;
    return x<0?-o:o;
}
inline GPixel g_palette(GParams p,float t) {
    // The native stops keep their original 0..1 positions. Continue that path
    // in reverse on 1..2 instead of jumping from the last color to the first.
    // Smoothstep gives zero slope at both turns, including distinct HDR ends.
    t=t-floor(t*.5f)*2.f;
    if(t>1.f) t=2.f-t;
    GStop a=p.stops[0],b=p.stops[p.stopCount-1];
    if(t<=a.position) b=a;
    else if(t>=b.position) a=b;
    else {
        for(int i=1;i<p.stopCount;i++) {
            if(t<p.stops[i].position) { a=p.stops[i-1];b=p.stops[i];break; }
        }
    }
    float amount=b.position>a.position?g_smooth((t-a.position)/(b.position-a.position)):0.f;
    return {g_mix(a.r,b.r,amount),g_mix(a.g,b.g,amount),g_mix(a.b,b.b,amount),1};
}
inline GPixel g_base(GParams p,int x,int y,float alpha,float blurredAlpha) {
    if(alpha<=0) return g_zero();
    float fx=(float(x)+.5f)/p.dx,fy=(float(y)+.5f)/p.dy;
    float extent=fmax(1.f,fmin(p.layerWidth*p.pixelAspect,p.layerHeight));
    float nx=(fx-p.centerX*p.layerWidth)*p.pixelAspect/(extent*p.scale*p.aspect);
    float ny=(fy-p.centerY*p.layerHeight)/(extent*p.scale);
    float rx=nx*p.cosine+ny*p.sine,ry=-nx*p.sine+ny*p.cosine;
    float radial=sqrt(rx*rx+ry*ry);
    float t=rx+.5f;
    if(p.mode==1) t=radial;
    else if(p.mode==2) {
        float angular=atan2(ry,rx)*.15915494309189535f+.5f;
        // Fold the angle before repetition, so the +/-pi branch agrees even
        // with fractional cycles, offset, depth or turbulence.
        t=1.f-fabs(angular*2.f-1.f);
    }
    float noise=g_noise(fx/p.turbulenceScale+p.loopCos*1.7f,
                        fy/p.turbulenceScale+p.loopSin*1.7f,uint(p.seed));
    noise+=.5f*g_noise(fx*2.f/p.turbulenceScale-p.loopSin,
                      fy*2.f/p.turbulenceScale+p.loopCos,uint(p.seed)^0x68bc21ebu);
    float bulge=p.bulge*fmax(0.f,1.f-radial*radial*4.f);
    float depth=p.depth*(alpha-blurredAlpha);
    t=(t+bulge+depth+noise*p.turbulence*.25f)*p.cycles+p.offset+p.loopPhase*2.f;
    return g_mul(g_palette(p,t),g_clamp(alpha,0.f,1.f));
}
inline float g_focus(GParams p,int x,int y) {
    float fx=(float(x)+.5f)/p.dx-p.focusX*p.layerWidth;
    float fy=(float(y)+.5f)/p.dy-p.focusY*p.layerHeight;
    float extent=fmax(1.f,fmin(p.layerWidth*p.pixelAspect,p.layerHeight));
    float distance=sqrt(fx*fx*p.pixelAspect*p.pixelAspect+fy*fy)/extent;
    return p.diffusion*g_smooth((distance-p.focusRadius)/p.focusSoftness);
}
inline GPixel g_extract(GParams p,GPixel color) {
    if(color.a<=0) return g_zero();
    float maximum=fmax(0.f,fmax(color.r,fmax(color.g,color.b))/color.a);
    float factor=maximum>p.glowThreshold?(maximum-p.glowThreshold)/fmax(maximum,.000001f):0.f;
    return g_mul(color,factor);
}
inline GPixel g_finish(GParams p,GPixel base,GPixel halo,int x,int y) {
    // Coverage-weighted protection remains continuous at transparent edges;
    // dividing by a nearly-zero blurred alpha would amplify rounding noise.
    float energy=fmax(0.f,fmax(base.r,fmax(base.g,base.b)));
    float gain=p.glow/(1.f+p.highlightProtection*energy);
    GPixel out=g_add(base,g_mul(halo,gain));
    out.a=g_clamp(base.a+(1.f-base.a)*g_clamp(halo.a*gain,0.f,1.f),0.f,1.f);
    if(out.a<=0) return g_zero();
    if(p.colorProcessing==1) {
        out.r=g_encode(out.r/out.a)*out.a;
        out.g=g_encode(out.g/out.a)*out.a;
        out.b=g_encode(out.b/out.a)*out.a;
    }
    if(p.grain>0) {
        int ix=int(floor((float(x)+.5f)/p.dx)),iy=int(floor((float(y)+.5f)/p.dy));
        float n1=g_random(ix,iy,uint(p.seed)^0x34ab26e1u)*2.f-1.f;
        float n2=g_random(ix,iy,uint(p.seed)^0x85e01249u)*2.f-1.f;
        float grain=(n1*p.loopCos+n2*p.loopSin)*p.grain*.12f*out.a;
        out.r+=grain;out.g+=grain;out.b+=grain;
    }
    return out;
}
)
