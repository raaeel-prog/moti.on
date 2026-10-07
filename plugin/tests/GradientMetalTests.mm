#include "GradientMetal.h"
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <cassert>
#include <chrono>
#include <iostream>
#include <string>

using namespace motion::gradient;
static void* allocate(void* context,std::size_t bytes) {
    return (void*)[(id<MTLDevice>)context newBufferWithLength:bytes options:MTLResourceStorageModeShared];
}
static void release(void*,void* buffer) {[(id<MTLBuffer>)buffer release];}
static void compare(MetalBackend* backend,id<MTLDevice> device,id<MTLCommandQueue> queue,Frame f,int w,int h,int ox,int oy,bool benchmark=false) {
    const int stride=w+7;
    std::vector<Pixel> source(std::size_t(stride)*h),reference(std::size_t(stride)*h);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
        float a=w==1&&h==1?1:(x>4&&y>4&&x<w-4&&y<h-4)?float((x*13+y*17)%101)/100:0;
        source[std::size_t(y)*stride+x]={a*.2f,a*.8f,a*.4f,a};
    }
    assert(render_cpu({source.data(),w,h,stride,ox,oy},{reference.data(),w,h,stride,ox,oy},f)==Status::success);
    id<MTLBuffer> input=[device newBufferWithLength:source.size()*16 options:MTLResourceStorageModeShared];
    id<MTLBuffer> output=[device newBufferWithLength:source.size()*16 options:MTLResourceStorageModeShared];
    assert(input&&output);
    Pixel* raw=(Pixel*)input.contents;
    for(std::size_t i=0;i<source.size();i++)raw[i]={source[i].b,source[i].g,source[i].r,source[i].a};
    MetalMemory memory{(void*)device,allocate,release};std::string error;
    auto render=[&] {
        auto status=render_metal(backend,(void*)queue,{(void*)input,w,h,std::size_t(stride)*16,ox,oy},
            {(void*)output,w,h,std::size_t(stride)*16,ox,oy},f,memory,&error);
        if(status!=Status::success)std::cerr<<"Metal render failed: "<<error<<"\n";
        assert(status==Status::success);
    };
    render();float worst=0;
    raw=(Pixel*)output.contents;
    for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
        auto i=std::size_t(y)*stride+x;Pixel gpu{raw[i].b,raw[i].g,raw[i].r,raw[i].a};
        const float* a=&gpu.r;const float* b=&reference[i].r;
        for(int c=0;c<4;c++) {
            float relative=std::abs(a[c]-b[c])/(1.f+std::abs(b[c]));worst=std::max(worst,relative);
            if(!(relative<=.0001f)){std::cerr<<"Parity failed x="<<x<<" y="<<y<<" channel="<<c<<" GPU="<<a[c]<<" CPU="<<b[c]<<" rel="<<relative<<"\n";assert(false);}
        }
    }
    std::cout<<w<<"x"<<h<<" mode="<<f.settings.mode<<" space="<<f.settings.colorProcessing<<" CPU/Metal relative_error="<<worst<<" PASS\n";
    if(benchmark) {
        std::vector<double> times;
        for(int i=0;i<5;i++) {auto start=std::chrono::steady_clock::now();render();times.push_back(std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count());}
        std::cout<<w<<"x"<<h<<" Metal samples_ms=";
        for(auto ms:times)std::cout<<ms<<",";
        std::cout<<"\n";
        std::sort(times.begin(),times.end());std::cout<<w<<"x"<<h<<" Metal median_ms="<<times[2]<<" worst_ms="<<times.back()<<"\n";
    }
    [input release];[output release];
}
int main(int argc,char** argv) {
    @autoreleasepool {
        id<MTLDevice> device=MTLCreateSystemDefaultDevice();
        if(!device){std::cerr<<"Metal device unavailable: NOT RUN\n";return 77;}
        id<MTLCommandQueue> queue=[device newCommandQueue];std::string error;
        MetalBackend* backend=create_metal_backend((void*)device,&error);
        if(!backend){std::cerr<<"Metal setup failed: "<<error<<"\n";return 1;}
        std::cout<<"Metal device: "<<[device.name UTF8String]<<"\n";
        Frame f;f.layerWidth=89;f.layerHeight=61;f.settings.depthRadius=8;f.settings.glowRadius=7;
        f.settings.diffusionRadius=9;f.settings.diffusion=.75f;f.settings.focusRadius=.01f;
        f.settings.glow=1;f.settings.glowThreshold=.05f;f.settings.grain=.4f;f.settings.animation=1;f.timeSeconds=.71;
        for(int mode=0;mode<3;mode++)for(int color=0;color<2;color++) {
            f.settings.mode=mode;f.settings.colorProcessing=color;compare(backend,device,queue,f,89,61,-13,-7);
        }
        // Strongly different HDR endpoints exercise mirrored turns and the
        // fractional angular branch in the same shared CPU/MSL source.
        Frame seam;seam.layerWidth=256;seam.layerHeight=256;
        seam.settings.depth=0;seam.settings.bulge=0;seam.settings.turbulence=0;
        seam.settings.glow=0;seam.settings.diffusion=0;seam.settings.grain=0;
        seam.settings.cycles=1.35f;seam.settings.offset=.27f;
        for(auto& stop:seam.settings.stops)stop.enabled=false;
        seam.settings.stops[0]={true,{-.25f,0,0,1},0};
        seam.settings.stops[7]={true,{4,1,.5f,1},1};
        for(int mode=0;mode<3;mode++) {
            seam.settings.mode=mode;compare(backend,device,queue,seam,256,256,0,0);
        }
        seam.settings.animation=1;seam.timeSeconds=4.-1./30.;
        compare(backend,device,queue,seam,256,256,0,0);
        seam.timeSeconds=4;compare(backend,device,queue,seam,256,256,0,0);
        f.settings.glow=0;f.settings.diffusion=0;f.settings.depth=0;f.settings.grain=0;
        for(auto& stop:f.settings.stops){stop.enabled=true;stop.color={-.5f,4,2,1};}
        compare(backend,device,queue,f,1,1,4,2);
        compare(backend,device,queue,f,47,31,8,-2);
        f.downsampleX=.5f;f.downsampleY=.25f;f.pixelAspect=1.3f;
        compare(backend,device,queue,f,45,16,-5,-2);
        if(argc>1&&std::string(argv[1])=="--benchmark")for(auto size:{std::pair<int,int>{1920,1080},{3840,2160}}) {
            f=Frame{};f.layerWidth=size.first;f.layerHeight=size.second;f.settings.diffusion=.5f;f.settings.grain=.1f;
            compare(backend,device,queue,f,size.first,size.second,0,0,true);
        }
        destroy_metal_backend(backend);[queue release];[device release];
    }
}
