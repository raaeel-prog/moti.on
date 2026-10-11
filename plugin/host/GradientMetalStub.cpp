// Windows build: Metal does not exist, so Gradient renders on the CPU only.
// GPU_DEVICE_SETUP already declines every non-Metal framework, so these are
// never reached with a live backend; they exist to satisfy the link.
#include "GradientMetal.h"

namespace motion::gradient {
MetalBackend* create_metal_backend(void*, std::string* error) {
    if (error) *error = "Metal unavailable on this platform";
    return nullptr;
}
void destroy_metal_backend(MetalBackend*) {}
Status render_metal(MetalBackend*, void*, const MetalBuffer&, const MetalBuffer&,
                    const Frame&, const MetalMemory&, std::string* error, AbortFn, void*) {
    if (error) *error = "Metal unavailable on this platform";
    return Status::unsupported;
}
} // namespace motion::gradient
