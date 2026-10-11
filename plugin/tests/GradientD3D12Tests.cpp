// CPU × DirectX 12 parity for the Gradient (same scenarios and tolerance as
// GradientMetalTests.mm). Uses the default GPU; without one, the WARP software
// adapter, so the shaders are exercised on any Windows machine.
//   gradient-d3d12-tests [--warp] [--benchmark]
#include "GradientD3D12.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <d3d12.h>
#include <dxgi1_6.h>
#include <wrl/client.h>
#include <algorithm>
#include <cassert>
#include <chrono>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
using namespace motion::gradient;

namespace {
struct Gpu {
    ComPtr<ID3D12Device> device;
    ComPtr<ID3D12CommandQueue> queue;  // compute queue, like the one After Effects hands effects
    ComPtr<ID3D12CommandAllocator> allocator;
    ComPtr<ID3D12GraphicsCommandList> list;
    ComPtr<ID3D12Fence> fence;
    UINT64 value = 0;
    HANDLE event = nullptr;
    std::string name;

    void submit() {
        assert(SUCCEEDED(list->Close()));
        ID3D12CommandList* lists[] = {list.Get()};
        queue->ExecuteCommandLists(1, lists);
        assert(SUCCEEDED(queue->Signal(fence.Get(), ++value)));
        if (fence->GetCompletedValue() < value) { fence->SetEventOnCompletion(value, event); WaitForSingleObject(event, INFINITE); }
        assert(SUCCEEDED(allocator->Reset()));
        assert(SUCCEEDED(list->Reset(allocator.Get(), nullptr)));
    }
    ComPtr<ID3D12Resource> buffer(UINT64 bytes, D3D12_HEAP_TYPE type, D3D12_RESOURCE_FLAGS flags, D3D12_RESOURCE_STATES state) {
        D3D12_HEAP_PROPERTIES heap{type};
        D3D12_RESOURCE_DESC d{};
        d.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER; d.Width = bytes; d.Height = 1; d.DepthOrArraySize = 1;
        d.MipLevels = 1; d.SampleDesc.Count = 1; d.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR; d.Flags = flags;
        ComPtr<ID3D12Resource> r;
        assert(SUCCEEDED(device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &d, state, nullptr, IID_PPV_ARGS(&r))));
        return r;
    }
};

bool open_gpu(Gpu& g, bool warp) {
    ComPtr<IDXGIFactory4> factory;
    if (FAILED(CreateDXGIFactory2(0, IID_PPV_ARGS(&factory)))) return false;
    ComPtr<IDXGIAdapter1> adapter;
    if (warp) factory->EnumWarpAdapter(IID_PPV_ARGS(&adapter));
    else {
        ComPtr<IDXGIFactory6> f6;
        if (SUCCEEDED(factory.As(&f6))) f6->EnumAdapterByGpuPreference(0, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE, IID_PPV_ARGS(&adapter));
    }
    if (!adapter || FAILED(D3D12CreateDevice(adapter.Get(), D3D_FEATURE_LEVEL_11_0, IID_PPV_ARGS(&g.device)))) {
        if (warp) return false;
        return open_gpu(g, true);  // no usable hardware GPU: fall back to WARP
    }
    DXGI_ADAPTER_DESC1 desc{};
    adapter->GetDesc1(&desc);
    char name[256]{};
    WideCharToMultiByte(CP_UTF8, 0, desc.Description, -1, name, sizeof name, nullptr, nullptr);
    g.name = name;
    D3D12_COMMAND_QUEUE_DESC q{};
    q.Type = D3D12_COMMAND_LIST_TYPE_COMPUTE;
    return SUCCEEDED(g.device->CreateCommandQueue(&q, IID_PPV_ARGS(&g.queue))) &&
           SUCCEEDED(g.device->CreateCommandAllocator(q.Type, IID_PPV_ARGS(&g.allocator))) &&
           SUCCEEDED(g.device->CreateCommandList(0, q.Type, g.allocator.Get(), nullptr, IID_PPV_ARGS(&g.list))) &&
           SUCCEEDED(g.device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&g.fence))) &&
           (g.event = CreateEventW(nullptr, FALSE, FALSE, nullptr)) != nullptr;
}

