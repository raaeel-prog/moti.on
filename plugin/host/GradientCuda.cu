// Moti.on Gradient on CUDA (NVIDIA): the same kernels as the Metal source and
// GradientD3D12.hlsl, over the one shared GradientMath.inc. nvcc compiles this
// to PTX at build time (no fast math); GradientCuda.cpp embeds the PTX and loads
// it with the CUDA driver API inside the context After Effects provides.
typedef unsigned int uint;
#define inline __device__ __forceinline__
#define GRADIENT_CODE(...) __VA_ARGS__
#include "GradientMath.inc"
#undef GRADIENT_CODE
#undef inline

struct GView { int width, height, originX, originY, stride; };
struct GBlur { int radius, vertical; };

__device__ __forceinline__ unsigned long long thread_index() {
    return (unsigned long long)blockIdx.x * blockDim.x + threadIdx.x;
}
// Adobe GPU worlds are BGRA float32 rows; alpha is the fourth float.
__device__ __forceinline__ float source_alpha(const float4* source, GView v, int x, int y) {
    int rx = x - v.originX, ry = y - v.originY;
    if (!source || v.width <= 0 || rx < 0 || ry < 0 || rx >= v.width || ry >= v.height) return 0;
    float alpha = source[(long long)ry * v.stride + rx].w;
    return isfinite(alpha) ? g_clamp(alpha, 0.f, 1.f) : 0.f;
}

extern "C" __global__ void gradient_alpha(const float4* source, GPixel* out, GView v, GParams p) {
    unsigned long long i = thread_index();
    if (i >= (unsigned long long)p.width * p.height) return;
    int x = int(i % p.width) + p.originX, y = int(i / p.width) + p.originY;
    out[i] = g_px(0, 0, 0, source_alpha(source, v, x, y));
}

extern "C" __global__ void gradient_base(const float4* source, const GPixel* depth, GPixel* out, GView v, GParams p) {
    unsigned long long i = thread_index();
    if (i >= (unsigned long long)p.width * p.height) return;
    int x = int(i % p.width) + p.originX, y = int(i / p.width) + p.originY;
    out[i] = g_base(p, x, y, source_alpha(source, v, x, y), depth[i].a);
}

// One thread per line; sums are rebased every 128 pixels exactly like the CPU.
extern "C" __global__ void gradient_box(const GPixel* src, GPixel* dst, GParams p, GBlur b) {
    unsigned long long line = thread_index();
    int lines = b.vertical ? p.width : p.height, length = b.vertical ? p.height : p.width, r = b.radius;
    if (line >= (unsigned long long)lines) return;
    long long ln = (long long)line, w = p.width;
    GPixel sum = g_zero();
    float inverse = 1.f / float(2 * r + 1);
    for (int pos = 0; pos < length; pos++) {
        if ((pos & 127) == 0) {
            sum = g_zero();
            for (int n = max(0, pos - r); n <= min(length - 1, pos + r); n++)
                sum = g_add(sum, src[b.vertical ? n * w + ln : ln * w + n]);
        } else {
            int add = pos + r, sub = pos - r - 1;
            if (add < length) sum = g_add(sum, src[b.vertical ? add * w + ln : ln * w + add]);
            if (sub >= 0) sum = g_sub(sum, src[b.vertical ? sub * w + ln : ln * w + sub]);
        }
        dst[b.vertical ? pos * w + ln : ln * w + pos] = g_mul(sum, inverse);
    }
}

extern "C" __global__ void gradient_copy(const GPixel* src, GPixel* dst, GParams p) {
    unsigned long long i = thread_index();
    if (i < (unsigned long long)p.width * p.height) dst[i] = src[i];
}

extern "C" __global__ void gradient_diffusion(GPixel* base, const GPixel* blurred, GParams p) {
    unsigned long long i = thread_index();
    if (i >= (unsigned long long)p.width * p.height) return;
    int x = int(i % p.width) + p.originX, y = int(i / p.width) + p.originY;
    base[i] = g_lerp(base[i], blurred[i], g_focus(p, x, y));
}

extern "C" __global__ void gradient_extract(const GPixel* base, GPixel* work, GPixel* halo, GParams p) {
    unsigned long long i = thread_index();
    if (i >= (unsigned long long)p.width * p.height) return;
    halo[i] = g_zero();
    work[i] = g_extract(p, base[i]);
}

extern "C" __global__ void gradient_accumulate(GPixel* halo, const GPixel* work, GParams p, float weight) {
    unsigned long long i = thread_index();
    if (i < (unsigned long long)p.width * p.height) halo[i] = g_add(halo[i], g_mul(work[i], weight));
}

extern "C" __global__ void gradient_finish(const GPixel* base, const GPixel* halo, float4* output, GView v, GParams p, int pad) {
    unsigned long long i = thread_index();
    if (i >= (unsigned long long)v.width * v.height) return;
    int x = int(i % v.width), y = int(i / v.width);
    long long index = (long long)(y + pad) * p.width + x + pad;
    GPixel res = g_finish(p, base[index], p.glow > 0 ? halo[index] : g_zero(), x + v.originX, y + v.originY);
    output[(long long)y * v.stride + x] = make_float4(res.b, res.g, res.r, res.a);
}
