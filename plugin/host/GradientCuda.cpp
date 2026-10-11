// CUDA executor for the Gradient kernels (GradientCuda.cu → PTX, embedded).
//
// The driver library is loaded at runtime, so MotionCore.aex still loads on
// machines without an NVIDIA driver (AMD, Intel): GPU_DEVICE_SETUP simply
// declines CUDA there. All work is queued on After Effects' stream inside its
// context and synchronized once per frame; intermediates come from AE's pool.
#include "GradientCuda.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <climits>
#include <cstdint>
#include <mutex>
#include <type_traits>

#include "gradient_cuda_ptx.h"  // g_gradient_cuda_ptx: NUL-terminated PTX text

namespace motion::gradient {
namespace {
// Minimal CUDA driver API surface (types and entry points of cuda.h, ABI-stable).
using CUresult = int;
using CUdevice = int;
using CUdeviceptr = unsigned long long;
using CUcontext = struct CUctx_st*;
using CUmodule = struct CUmod_st*;
using CUfunction = struct CUfunc_st*;
using CUstream = struct CUstream_st*;
constexpr CUresult CUDA_SUCCESS = 0;

struct CudaApi {
    HMODULE library = nullptr;
    CUresult (__stdcall* cuInit)(unsigned) = nullptr;
    CUresult (__stdcall* cuCtxPushCurrent)(CUcontext) = nullptr;
    CUresult (__stdcall* cuCtxPopCurrent)(CUcontext*) = nullptr;
    CUresult (__stdcall* cuCtxGetCurrent)(CUcontext*) = nullptr;
    CUresult (__stdcall* cuModuleLoadData)(CUmodule*, const void*) = nullptr;
    CUresult (__stdcall* cuModuleUnload)(CUmodule) = nullptr;
    CUresult (__stdcall* cuModuleGetFunction)(CUfunction*, CUmodule, const char*) = nullptr;
    CUresult (__stdcall* cuLaunchKernel)(CUfunction, unsigned, unsigned, unsigned, unsigned, unsigned, unsigned,
                                         unsigned, CUstream, void**, void**) = nullptr;
    CUresult (__stdcall* cuStreamSynchronize)(CUstream) = nullptr;
    CUresult (__stdcall* cuGetErrorString)(CUresult, const char**) = nullptr;
    bool ready = false;
};

const CudaApi& api() {
    static CudaApi a;
    static std::once_flag once;
    std::call_once(once, [] {
        // System32 only: never pick up an nvcuda.dll from the current or plug-in folder.
        a.library = LoadLibraryExW(L"nvcuda.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!a.library) return;
        auto load = [](auto& fn, const char* name) {
            fn = reinterpret_cast<std::remove_reference_t<decltype(fn)>>(GetProcAddress(a.library, name));
            return fn != nullptr;
        };
        a.ready = load(a.cuInit, "cuInit") && load(a.cuCtxPushCurrent, "cuCtxPushCurrent_v2") &&
                  load(a.cuCtxPopCurrent, "cuCtxPopCurrent_v2") && load(a.cuCtxGetCurrent, "cuCtxGetCurrent") &&
                  load(a.cuModuleLoadData, "cuModuleLoadData") && load(a.cuModuleUnload, "cuModuleUnload") &&
                  load(a.cuModuleGetFunction, "cuModuleGetFunction") && load(a.cuLaunchKernel, "cuLaunchKernel") &&
                  load(a.cuStreamSynchronize, "cuStreamSynchronize") && load(a.cuGetErrorString, "cuGetErrorString") &&
                  a.cuInit(0) == CUDA_SUCCESS;
    });
    return a;
}

void say(std::string* error, const char* what, CUresult code = CUDA_SUCCESS) {
    if (!error) return;
    *error = what;
    const char* text = nullptr;
    if (code != CUDA_SUCCESS && api().cuGetErrorString && api().cuGetErrorString(code, &text) == CUDA_SUCCESS && text) {
        *error += ": ";
        *error += text;
    }
}

/** Makes the backend's context current for one scope (AE may call from several threads). */
struct ContextScope {
    bool pushed = false;
    explicit ContextScope(CUcontext context) { pushed = context && api().cuCtxPushCurrent(context) == CUDA_SUCCESS; }
    ~ContextScope() { if (pushed) { CUcontext previous = nullptr; api().cuCtxPopCurrent(&previous); } }
    ContextScope(const ContextScope&) = delete;
    ContextScope& operator=(const ContextScope&) = delete;
};

enum Kernel { Alpha, Base, Box, Copy, Diffusion, Extract, Accumulate, Finish, KernelCount };
const char* const kNames[KernelCount] = {"gradient_alpha", "gradient_base", "gradient_box", "gradient_copy",
                                         "gradient_diffusion", "gradient_extract", "gradient_accumulate", "gradient_finish"};
// Must match GView / GBlur in GradientCuda.cu.
struct GView { int width, height, originX, originY, stride; };
struct GBlur { int radius, vertical; };
constexpr unsigned kBlock = 256;
}  // namespace

struct CudaBackend {
    std::mutex mutex;
    CUcontext context = nullptr;
    CUmodule module = nullptr;
    CUfunction kernels[KernelCount]{};
};

bool cuda_available() { return api().ready; }

void destroy_cuda_backend(CudaBackend* backend) {
    if (!backend) return;
    if (backend->module && api().ready) {
        ContextScope scope(backend->context);
        api().cuModuleUnload(backend->module);
    }
    delete backend;
}

CudaBackend* create_cuda_backend(void* context, std::string* error) {
    if (!api().ready) { say(error, "NVIDIA CUDA driver unavailable"); return nullptr; }
    auto* b = new (std::nothrow) CudaBackend;
    if (!b) { say(error, "CUDA backend allocation failed"); return nullptr; }
    b->context = static_cast<CUcontext>(context);
    if (!b->context) api().cuCtxGetCurrent(&b->context);
    ContextScope scope(b->context);
    // The driver JIT-compiles the embedded PTX for this GPU (cached by the driver).
    CUresult code = api().cuModuleLoadData(&b->module, g_gradient_cuda_ptx);
    if (code != CUDA_SUCCESS) { say(error, "CUDA module rejected", code); delete b; return nullptr; }
    for (int i = 0; i < KernelCount; ++i) {
        code = api().cuModuleGetFunction(&b->kernels[i], b->module, kNames[i]);
        if (code != CUDA_SUCCESS) { say(error, "CUDA kernel missing", code); destroy_cuda_backend(b); return nullptr; }
    }
    return b;
}

namespace {
bool world_valid(const CudaWorld& v) {
    if (v.rowBytes % 16 || v.rowBytes / 16 > std::size_t(INT_MAX)) return false;
    return detail::image_valid(v.width, v.height, std::ptrdiff_t(v.rowBytes / 16), reinterpret_cast<const void*>(v.pointer));
}
}  // namespace

Status render_cuda(CudaBackend* backend, void* streamPointer, const CudaWorld& source, const CudaWorld& dest,
                   const Frame& f, const CudaMemory& memory, std::string* error, AbortFn abort, void* ctx) {
    using namespace detail;
    if (!backend || !api().ready) return Status::unsupported;
    if (!memory.allocate || !memory.release) return Status::failure;
    if (!world_valid(source) || !world_valid(dest)) return Status::failure;
    if (!dest.width || !dest.height) return Status::success;
    if (cancelled(abort, ctx)) return Status::cancelled;
    const int pad = required_padding(f);
    int w, h, ox, oy;
    std::size_t count;
    Image geometryView{nullptr, dest.width, dest.height, 0, dest.originX, dest.originY};
    if (!geometry(geometryView, pad, w, h, ox, oy, count)) return Status::outOfMemory;

    std::lock_guard<std::mutex> lock(backend->mutex);
    ContextScope scope(backend->context);
    struct Buffers {
        const CudaMemory& allocator;
        CUdeviceptr buffers[4]{};
        ~Buffers() { for (auto p : buffers) if (p) allocator.release(allocator.context, p); }
    } resources{memory};
    for (auto& buffer : resources.buffers) {
        buffer = memory.allocate(memory.context, count * sizeof(GPixel));
        if (!buffer) { say(error, "CUDA intermediate allocation failed"); return Status::outOfMemory; }
    }
    CUdeviceptr base = resources.buffers[0], work = resources.buffers[1], temp = resources.buffers[2], halo = resources.buffers[3];
    CUdeviceptr input = source.pointer, output = dest.pointer;
    auto stream = static_cast<CUstream>(streamPointer);
    GParams p = prepare(f, w, h, ox, oy);
    GView srcView{source.width, source.height, source.originX, source.originY, int(source.rowBytes / 16)};
    if (!input) srcView = GView{0, 0, 0, 0, 0};  // a missing source reads as transparent
    GView dstView{dest.width, dest.height, dest.originX, dest.originY, int(dest.rowBytes / 16)};

    CUresult failure = CUDA_SUCCESS;
    const auto launch = [&](Kernel which, std::size_t threads, void** args) {
        if (failure != CUDA_SUCCESS || !threads) return;
        const unsigned long long blocks = (threads + kBlock - 1) / kBlock;
        if (blocks > 0x7fffffffULL) { failure = 1; return; }
        failure = api().cuLaunchKernel(backend->kernels[which], unsigned(blocks), 1, 1, kBlock, 1, 1, 0, stream, args, nullptr);
    };
    const auto blur = [&](int rx, int ry) {
        GBlur b{rx, 0};
        void* horizontal[] = {&work, &temp, &p, &b};
        launch(Box, std::size_t(h), horizontal);
        GBlur v{ry, 1};
        void* vertical[] = {&temp, &work, &p, &v};
        launch(Box, std::size_t(w), vertical);
    };

    { void* args[] = {&input, &work, &srcView, &p}; launch(Alpha, count, args); }
    if (p.depth > 0) for (int i = 0; i < 3; ++i) blur(radius(f.settings.depthRadius, p.dx), radius(f.settings.depthRadius, p.dy));
    { void* args[] = {&input, &work, &base, &srcView, &p}; launch(Base, count, args); }
    if (p.diffusion > 0) {
        { void* args[] = {&base, &work, &p}; launch(Copy, count, args); }
        for (int i = 0; i < 3; ++i) blur(radius(f.settings.diffusionRadius, p.dx), radius(f.settings.diffusionRadius, p.dy));
        { void* args[] = {&base, &work, &p}; launch(Diffusion, count, args); }
    }
    if (p.glow > 0) {
        { void* args[] = {&base, &work, &halo, &p}; launch(Extract, count, args); }
        for (int i = 0; i < 3; ++i) {
            blur(radius(f.settings.glowRadius, p.dx), radius(f.settings.glowRadius, p.dy));
            float weight = i == 0 ? .5f : i == 1 ? .3f : .2f;
            void* args[] = {&halo, &work, &p, &weight};
            launch(Accumulate, count, args);
        }
    }
    int padding = pad;
    { void* args[] = {&base, &halo, &output, &dstView, &p, &padding}; launch(Finish, std::size_t(dest.width) * dest.height, args); }
    // Intermediates are released (to AE's pool) only after the stream finished with them.
    const CUresult synced = api().cuStreamSynchronize(stream);
    if (failure != CUDA_SUCCESS) { say(error, "CUDA kernel launch failed", failure); return Status::failure; }
    if (synced != CUDA_SUCCESS) { say(error, "CUDA render failed", synced); return Status::failure; }
    return cancelled(abort, ctx) ? Status::cancelled : Status::success;
}
}  // namespace motion::gradient
