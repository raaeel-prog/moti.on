// CPU × CUDA parity for the Gradient (same scenarios and tolerance as
// GradientMetalTests.mm / GradientD3D12Tests.cpp). Needs an NVIDIA driver;
// returns 77 (ctest: skipped) without one.   gradient-cuda-tests [--benchmark]
#include "GradientCuda.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <algorithm>
#include <cassert>
#include <chrono>
#include <iostream>
#include <string>
#include <type_traits>
#include <vector>

using namespace motion::gradient;

namespace {
using CUresult = int;
using CUdeviceptr = unsigned long long;
struct Driver {
    HMODULE library = nullptr;
    CUresult (__stdcall* cuInit)(unsigned) = nullptr;
    CUresult (__stdcall* cuDeviceGet)(int*, int) = nullptr;
    CUresult (__stdcall* cuDeviceGetName)(char*, int, int) = nullptr;
    CUresult (__stdcall* cuCtxCreate)(void**, unsigned, int) = nullptr;
    CUresult (__stdcall* cuCtxDestroy)(void*) = nullptr;
    CUresult (__stdcall* cuMemAlloc)(CUdeviceptr*, size_t) = nullptr;
    CUresult (__stdcall* cuMemFree)(CUdeviceptr) = nullptr;
    CUresult (__stdcall* cuMemcpyHtoD)(CUdeviceptr, const void*, size_t) = nullptr;
    CUresult (__stdcall* cuMemcpyDtoH)(void*, CUdeviceptr, size_t) = nullptr;
    bool open() {
        library = LoadLibraryExW(L"nvcuda.dll", nullptr, LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!library) return false;
        auto load = [this](auto& fn, const char* name) {
            fn = reinterpret_cast<std::remove_reference_t<decltype(fn)>>(GetProcAddress(library, name));
            return fn != nullptr;
        };
        return load(cuInit, "cuInit") && load(cuDeviceGet, "cuDeviceGet") && load(cuDeviceGetName, "cuDeviceGetName") &&
               load(cuCtxCreate, "cuCtxCreate_v2") && load(cuCtxDestroy, "cuCtxDestroy_v2") && load(cuMemAlloc, "cuMemAlloc_v2") &&
               load(cuMemFree, "cuMemFree_v2") && load(cuMemcpyHtoD, "cuMemcpyHtoD_v2") && load(cuMemcpyDtoH, "cuMemcpyDtoH_v2") &&
               cuInit(0) == 0;
    }
} driver;

// Stands in for After Effects' PF_GPUDeviceSuite1::AllocateDeviceMemory pool.
unsigned long long allocate(void*, std::size_t bytes) { CUdeviceptr p = 0; return driver.cuMemAlloc(&p, bytes) == 0 ? p : 0; }
void release(void*, unsigned long long p) { driver.cuMemFree(p); }

void compare(CudaBackend* backend, Frame f, int w, int h, int ox, int oy, bool benchmark = false) {
    const int stride = w + 7;
    std::vector<Pixel> source(std::size_t(stride) * h), reference(std::size_t(stride) * h), bgra(std::size_t(stride) * h);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        float a = w == 1 && h == 1 ? 1 : (x > 4 && y > 4 && x < w - 4 && y < h - 4) ? float((x * 13 + y * 17) % 101) / 100 : 0;
        source[std::size_t(y) * stride + x] = {a * .2f, a * .8f, a * .4f, a};
    }
    assert(render_cpu({source.data(), w, h, stride, ox, oy}, {reference.data(), w, h, stride, ox, oy}, f) == Status::success);
    for (std::size_t i = 0; i < source.size(); i++) bgra[i] = {source[i].b, source[i].g, source[i].r, source[i].a};  // Adobe BGRA
    const std::size_t bytes = source.size() * 16;
    CUdeviceptr input = 0, output = 0;
    assert(driver.cuMemAlloc(&input, bytes) == 0 && driver.cuMemAlloc(&output, bytes) == 0);
    assert(driver.cuMemcpyHtoD(input, bgra.data(), bytes) == 0);
    std::string error;
    const CudaMemory memory{nullptr, allocate, release};
    const auto render = [&] {
        const auto status = render_cuda(backend, nullptr, {input, w, h, std::size_t(stride) * 16, ox, oy},
                                        {output, w, h, std::size_t(stride) * 16, ox, oy}, f, memory, &error);
        if (status != Status::success) std::cerr << "CUDA render failed: " << error << "\n";
        assert(status == Status::success);
    };
    render();
    assert(driver.cuMemcpyDtoH(bgra.data(), output, bytes) == 0);
    float worst = 0;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        const auto i = std::size_t(y) * stride + x;
        const Pixel g{bgra[i].b, bgra[i].g, bgra[i].r, bgra[i].a};
        const float* a = &g.r;
        const float* b = &reference[i].r;
        for (int c = 0; c < 4; c++) {
            const float relative = std::abs(a[c] - b[c]) / (1.f + std::abs(b[c]));
            worst = std::max(worst, relative);
            if (!(relative <= .0001f)) {
                std::cerr << "Parity failed x=" << x << " y=" << y << " channel=" << c << " GPU=" << a[c] << " CPU=" << b[c] << " rel=" << relative << "\n";
                assert(false);
            }
        }
    }
    std::cout << w << "x" << h << " mode=" << f.settings.mode << " space=" << f.settings.colorProcessing
              << " CPU/CUDA relative_error=" << worst << " PASS\n";
    if (benchmark) {
        std::vector<double> times;
        for (int i = 0; i < 5; i++) {
            auto start = std::chrono::steady_clock::now();
            render();
            times.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
        }
        std::sort(times.begin(), times.end());
        std::cout << w << "x" << h << " CUDA median_ms=" << times[2] << " worst_ms=" << times.back() << "\n";
    }
    driver.cuMemFree(input);
    driver.cuMemFree(output);
}
}  // namespace

