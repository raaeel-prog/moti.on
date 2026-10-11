// Moti.on Gradient on DirectX 12 (NVIDIA, AMD, Intel and WARP through the same code).
// Same kernels as the Metal source (GradientMetalSource.h); the math is the one
// shared GradientMath.inc, so CPU, Metal and DirectX evaluate identical formulas.
// Compiled at build time by dxc (one entry point per kernel, cs_6_0, -Gis) and
// embedded in MotionCore.aex; GradientD3D12.cpp records all passes in one list.
#define fmin min
#define fmax max
#define fabs abs

// HLSL's atan2 is a fast approximation (~1e-4 relative on the angular shape,
// over the 1e-4 CPU parity budget). Metal runs with fast math off, so use the
// Cephes atanf reduction instead (~2e-7): same results as the CPU/Metal path.
float g_atan_unit(float x) {  // x >= 0
    float base = 0;
    if (x > 2.414213562373095f) { base = 1.5707963267948966f; x = -1.f / x; }
    else if (x > .4142135623730950f) { base = .7853981633974483f; x = (x - 1.f) / (x + 1.f); }
    float z = x * x;
    return base + ((((8.05374449538e-2f * z - 1.38776856032e-1f) * z + 1.99777106478e-1f) * z - 3.33329491539e-1f) * z * x + x);
}
float g_atan2(float y, float x) {
    if (x == 0 && y == 0) return 0;
    float ay = abs(y), ax = abs(x);
    float r = ax >= ay ? g_atan_unit(ay / ax) : 1.5707963267948966f - g_atan_unit(ax / ay);
    if (x < 0) r = 3.141592653589793f - r;
    return y < 0 ? -r : r;
}
#define atan2 g_atan2

#define GRADIENT_CODE(...) __VA_ARGS__
#include "GradientMath.inc"
#undef GRADIENT_CODE

// Root descriptors only (no descriptor heap): parameters (b0), per-dispatch
// constants (b1), the source world (t0) and up to three read/write buffers.
#define GRADIENT_ROOT "CBV(b0), RootConstants(num32BitConstants=10, b1), SRV(t0), UAV(u0), UAV(u1), UAV(u2)"

ConstantBuffer<GParams> P : register(b0);
struct GKernel {
    int viewWidth, viewHeight, viewOriginX, viewOriginY, viewStride;  // source or destination world, in pixels
    int radius, vertical;                                             // box blur
    float weight;                                                     // glow accumulation
    int pad;                                                          // finish: padding of the work buffers
    uint groupsX;                                                     // 2-D dispatch for large frames
};
ConstantBuffer<GKernel> K : register(b1);
ByteAddressBuffer Source : register(t0);
RWByteAddressBuffer U0 : register(u0);
RWByteAddressBuffer U1 : register(u1);
RWByteAddressBuffer U2 : register(u2);

#define GROUP 256

uint flat_index(uint3 group, uint lane) { return (group.y * K.groupsX + group.x) * GROUP + lane; }
GPixel load_px(RWByteAddressBuffer b, uint i) { float4 v = asfloat(b.Load4(i * 16)); return g_px(v.x, v.y, v.z, v.w); }
void store_px(RWByteAddressBuffer b, uint i, GPixel p) { b.Store4(i * 16, asuint(float4(p.r, p.g, p.b, p.a))); }

// Adobe GPU worlds are BGRA float32 with a row stride; alpha is channel 3.
float source_alpha(int x, int y) {
    int rx = x - K.viewOriginX, ry = y - K.viewOriginY;
    if (K.viewWidth <= 0 || rx < 0 || ry < 0 || rx >= K.viewWidth || ry >= K.viewHeight) return 0;
    float alpha = asfloat(Source.Load((uint(ry) * uint(K.viewStride) + uint(rx)) * 16 + 12));
    return isfinite(alpha) ? g_clamp(alpha, 0.f, 1.f) : 0.f;
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_alpha(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i >= uint(P.width * P.height)) return;
    int x = int(i % uint(P.width)) + P.originX, y = int(i / uint(P.width)) + P.originY;
    store_px(U0, i, g_px(0, 0, 0, source_alpha(x, y)));
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_base(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i >= uint(P.width * P.height)) return;
    int x = int(i % uint(P.width)) + P.originX, y = int(i / uint(P.width)) + P.originY;
    store_px(U1, i, g_base(P, x, y, source_alpha(x, y), load_px(U0, i).a));
}

// One thread per line; sums are rebased every 128 pixels exactly like the CPU.
[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_box(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint lineIndex = flat_index(group, lane);
    int lines = K.vertical ? P.width : P.height, length = K.vertical ? P.height : P.width, r = K.radius;
    if (lineIndex >= uint(lines)) return;
    int ln = int(lineIndex);
    GPixel sum = g_zero();
    float inverse = 1.f / float(2 * r + 1);
    for (int pos = 0; pos < length; pos++) {
        if ((pos & 127) == 0) {
            sum = g_zero();
            for (int n = max(0, pos - r); n <= min(length - 1, pos + r); n++)
                sum = g_add(sum, load_px(U0, uint(K.vertical ? n * P.width + ln : ln * P.width + n)));
        } else {
            int add = pos + r, sub = pos - r - 1;
            if (add < length) sum = g_add(sum, load_px(U0, uint(K.vertical ? add * P.width + ln : ln * P.width + add)));
            if (sub >= 0) sum = g_sub(sum, load_px(U0, uint(K.vertical ? sub * P.width + ln : ln * P.width + sub)));
        }
        store_px(U1, uint(K.vertical ? pos * P.width + ln : ln * P.width + pos), g_mul(sum, inverse));
    }
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_copy(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i < uint(P.width * P.height)) store_px(U1, i, load_px(U0, i));
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_diffusion(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i >= uint(P.width * P.height)) return;
    int x = int(i % uint(P.width)) + P.originX, y = int(i / uint(P.width)) + P.originY;
    store_px(U0, i, g_lerp(load_px(U0, i), load_px(U1, i), g_focus(P, x, y)));
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_extract(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i >= uint(P.width * P.height)) return;
    store_px(U2, i, g_zero());
    store_px(U1, i, g_extract(P, load_px(U0, i)));
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_accumulate(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i < uint(P.width * P.height)) store_px(U0, i, g_add(load_px(U0, i), g_mul(load_px(U1, i), K.weight)));
}

[RootSignature(GRADIENT_ROOT)]
[numthreads(GROUP, 1, 1)]
void gradient_finish(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    uint i = flat_index(group, lane);
    if (i >= uint(K.viewWidth * K.viewHeight)) return;
    int x = int(i % uint(K.viewWidth)), y = int(i / uint(K.viewWidth));
    uint index = uint((y + K.pad) * P.width + x + K.pad);
    GPixel halo = g_zero();  // HLSL's ?: does not take structs
    if (P.glow > 0) halo = load_px(U1, index);
    GPixel res = g_finish(P, load_px(U0, index), halo, x + K.viewOriginX, y + K.viewOriginY);
    U2.Store4((uint(y) * uint(K.viewStride) + uint(x)) * 16, asuint(float4(res.b, res.g, res.r, res.a)));
}
