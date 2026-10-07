#include "GradientMetal.h"
#include "GradientMetalSource.h"
#import <Foundation/Foundation.h>
#import <Metal/Metal.h>
#include <climits>

namespace motion::gradient {
enum Pipeline { Alpha,Base,Box,Copy,Diffusion,Extract,Accumulate,Finish,PipelineCount };
struct MetalBackend {
    id<MTLDevice> device = nil;
    id<MTLComputePipelineState> pipelines[PipelineCount]{};
};
struct GPUView { int width,height,originX,originY,stride; };
struct GPUBlur { int radius,vertical; };
static void error_text(std::string* error,NSString* text) {
    if(error)*error=text?[text UTF8String]:"Unknown Metal error";
}
void destroy_metal_backend(MetalBackend* backend) {
    if(!backend)return;
    for(auto p:backend->pipelines)[p release];
    [backend->device release];delete backend;
}
MetalBackend* create_metal_backend(void* devicePointer,std::string* error) {
    @autoreleasepool {
        id<MTLDevice> device=(id<MTLDevice>)devicePointer;
        if(!device) {if(error)*error="Metal device unavailable";return nullptr;}
        MetalBackend* backend=new(std::nothrow) MetalBackend;
        if(!backend) {if(error)*error="Metal backend allocation failed";return nullptr;}
        backend->device=[device retain];
        try {
            std::string source="#include <metal_stdlib>\nusing namespace metal;\n";
            source+=gradientMetalMath;source+=gradientMetalKernels;
            MTLCompileOptions* options=[[MTLCompileOptions alloc] init];
            options.fastMathEnabled=NO;
            NSError* diagnostic=nil;
            id<MTLLibrary> library=[device newLibraryWithSource:[NSString stringWithUTF8String:source.c_str()] options:options error:&diagnostic];
            [options release];
            if(!library) {error_text(error,[diagnostic localizedDescription]);destroy_metal_backend(backend);return nullptr;}
            const char* names[]={"gradient_alpha","gradient_base","gradient_box","gradient_copy","gradient_diffusion","gradient_extract","gradient_accumulate","gradient_finish"};
            for(int i=0;i<PipelineCount;i++) {
                id<MTLFunction> function=[library newFunctionWithName:[NSString stringWithUTF8String:names[i]]];
                if(function)backend->pipelines[i]=[device newComputePipelineStateWithFunction:function error:&diagnostic];
                [function release];
                if(!backend->pipelines[i]) {error_text(error,[diagnostic localizedDescription]);[library release];destroy_metal_backend(backend);return nullptr;}
            }
            [library release];return backend;
        } catch(...) {if(error)*error="Metal source allocation failed";destroy_metal_backend(backend);return nullptr;}
    }
}

Status render_metal(MetalBackend* backend,void* queuePointer,const MetalBuffer& source,const MetalBuffer& dest,
                    const Frame& f,const MetalMemory& memory,std::string* error,AbortFn abort,void* ctx) {
    @autoreleasepool {
        using namespace detail;
        if(!backend||!queuePointer)return Status::unsupported;
        if(!memory.allocate||!memory.release)return Status::failure;
        if(source.rowBytes%16||dest.rowBytes%16||source.rowBytes/16>std::size_t(INT_MAX)||dest.rowBytes/16>std::size_t(INT_MAX)||
           !image_valid(source.width,source.height,std::ptrdiff_t(source.rowBytes/16),source.buffer)||
           !image_valid(dest.width,dest.height,std::ptrdiff_t(dest.rowBytes/16),dest.buffer))return Status::failure;
        if(!dest.width||!dest.height)return Status::success;
        if(cancelled(abort,ctx))return Status::cancelled;
        id<MTLCommandQueue> queue=(id<MTLCommandQueue>)queuePointer;
        if(queue.device!=backend->device)return Status::unsupported;
        const int pad=required_padding(f);int w,h,ox,oy;std::size_t count;
        Image geometryView{nullptr,dest.width,dest.height,0,dest.originX,dest.originY};
        if(!geometry(geometryView,pad,w,h,ox,oy,count))return Status::outOfMemory;
        struct Resources {
            const MetalMemory& allocator;void* buffers[4]{};
            ~Resources(){for(auto p:buffers)if(p)allocator.release(allocator.context,p);}
        } resources{memory};
        for(auto& buffer:resources.buffers) {
            buffer=memory.allocate(memory.context,count*sizeof(GPixel));
            if(!buffer){if(error)*error="Metal intermediate allocation failed";return Status::outOfMemory;}
        }
        id<MTLBuffer> base=(id<MTLBuffer>)resources.buffers[0],work=(id<MTLBuffer>)resources.buffers[1];
        id<MTLBuffer> temp=(id<MTLBuffer>)resources.buffers[2],halo=(id<MTLBuffer>)resources.buffers[3];
        id<MTLBuffer> input=source.buffer?(id<MTLBuffer>)source.buffer:work;
        id<MTLBuffer> output=(id<MTLBuffer>)dest.buffer;
        auto enough=[](id<MTLBuffer> buffer,const MetalBuffer& v) {
            if(v.width==0||v.height==0)return true;
            const std::size_t needed=std::size_t(v.height-1)*v.rowBytes+std::size_t(v.width)*16;
            return buffer && buffer.length>=needed;
        };
        if(!enough(input,source)||!enough(output,dest)) {
            if(error)*error="Metal world buffer is shorter than its declared extent";
            return Status::failure;
        }
        auto p=prepare(f,w,h,ox,oy);
        GPUView srcView{source.width,source.height,source.originX,source.originY,int(source.rowBytes/16)};
        GPUView dstView{dest.width,dest.height,dest.originX,dest.originY,int(dest.rowBytes/16)};
        id<MTLCommandBuffer> command=[queue commandBuffer];
        id<MTLComputeCommandEncoder> encoder=[command computeCommandEncoder];
        if(!command||!encoder){if(error)*error="Metal command allocation failed";return Status::outOfMemory;}
        auto bind=[&](id<MTLBuffer> b,NSUInteger index){[encoder setBuffer:b offset:0 atIndex:index];};
        auto bytes=[&](const void* data,NSUInteger size,NSUInteger index){[encoder setBytes:data length:size atIndex:index];};
        auto dispatch=[&](Pipeline which,std::size_t threads) {
            id<MTLComputePipelineState> pipeline=backend->pipelines[which];
            [encoder setComputePipelineState:pipeline];
            const NSUInteger group=std::min<NSUInteger>(pipeline.maxTotalThreadsPerThreadgroup,pipeline.threadExecutionWidth*4);
            [encoder dispatchThreads:MTLSizeMake(threads,1,1) threadsPerThreadgroup:MTLSizeMake(group,1,1)];
            [encoder memoryBarrierWithScope:MTLBarrierScopeBuffers];
        };
        auto blur=[&](int rx,int ry) {
            GPUBlur b{rx,0};bind(work,0);bind(temp,1);bytes(&p,sizeof(p),2);bytes(&b,sizeof(b),3);dispatch(Box,h);
            b={ry,1};bind(temp,0);bind(work,1);bytes(&b,sizeof(b),3);dispatch(Box,w);
        };
        bind(input,0);bind(work,1);bytes(&srcView,sizeof(srcView),2);bytes(&p,sizeof(p),3);dispatch(Alpha,count);
        if(p.depth>0)for(int i=0;i<3;i++)blur(radius(f.settings.depthRadius,p.dx),radius(f.settings.depthRadius,p.dy));
        bind(input,0);bind(work,1);bind(base,2);bytes(&srcView,sizeof(srcView),3);bytes(&p,sizeof(p),4);dispatch(Base,count);
        if(p.diffusion>0) {
            bind(base,0);bind(work,1);bytes(&p,sizeof(p),2);dispatch(Copy,count);
            for(int i=0;i<3;i++)blur(radius(f.settings.diffusionRadius,p.dx),radius(f.settings.diffusionRadius,p.dy));
            bind(base,0);bind(work,1);bytes(&p,sizeof(p),2);dispatch(Diffusion,count);
        }
        if(p.glow>0) {
            bind(base,0);bind(work,1);bind(halo,2);bytes(&p,sizeof(p),3);dispatch(Extract,count);
            for(int i=0;i<3;i++) {
                blur(radius(f.settings.glowRadius,p.dx),radius(f.settings.glowRadius,p.dy));
                float weight=i==0?.5f:i==1?.3f:.2f;
                bind(halo,0);bind(work,1);bytes(&p,sizeof(p),2);bytes(&weight,sizeof(weight),3);dispatch(Accumulate,count);
            }
        }
        bind(base,0);bind(halo,1);bind(output,2);bytes(&dstView,sizeof(dstView),3);bytes(&p,sizeof(p),4);bytes(&pad,sizeof(pad),5);
        dispatch(Finish,std::size_t(dest.width)*dest.height);
        [encoder endEncoding];[command commit];[command waitUntilCompleted];
        if(command.status==MTLCommandBufferStatusError){error_text(error,[command.error localizedDescription]);return Status::failure;}
        if(cancelled(abort,ctx))return Status::cancelled;
        return Status::success;
    }
}
} // namespace motion::gradient
