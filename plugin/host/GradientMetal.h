#ifndef MOTION_GRADIENT_METAL_H
#define MOTION_GRADIENT_METAL_H
#include "GradientKernel.h"
#include <string>

namespace motion::gradient {
struct MetalBackend;
struct MetalBuffer {
    void* buffer = nullptr; // id<MTLBuffer>; external Adobe pixels are BGRA float32
    int width = 0, height = 0;
    std::size_t rowBytes = 0;
    int originX = 0, originY = 0;
};
struct MetalMemory {
    void* context = nullptr;
    void* (*allocate)(void* context, std::size_t bytes) = nullptr;
    void (*release)(void* context, void* buffer) = nullptr;
};
MetalBackend* create_metal_backend(void* device, std::string* error = nullptr);
void destroy_metal_backend(MetalBackend* backend);
Status render_metal(MetalBackend* backend, void* commandQueue,
                    const MetalBuffer& source, const MetalBuffer& destination,
                    const Frame& frame, const MetalMemory& memory,
                    std::string* error = nullptr, AbortFn abort = nullptr,
                    void* abortContext = nullptr);
} // namespace motion::gradient
#endif