void compare(Gpu& gpu, D3D12Backend* backend, Frame f, int w, int h, int ox, int oy, bool benchmark = false) {
    const int stride = w + 7;
    std::vector<Pixel> source(std::size_t(stride) * h), reference(std::size_t(stride) * h);
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        float a = w == 1 && h == 1 ? 1 : (x > 4 && y > 4 && x < w - 4 && y < h - 4) ? float((x * 13 + y * 17) % 101) / 100 : 0;
        source[std::size_t(y) * stride + x] = {a * .2f, a * .8f, a * .4f, a};
    }
    assert(render_cpu({source.data(), w, h, stride, ox, oy}, {reference.data(), w, h, stride, ox, oy}, f) == Status::success);
    const UINT64 bytes = UINT64(source.size()) * 16;
    auto input = gpu.buffer(bytes, D3D12_HEAP_TYPE_DEFAULT, D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_COMMON);
    auto output = gpu.buffer(bytes, D3D12_HEAP_TYPE_DEFAULT, D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS, D3D12_RESOURCE_STATE_COMMON);
    auto upload = gpu.buffer(bytes, D3D12_HEAP_TYPE_UPLOAD, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_GENERIC_READ);
    auto readback = gpu.buffer(bytes, D3D12_HEAP_TYPE_READBACK, D3D12_RESOURCE_FLAG_NONE, D3D12_RESOURCE_STATE_COPY_DEST);
    Pixel* raw = nullptr;
    assert(SUCCEEDED(upload->Map(0, nullptr, reinterpret_cast<void**>(&raw))));
    for (std::size_t i = 0; i < source.size(); i++) raw[i] = {source[i].b, source[i].g, source[i].r, source[i].a};  // Adobe BGRA
    upload->Unmap(0, nullptr);
    gpu.list->CopyBufferRegion(input.Get(), 0, upload.Get(), 0, bytes);
    gpu.submit();
    std::string error;
    const auto render = [&] {
        const auto status = render_d3d12(backend, {input.Get(), w, h, std::size_t(stride) * 16, ox, oy},
                                         {output.Get(), w, h, std::size_t(stride) * 16, ox, oy}, f, &error);
        if (status != Status::success) std::cerr << "DirectX 12 render failed: " << error << "\n";
        assert(status == Status::success);
    };
    render();
    gpu.list->CopyBufferRegion(readback.Get(), 0, output.Get(), 0, bytes);
    gpu.submit();
    D3D12_RANGE range{0, SIZE_T(bytes)};
    assert(SUCCEEDED(readback->Map(0, &range, reinterpret_cast<void**>(&raw))));
    float worst = 0;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        const auto i = std::size_t(y) * stride + x;
        const Pixel g{raw[i].b, raw[i].g, raw[i].r, raw[i].a};
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
    D3D12_RANGE none{0, 0};
    readback->Unmap(0, &none);
    std::cout << w << "x" << h << " mode=" << f.settings.mode << " space=" << f.settings.colorProcessing
              << " CPU/DirectX12 relative_error=" << worst << " PASS\n";
    if (benchmark) {
        std::vector<double> gpuTimes, cpuTimes;
        for (int i = 0; i < 5; i++) {
            auto start = std::chrono::steady_clock::now();
            render();
            gpuTimes.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
        }
        for (int i = 0; i < 2; i++) {
            auto start = std::chrono::steady_clock::now();
            render_cpu({source.data(), w, h, stride, ox, oy}, {reference.data(), w, h, stride, ox, oy}, f);
            cpuTimes.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
        }
        std::sort(gpuTimes.begin(), gpuTimes.end());
        std::sort(cpuTimes.begin(), cpuTimes.end());
        std::cout << w << "x" << h << " DirectX12 median_ms=" << gpuTimes[2] << " worst_ms=" << gpuTimes.back()
                  << " | CPU best_ms=" << cpuTimes[0] << "\n";
    }
}
}  // namespace

