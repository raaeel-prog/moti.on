#ifndef MOTION_GRADIENT_CUDA_H
#define MOTION_GRADIENT_CUDA_H
// Gradient on CUDA, the NVIDIA GPU path After Effects uses on Windows
// ("Mercury GPU Acceleration (CUDA)"). Mirrors GradientMetal.h.
#include "GradientKernel.h"
#include <string>

namespace motion::gradient {
struct CudaBackend;
struct CudaWorld {
    unsigned long long pointer = 0;  // CUdeviceptr to BGRA float32 rows, as Adobe GPU worlds are
    int width = 0, height = 0;
    std::size_t rowBytes = 0;
    int originX = 0, originY = 0;
};
/** Device memory for intermediates, from After Effects' pool (PF_GPUDeviceSuite1). */
struct CudaMemory {
    void* context = nullptr;
    unsigned long long (*allocate)(void* context, std::size_t bytes) = nullptr;  // 0 on failure
    void (*release)(void* context, unsigned long long pointer) = nullptr;
};
/** True when the NVIDIA driver (nvcuda.dll / libcuda) can be loaded on this machine. */
bool cuda_available();
/** context: CUcontext After Effects renders with (null = the current one). */
CudaBackend* create_cuda_backend(void* context, std::string* error = nullptr);
void destroy_cuda_backend(CudaBackend* backend);
/** stream: CUstream After Effects renders with (null = default stream). Thread-safe. */
Status render_cuda(CudaBackend* backend, void* stream, const CudaWorld& source, const CudaWorld& destination,
                   const Frame& frame, const CudaMemory& memory, std::string* error = nullptr,
                   AbortFn abort = nullptr, void* abortContext = nullptr);
} // namespace motion::gradient
#endif
