#include "GradientKernel.h"
#include <cassert>
#include <chrono>
#include <future>
#include <iostream>
#include <string>

using namespace motion::gradient;
static std::vector<Pixel> fixture(int w,int h) {
    std::vector<Pixel> v(std::size_t(w)*h);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
        float dx=(x-w*.5f)/(w*.28f),dy=(y-h*.5f)/(h*.31f);
        float a=std::max(0.f,std::min(1.f,(1.f-std::sqrt(dx*dx+dy*dy))*8));
        v[std::size_t(y)*w+x]={a*.5f,a*.2f,a*.8f,a};
    }return v;
}
static float difference(const std::vector<Pixel>& a,const std::vector<Pixel>& b) {
    assert(a.size()==b.size());float maximum=0;
    for(std::size_t i=0;i<a.size();i++) {
        const float* x=&a[i].r;const float* y=&b[i].r;
        for(int c=0;c<4;c++)maximum=std::max(maximum,std::abs(x[c]-y[c]));
    }return maximum;
}
static std::vector<Pixel> render(const std::vector<Pixel>& src,int w,int h,const Frame& f,int dw=0,int dh=0,int ox=0,int oy=0) {
    if(!dw)dw=w;if(!dh)dh=h;
    std::vector<Pixel> out(std::size_t(dw)*dh);
    assert(render_cpu({src.data(),w,h,w,0,0},{out.data(),dw,dh,dw,ox,oy},f)==Status::success);
    for(auto p:out) {assert(std::isfinite(p.r)&&std::isfinite(p.g)&&std::isfinite(p.b)&&std::isfinite(p.a));assert(p.a>=0&&p.a<=1);}
    return out;
}
static void seamless_palette_tests() {
    Frame f;f.layerWidth=512;f.layerHeight=64;
    f.settings.centerX=.5f+.5f/512.f;
    f.settings.depth=0;f.settings.bulge=0;f.settings.turbulence=0;
    f.settings.glow=0;f.settings.diffusion=0;f.settings.grain=0;
    for(auto& stop:f.settings.stops)stop.enabled=false;
    f.settings.stops[0]={true,{-.25f,0,0,1},0};
    f.settings.stops[7]={true,{4,1,.5f,1},1};
    auto p=detail::prepare(f,512,64,0,0);
    assert(detail::g_palette(p,0).r==-.25f);
    assert(detail::g_palette(p,1).r==4);
    // Distinct first/last stops must both remain reachable; either side of
    // every mirrored turn approaches the same color without an HDR step.
    for(int turn=-3;turn<=3;turn++) {
        auto left=detail::g_palette(p,float(turn)-.0001f);
        auto right=detail::g_palette(p,float(turn)+.0001f);
        assert(std::abs(left.r-right.r)<.000002f);
        assert(std::abs(left.g-right.g)<.000002f);
        assert(std::abs(left.b-right.b)<.000002f);
    }
    std::vector<Pixel> solid(512*64,Pixel{1,1,1,1});
    auto spatial=render(solid,512,64,f);
    float adjacent=0;
    for(int y=0;y<64;y++)for(int x=1;x<512;x++) {
        const auto a=spatial[std::size_t(y)*512+x-1],b=spatial[std::size_t(y)*512+x];
        adjacent=std::max(adjacent,std::abs(a.r-b.r));
    }
    // A unit ramp spans 64 pixels. Its smoothstep slope bounds an adjacent
    // 4.25-unit HDR change by 4.25*1.5/64, including repetition boundaries.
    assert(adjacent<.101f);
    assert(spatial[224].r==-.25f&&spatial[288].r==4);
    f.settings.animation=1;f.settings.duration=4;f.timeSeconds=4.-1./30.;
    auto before=render(solid,512,64,f);f.timeSeconds=4;
    auto after=render(solid,512,64,f);
    const auto temporal=difference(before,after);
    assert(temporal>.01f&&temporal<.107f);
    // The angle branch must also agree with a fractional repeat count and
    // offset: these controls cannot introduce a seam along the negative X axis.
    f=Frame{};f.layerWidth=256;f.layerHeight=256;f.settings.mode=2;
    f.settings.cycles=1.35f;f.settings.offset=.27f;
    f.settings.depth=0;f.settings.bulge=0;f.settings.turbulence=0;
    f.settings.glow=0;f.settings.diffusion=0;f.settings.grain=0;
    for(auto& stop:f.settings.stops)stop.enabled=false;
    f.settings.stops[0]={true,{-.25f,0,0,1},0};
    f.settings.stops[7]={true,{4,1,.5f,1},1};
    auto angular=render(std::vector<Pixel>(256*256,Pixel{1,1,1,1}),256,256,f);
    for(int x=0;x<120;x++) {
        const auto a=angular[127*256+x],b=angular[128*256+x];
        assert(std::abs(a.r-b.r)<.00001f&&std::abs(a.g-b.g)<.00001f&&std::abs(a.b-b.b)<.00001f);
    }
    std::cout<<"Gradient mirrored palette: exact stop positions, HDR spatial continuity, adjacent loop frames and fractional angular seam PASS\n";
}
static void tests() {
    seamless_palette_tests();
    const int w=89,h=61;Frame f;f.layerWidth=w;f.layerHeight=h;
    f.settings.depthRadius=9;f.settings.diffusionRadius=7;f.settings.glowRadius=8;
    auto src=fixture(w,h);
    f.settings.glow=0;f.settings.diffusion=0;
    auto a=render(src,w,h,f);
    for(std::size_t i=0;i<a.size();i++)assert(a[i].a==src[i].a);
    f.settings.mode=1;auto radial=render(src,w,h,f);assert(difference(a,radial)>.1);
    f.settings.mode=2;auto angular=render(src,w,h,f);assert(difference(radial,angular)>.1);
    f.settings.mode=0;f.settings.glow=1;f.settings.glowThreshold=0;f.settings.diffusion=.7f;f.settings.focusRadius=.03f;
    auto full=render(src,w,h,f,w+30,h+30,-15,-15);
    bool extended=false;for(int y=0;y<h+30;y++)for(int x=0;x<w+30;x++) {
        auto p=full[std::size_t(y)*(w+30)+x];
        if(p.a==0)assert(p.r==0&&p.g==0&&p.b==0);
        if(x>15&&x<w+15&&y>15&&y<h+15&&src[std::size_t(y-15)*w+x-15].a==0&&p.a>0)extended=true;
    }assert(extended);
    // Output ROI origins are independent of normalization and every blur halo.
    std::vector<Pixel> tiled(full.size());const int fw=w+30,fh=h+30;
    for(int ty=0;ty<fh;ty+=23)for(int tx=0;tx<fw;tx+=29) {
        int tw=std::min(29,fw-tx),th=std::min(23,fh-ty);
        auto tile=render(src,w,h,f,tw,th,tx-15,ty-15);
        for(int y=0;y<th;y++)std::copy_n(tile.data()+y*tw,tw,tiled.data()+std::size_t(y+ty)*fw+tx);
    }
    std::cerr<<"ROI max difference="<<difference(full,tiled)<<"\n";
    assert(difference(full,tiled)<.0001f);
    // A checkout containing only the requested ROI plus declared dependencies
    // must give the same result as a full input checkout.
    const int rw=17,rh=13,rx=31,ry=27,pad=required_padding(f);
    const int sx=std::max(0,rx-pad),sy=std::max(0,ry-pad);
    const int cw=std::min(w,rx+rw+pad)-sx,ch=std::min(h,ry+rh+pad)-sy;
    std::vector<Pixel> cropped(std::size_t(cw)*ch),croppedResult(rw*rh);
    for(int y=0;y<ch;y++)std::copy_n(src.data()+std::size_t(y+sy)*w+sx,cw,cropped.data()+std::size_t(y)*cw);
    assert(render_cpu({cropped.data(),cw,ch,cw,sx,sy},{croppedResult.data(),rw,rh,rw,rx,ry},f)==Status::success);
    assert(difference(croppedResult,render(src,w,h,f,rw,rh,rx,ry))<.0001f);
    auto concurrent=std::async(std::launch::async,[&]{return render(src,w,h,f,w+30,h+30,-15,-15);});
    assert(difference(full,concurrent.get())==0);
    f.settings.animation=1;f.settings.duration=3;f.settings.grain=.5f;f.timeSeconds=.725;
    auto start=render(src,w,h,f);f.timeSeconds+=3;auto loop=render(src,w,h,f);assert(difference(start,loop)<.00001f);
    f.timeSeconds+=.5;auto moving=render(src,w,h,f);assert(difference(start,moving)>.01f);
    f.settings.seed++;assert(difference(moving,render(src,w,h,f))>.01f);
    // HDR and negatives survive project-space processing and sRGB round-trip.
    f.settings.glow=0;f.settings.diffusion=0;f.settings.grain=0;f.settings.depth=0;f.settings.turbulence=0;
    for(auto& stop:f.settings.stops) {stop.enabled=true;stop.color={-.5f,4,2,1};}
    std::vector<Pixel> solid(std::size_t(w)*h,Pixel{1,1,1,1});
    for(int space=0;space<2;space++) {
        f.settings.colorProcessing=space;auto hdr=render(solid,w,h,f);
        for(auto p:hdr)assert(std::abs(p.r+.5f)<.00001f&&std::abs(p.g-4)<.00001f&&std::abs(p.b-2)<.00001f&&p.a==1);
    }
    // Empty input is valid and produces transparent black, including expanded output.
    std::vector<Pixel> empty(w*h),out(w*h);assert(difference(render(empty,w,h,f),empty)==0);
    assert(render_cpu({nullptr,0,0,0,0,0},{out.data(),w,h,w,-7,-3},f)==Status::success);
    assert(difference(out,empty)==0);
    bool cancel=true;assert(render_cpu({solid.data(),w,h,w,0,0},{out.data(),w,h,w,0,0},f,[](void* p){return *static_cast<bool*>(p);},&cancel)==Status::cancelled);
    // Padded/negative strides and non-zero source origin retain alpha coverage.
    std::vector<Pixel> padded(std::size_t(w+3)*h),shifted(w*h);
    for(int y=0;y<h;y++)std::copy_n(src.data()+std::size_t(y)*w,w,padded.data()+std::size_t(h-1-y)*(w+3));
    assert(render_cpu({padded.data()+std::size_t(h-1)*(w+3),w,h,-(w+3),11,-8},{shifted.data(),w,h,w,11,-8},f)==Status::success);
    for(std::size_t i=0;i<shifted.size();i++)assert(shifted[i].a==src[i].a);
    assert(required_padding(f)==0);
    auto single=render(std::vector<Pixel>{{1,1,1,1}},1,1,f);assert(single[0].a==1);
    f.settings.scale=NAN;f.settings.turbulence=INFINITY;f.settings.depthRadius=NAN;
    render(src,w,h,f);
    assert(render_cpu({src.data(),w,h,1,0,0},{out.data(),w,h,w,0,0},f)==Status::failure);
    assert(render_cpu({src.data(),w,h,std::numeric_limits<std::ptrdiff_t>::max(),0,0},{out.data(),w,h,w,0,0},f)==Status::failure);
    assert(render_cpu({src.data(),w,h,w,0,0},{out.data(),100000,100000,100000,0,0},f)==Status::outOfMemory);
    std::cout<<"Gradient CPU: modes, alpha, HDR, sRGB, glow, diffusion, ROI, seeded loop, MFR, strides, empty input, cancellation and bounds PASS\n";
}
int main(int argc,char** argv) {
    tests();
    if(argc>1&&std::string(argv[1])=="--benchmark")for(auto size:{std::pair<int,int>{1920,1080},{3840,2160}}) {
        Frame f;f.layerWidth=size.first;f.layerHeight=size.second;f.settings.diffusion=.5f;f.settings.grain=.1f;
        auto src=fixture(size.first,size.second);render(src,size.first,size.second,f);
        std::vector<double> times;
        for(int i=0;i<5;i++) {
            auto begin=std::chrono::steady_clock::now();auto output=render(src,size.first,size.second,f);
            times.push_back(std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-begin).count());
        }
        std::cout<<size.first<<"x"<<size.second<<" CPU samples_ms=";
        for(auto ms:times)std::cout<<ms<<",";
        std::cout<<"\n";
        std::sort(times.begin(),times.end());std::cout<<size.first<<"x"<<size.second<<" CPU median_ms="<<times[2]<<" worst_ms="<<times.back()<<"\n";
    }
}