int main(int argc, char** argv) {
    const bool benchmark = argc > 1 && std::string(argv[1]) == "--benchmark";
    int device = 0;
    void* context = nullptr;
    if (!driver.open() || driver.cuDeviceGet(&device, 0) != 0 || driver.cuCtxCreate(&context, 0, device) != 0) {
        std::cerr << "NVIDIA CUDA device unavailable: NOT RUN\n";
        return 77;
    }
    char name[256]{};
    driver.cuDeviceGetName(name, sizeof name, device);
    std::string error;
    CudaBackend* backend = create_cuda_backend(context, &error);
    if (!backend) { std::cerr << "CUDA setup failed: " << error << "\n"; return 1; }
    std::cout << "CUDA device: " << name << "\n";

    Frame f; f.layerWidth = 89; f.layerHeight = 61; f.settings.depthRadius = 8; f.settings.glowRadius = 7;
    f.settings.diffusionRadius = 9; f.settings.diffusion = .75f; f.settings.focusRadius = .01f;
    f.settings.glow = 1; f.settings.glowThreshold = .05f; f.settings.grain = .4f; f.settings.animation = 1; f.timeSeconds = .71;
    for (int mode = 0; mode < 3; mode++) for (int color = 0; color < 2; color++) {
        f.settings.mode = mode; f.settings.colorProcessing = color; compare(backend, f, 89, 61, -13, -7);
    }
    Frame seam; seam.layerWidth = 256; seam.layerHeight = 256;
    seam.settings.depth = 0; seam.settings.bulge = 0; seam.settings.turbulence = 0;
    seam.settings.glow = 0; seam.settings.diffusion = 0; seam.settings.grain = 0;
    seam.settings.cycles = 1.35f; seam.settings.offset = .27f;
    for (auto& stop : seam.settings.stops) stop.enabled = false;
    seam.settings.stops[0] = {true, {-.25f, 0, 0, 1}, 0};
    seam.settings.stops[7] = {true, {4, 1, .5f, 1}, 1};
    for (int mode = 0; mode < 3; mode++) { seam.settings.mode = mode; compare(backend, seam, 256, 256, 0, 0); }
    seam.settings.animation = 1; seam.timeSeconds = 4. - 1. / 30.;
    compare(backend, seam, 256, 256, 0, 0);
    seam.timeSeconds = 4; compare(backend, seam, 256, 256, 0, 0);
    f.settings.glow = 0; f.settings.diffusion = 0; f.settings.depth = 0; f.settings.grain = 0;
    for (auto& stop : f.settings.stops) { stop.enabled = true; stop.color = {-.5f, 4, 2, 1}; }
    compare(backend, f, 1, 1, 4, 2);
    compare(backend, f, 47, 31, 8, -2);
    f.downsampleX = .5f; f.downsampleY = .25f; f.pixelAspect = 1.3f;
    compare(backend, f, 45, 16, -5, -2);
    if (benchmark) for (auto size : {std::pair<int, int>{1920, 1080}, {3840, 2160}}) {
        f = Frame{}; f.layerWidth = size.first; f.layerHeight = size.second; f.settings.diffusion = .5f; f.settings.grain = .1f;
        compare(backend, f, size.first, size.second, 0, 0, true);
    }
    destroy_cuda_backend(backend);
    driver.cuCtxDestroy(context);
    return 0;
}