int main(int argc, char** argv) {
    bool warp = false, benchmark = false;
    for (int i = 1; i < argc; i++) {
        if (std::string(argv[i]) == "--warp") warp = true;
        if (std::string(argv[i]) == "--benchmark") benchmark = true;
    }
    Gpu gpu;
    if (!open_gpu(gpu, warp)) { std::cerr << "DirectX 12 device unavailable: NOT RUN\n"; return 77; }
    std::string error;
    D3D12Backend* backend = create_d3d12_backend(gpu.device.Get(), gpu.queue.Get(), &error);
    if (!backend) { std::cerr << "DirectX 12 setup failed: " << error << "\n"; return 1; }
    std::cout << "DirectX 12 adapter: " << gpu.name << "\n";

    Frame f; f.layerWidth = 89; f.layerHeight = 61; f.settings.depthRadius = 8; f.settings.glowRadius = 7;
    f.settings.diffusionRadius = 9; f.settings.diffusion = .75f; f.settings.focusRadius = .01f;
    f.settings.glow = 1; f.settings.glowThreshold = .05f; f.settings.grain = .4f; f.settings.animation = 1; f.timeSeconds = .71;
    for (int mode = 0; mode < 3; mode++) for (int color = 0; color < 2; color++) {
        f.settings.mode = mode; f.settings.colorProcessing = color; compare(gpu, backend, f, 89, 61, -13, -7);
    }
    // Strongly different HDR endpoints exercise mirrored turns and the
    // fractional angular branch in the same shared CPU/HLSL source.
    Frame seam; seam.layerWidth = 256; seam.layerHeight = 256;
    seam.settings.depth = 0; seam.settings.bulge = 0; seam.settings.turbulence = 0;
    seam.settings.glow = 0; seam.settings.diffusion = 0; seam.settings.grain = 0;
    seam.settings.cycles = 1.35f; seam.settings.offset = .27f;
    for (auto& stop : seam.settings.stops) stop.enabled = false;
    seam.settings.stops[0] = {true, {-.25f, 0, 0, 1}, 0};
    seam.settings.stops[7] = {true, {4, 1, .5f, 1}, 1};
    for (int mode = 0; mode < 3; mode++) { seam.settings.mode = mode; compare(gpu, backend, seam, 256, 256, 0, 0); }
    seam.settings.animation = 1; seam.timeSeconds = 4. - 1. / 30.;
    compare(gpu, backend, seam, 256, 256, 0, 0);
    seam.timeSeconds = 4; compare(gpu, backend, seam, 256, 256, 0, 0);
    f.settings.glow = 0; f.settings.diffusion = 0; f.settings.depth = 0; f.settings.grain = 0;
    for (auto& stop : f.settings.stops) { stop.enabled = true; stop.color = {-.5f, 4, 2, 1}; }
    compare(gpu, backend, f, 1, 1, 4, 2);
    compare(gpu, backend, f, 47, 31, 8, -2);
    f.downsampleX = .5f; f.downsampleY = .25f; f.pixelAspect = 1.3f;
    compare(gpu, backend, f, 45, 16, -5, -2);
    if (benchmark) for (auto size : {std::pair<int, int>{1920, 1080}, {3840, 2160}}) {
        f = Frame{}; f.layerWidth = size.first; f.layerHeight = size.second; f.settings.diffusion = .5f; f.settings.grain = .1f;
        compare(gpu, backend, f, size.first, size.second, 0, 0, true);
    }
    destroy_d3d12_backend(backend);
    CloseHandle(gpu.event);
    return 0;
}
