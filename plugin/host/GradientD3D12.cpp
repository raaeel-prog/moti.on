// DirectX 12 executor for the Gradient kernels (GradientD3D12.hlsl, embedded by dxc).
//
// Unlike the SDK sample's per-dispatch wait, a frame is one command list: every
// pass is recorded with a UAV barrier between dispatches, executed once on the
// queue After Effects gave us, and waited on with our own fence. Intermediate
// buffers are kept across frames (grown on demand). One mutex serializes frames:
// the command allocator, list and buffers belong to the backend.
#include "GradientD3D12.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <d3d12.h>
#include <wrl/client.h>
#include <climits>
#include <cstring>
#include <mutex>

#include "gradient_d3d12_alpha.h"
#include "gradient_d3d12_base.h"
#include "gradient_d3d12_box.h"
#include "gradient_d3d12_copy.h"
#include "gradient_d3d12_diffusion.h"
#include "gradient_d3d12_extract.h"
#include "gradient_d3d12_accumulate.h"
#include "gradient_d3d12_finish.h"

using Microsoft::WRL::ComPtr;

namespace motion::gradient {
namespace {
enum Pipeline { Alpha, Base, Box, Copy, Diffusion, Extract, Accumulate, Finish, PipelineCount };
struct Bytecode { const void* data; std::size_t size; };
const Bytecode kBytecode[PipelineCount] = {
    {g_gradient_alpha, sizeof(g_gradient_alpha)}, {g_gradient_base, sizeof(g_gradient_base)},
    {g_gradient_box, sizeof(g_gradient_box)}, {g_gradient_copy, sizeof(g_gradient_copy)},
    {g_gradient_diffusion, sizeof(g_gradient_diffusion)}, {g_gradient_extract, sizeof(g_gradient_extract)},
    {g_gradient_accumulate, sizeof(g_gradient_accumulate)}, {g_gradient_finish, sizeof(g_gradient_finish)}};

// Must match GKernel in GradientD3D12.hlsl (10 root constants at b1).
struct KernelConstants {
    int viewWidth = 0, viewHeight = 0, viewOriginX = 0, viewOriginY = 0, viewStride = 0;
    int radius = 0, vertical = 0;
    float weight = 0;
    int pad = 0;
    unsigned groupsX = 1;
};
static_assert(sizeof(KernelConstants) == 40, "root constants layout");
enum RootSlot { SlotParams, SlotConstants, SlotSource, SlotU0, SlotU1, SlotU2 };
constexpr unsigned kGroup = 256, kMaxGroupsX = 65535;
constexpr UINT64 kParamsBytes = (sizeof(detail::GParams) + 255) & ~UINT64(255);

void say(std::string* error, const char* text) { if (error) *error = text; }

D3D12_RESOURCE_DESC buffer_desc(UINT64 bytes, D3D12_RESOURCE_FLAGS flags) {
    D3D12_RESOURCE_DESC d{};
    d.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
    d.Width = bytes;
    d.Height = 1;
    d.DepthOrArraySize = 1;
    d.MipLevels = 1;
    d.SampleDesc.Count = 1;
    d.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
    d.Flags = flags;
    return d;
}
}  // namespace

struct D3D12Backend {
    std::mutex mutex;
    ComPtr<ID3D12Device> device;
    ComPtr<ID3D12CommandQueue> queue;
    ComPtr<ID3D12RootSignature> root;
    ComPtr<ID3D12PipelineState> pipelines[PipelineCount];
    ComPtr<ID3D12CommandAllocator> allocator;
    ComPtr<ID3D12GraphicsCommandList> list;
    ComPtr<ID3D12Fence> fence;
    UINT64 fenceValue = 0;
    HANDLE event = nullptr;
    ComPtr<ID3D12Resource> params;   // upload heap, mapped once
    void* paramsMapped = nullptr;
    ComPtr<ID3D12Resource> buffers[4];  // base, work, temp, halo
    UINT64 bufferBytes = 0;
    ~D3D12Backend() {
        if (params && paramsMapped) params->Unmap(0, nullptr);
        if (event) CloseHandle(event);
    }
};

void destroy_d3d12_backend(D3D12Backend* backend) { delete backend; }

D3D12Backend* create_d3d12_backend(void* devicePointer, void* queuePointer, std::string* error) {
    if (!devicePointer || !queuePointer) { say(error, "DirectX 12 device unavailable"); return nullptr; }
    auto* b = new (std::nothrow) D3D12Backend;
    if (!b) { say(error, "DirectX 12 backend allocation failed"); return nullptr; }
    // ComPtr adds a reference: the device/queue stay alive as long as the backend.
    b->device = static_cast<ID3D12Device*>(devicePointer);
    b->queue = static_cast<ID3D12CommandQueue*>(queuePointer);
    const D3D12_COMMAND_LIST_TYPE type = b->queue->GetDesc().Type;  // a list must match its queue
    // Every kernel carries the same embedded root signature.
    if (FAILED(b->device->CreateRootSignature(0, kBytecode[0].data, kBytecode[0].size, IID_PPV_ARGS(&b->root)))) {
        say(error, "DirectX 12 root signature rejected"); delete b; return nullptr;
    }
    for (int i = 0; i < PipelineCount; ++i) {
        D3D12_COMPUTE_PIPELINE_STATE_DESC desc{};
        desc.pRootSignature = b->root.Get();
        desc.CS = {kBytecode[i].data, kBytecode[i].size};
        if (FAILED(b->device->CreateComputePipelineState(&desc, IID_PPV_ARGS(&b->pipelines[i])))) {
            say(error, "DirectX 12 compute pipeline rejected"); delete b; return nullptr;
        }
    }
    D3D12_HEAP_PROPERTIES upload{D3D12_HEAP_TYPE_UPLOAD};
    const auto paramsDesc = buffer_desc(kParamsBytes, D3D12_RESOURCE_FLAG_NONE);
    if (FAILED(b->device->CreateCommandAllocator(type, IID_PPV_ARGS(&b->allocator))) ||
        FAILED(b->device->CreateCommandList(0, type, b->allocator.Get(), nullptr, IID_PPV_ARGS(&b->list))) ||
        FAILED(b->list->Close()) ||
        FAILED(b->device->CreateFence(0, D3D12_FENCE_FLAG_NONE, IID_PPV_ARGS(&b->fence))) ||
        !(b->event = CreateEventW(nullptr, FALSE, FALSE, nullptr)) ||
        FAILED(b->device->CreateCommittedResource(&upload, D3D12_HEAP_FLAG_NONE, &paramsDesc,
            D3D12_RESOURCE_STATE_GENERIC_READ, nullptr, IID_PPV_ARGS(&b->params))) ||
        FAILED(b->params->Map(0, nullptr, &b->paramsMapped))) {
        say(error, "DirectX 12 command objects unavailable"); delete b; return nullptr;
    }
    return b;
}

namespace {
bool ensure_buffers(D3D12Backend& b, UINT64 bytes) {
    if (bytes <= b.bufferBytes) return true;
    for (auto& buffer : b.buffers) buffer.Reset();
    b.bufferBytes = 0;
    D3D12_HEAP_PROPERTIES heap{D3D12_HEAP_TYPE_DEFAULT};
    const auto desc = buffer_desc(bytes, D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS);
    for (auto& buffer : b.buffers)
        if (FAILED(b.device->CreateCommittedResource(&heap, D3D12_HEAP_FLAG_NONE, &desc, D3D12_RESOURCE_STATE_COMMON,
                                                     nullptr, IID_PPV_ARGS(&buffer)))) {
            for (auto& created : b.buffers) created.Reset();
            return false;
        }
    b.bufferBytes = bytes;
    return true;
}

bool world_valid(const D3D12World& v) {
    if (v.rowBytes % 16 || v.rowBytes / 16 > std::size_t(INT_MAX)) return false;
    return detail::image_valid(v.width, v.height, std::ptrdiff_t(v.rowBytes / 16), v.resource);
}

bool world_fits(ID3D12Resource* resource, const D3D12World& v) {
    if (!v.width || !v.height) return true;
    const UINT64 needed = UINT64(v.height - 1) * v.rowBytes + UINT64(v.width) * 16;
    return resource && resource->GetDesc().Dimension == D3D12_RESOURCE_DIMENSION_BUFFER && resource->GetDesc().Width >= needed;
}
}  // namespace

Status render_d3d12(D3D12Backend* backend, const D3D12World& source, const D3D12World& dest, const Frame& f,
                    std::string* error, AbortFn abort, void* ctx) {
    using namespace detail;
    if (!backend) return Status::unsupported;
    if (!world_valid(source) || !world_valid(dest)) return Status::failure;
    if (!dest.width || !dest.height) return Status::success;
    if (cancelled(abort, ctx)) return Status::cancelled;
    auto* input = static_cast<ID3D12Resource*>(source.resource);
    auto* output = static_cast<ID3D12Resource*>(dest.resource);
    if (!world_fits(input, source) || !world_fits(output, dest)) {
        say(error, "DirectX 12 world buffer is shorter than its declared extent");
        return Status::failure;
    }
    const int pad = required_padding(f);
    int w, h, ox, oy;
    std::size_t count;
    Image geometryView{nullptr, dest.width, dest.height, 0, dest.originX, dest.originY};
    if (!geometry(geometryView, pad, w, h, ox, oy, count)) return Status::outOfMemory;

    std::lock_guard<std::mutex> lock(backend->mutex);
    auto& b = *backend;
    if (FAILED(b.device->GetDeviceRemovedReason())) { say(error, "DirectX 12 device was removed"); return Status::unsupported; }
    if (!ensure_buffers(b, UINT64(count) * sizeof(GPixel))) { say(error, "DirectX 12 intermediate allocation failed"); return Status::outOfMemory; }

    const GParams p = prepare(f, w, h, ox, oy);
    std::memcpy(b.paramsMapped, &p, sizeof(p));
    if (FAILED(b.allocator->Reset()) || FAILED(b.list->Reset(b.allocator.Get(), nullptr))) {
        say(error, "DirectX 12 command list reset failed");
        return Status::failure;
    }
    auto* list = b.list.Get();
    list->SetComputeRootSignature(b.root.Get());
    list->SetComputeRootConstantBufferView(SlotParams, b.params->GetGPUVirtualAddress());
    // A missing source reads as transparent (viewWidth 0); the slot still needs a valid address.
    list->SetComputeRootShaderResourceView(SlotSource, input ? input->GetGPUVirtualAddress() : b.params->GetGPUVirtualAddress());
    const auto address = [](ID3D12Resource* r) { return r->GetGPUVirtualAddress(); };
    ID3D12Resource* base = b.buffers[0].Get();
    ID3D12Resource* work = b.buffers[1].Get();
    ID3D12Resource* temp = b.buffers[2].Get();
    ID3D12Resource* halo = b.buffers[3].Get();

    const KernelConstants sourceView{source.width, source.height, source.originX, source.originY, int(source.rowBytes / 16)};
    D3D12_RESOURCE_BARRIER barrier{};
    barrier.Type = D3D12_RESOURCE_BARRIER_TYPE_UAV;  // null resource: every UAV write before is visible after
    const auto dispatch = [&](Pipeline which, KernelConstants k, std::size_t threads,
                              ID3D12Resource* u0, ID3D12Resource* u1, ID3D12Resource* u2) {
        const UINT64 groups = (UINT64(threads) + kGroup - 1) / kGroup;
        const UINT gx = UINT(groups < kMaxGroupsX ? groups : kMaxGroupsX);
        const UINT gy = UINT((groups + gx - 1) / gx);
        k.groupsX = gx;
        list->SetPipelineState(b.pipelines[which].Get());
        list->SetComputeRoot32BitConstants(SlotConstants, 10, &k, 0);
        list->SetComputeRootUnorderedAccessView(SlotU0, address(u0));
        list->SetComputeRootUnorderedAccessView(SlotU1, address(u1 ? u1 : u0));
        list->SetComputeRootUnorderedAccessView(SlotU2, address(u2 ? u2 : u0));
        list->Dispatch(gx, gy, 1);
        list->ResourceBarrier(1, &barrier);
    };
    const auto blur = [&](int rx, int ry) {
        KernelConstants k{};
        k.radius = rx; k.vertical = 0; dispatch(Box, k, std::size_t(h), work, temp, nullptr);
        k.radius = ry; k.vertical = 1; dispatch(Box, k, std::size_t(w), temp, work, nullptr);
    };

    dispatch(Alpha, input ? sourceView : KernelConstants{}, count, work, nullptr, nullptr);
    if (p.depth > 0) for (int i = 0; i < 3; ++i) blur(radius(f.settings.depthRadius, p.dx), radius(f.settings.depthRadius, p.dy));
    dispatch(Base, input ? sourceView : KernelConstants{}, count, work, base, nullptr);
    if (p.diffusion > 0) {
        dispatch(Copy, {}, count, base, work, nullptr);
        for (int i = 0; i < 3; ++i) blur(radius(f.settings.diffusionRadius, p.dx), radius(f.settings.diffusionRadius, p.dy));
        dispatch(Diffusion, {}, count, base, work, nullptr);
    }
    if (p.glow > 0) {
        dispatch(Extract, {}, count, base, work, halo);
        for (int i = 0; i < 3; ++i) {
            blur(radius(f.settings.glowRadius, p.dx), radius(f.settings.glowRadius, p.dy));
            KernelConstants k{};
            k.weight = i == 0 ? .5f : i == 1 ? .3f : .2f;
            dispatch(Accumulate, k, count, halo, work, nullptr);
        }
    }
    KernelConstants finish{dest.width, dest.height, dest.originX, dest.originY, int(dest.rowBytes / 16)};
    finish.pad = pad;
    dispatch(Finish, finish, std::size_t(dest.width) * dest.height, base, halo, output);

    if (FAILED(list->Close())) { say(error, "DirectX 12 command list rejected"); return Status::failure; }
    if (cancelled(abort, ctx)) return Status::cancelled;  // nothing was submitted
    ID3D12CommandList* lists[] = {list};
    b.queue->ExecuteCommandLists(1, lists);
    const UINT64 value = ++b.fenceValue;
    if (FAILED(b.queue->Signal(b.fence.Get(), value))) { say(error, "DirectX 12 queue signal failed"); return Status::failure; }
    if (b.fence->GetCompletedValue() < value) {
        if (FAILED(b.fence->SetEventOnCompletion(value, b.event))) { say(error, "DirectX 12 fence wait failed"); return Status::failure; }
        WaitForSingleObject(b.event, INFINITE);
    }
    if (FAILED(b.device->GetDeviceRemovedReason())) { say(error, "DirectX 12 device was removed while rendering"); return Status::failure; }
    return cancelled(abort, ctx) ? Status::cancelled : Status::success;
}
}  // namespace motion::gradient
