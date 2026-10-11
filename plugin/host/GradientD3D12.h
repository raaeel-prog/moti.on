#ifndef MOTION_GRADIENT_D3D12_H
#define MOTION_GRADIENT_D3D12_H
// Gradient on DirectX 12, the Windows GPU path (After Effects hands effects a
// D3D12 device and queue on NVIDIA, AMD and Intel). Mirrors GradientMetal.h.
#include "GradientKernel.h"
#include <string>

namespace motion::gradient {
struct D3D12Backend;
struct D3D12World {
    void* resource = nullptr;  // ID3D12Resource*: BGRA float32 rows, as Adobe GPU worlds are
    int width = 0, height = 0;
    std::size_t rowBytes = 0;
    int originX = 0, originY = 0;
};
/** device: ID3D12Device*, queue: ID3D12CommandQueue* (the ones After Effects renders with). */
D3D12Backend* create_d3d12_backend(void* device, void* queue, std::string* error = nullptr);
void destroy_d3d12_backend(D3D12Backend* backend);
/** Records every pass in one command list on the backend's queue and waits for it. Thread-safe. */
Status render_d3d12(D3D12Backend* backend, const D3D12World& source, const D3D12World& destination,
                    const Frame& frame, std::string* error = nullptr, AbortFn abort = nullptr,
                    void* abortContext = nullptr);
} // namespace motion::gradient
#endif
