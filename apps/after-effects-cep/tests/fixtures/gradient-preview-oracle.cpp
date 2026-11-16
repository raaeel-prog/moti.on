// Standalone numeric oracle for the panel preview. Uses the real native kernel;
// compile with /std:c++17 /EHsc /O2 /I plugin/host (or equivalent C++17 flags).
#include "GradientKernel.h"
#include <iomanip>
#include <iostream>
using namespace motion::gradient;
int main() {
    Frame f; int w,h; std::cin >> w >> h >> f.layerWidth >> f.layerHeight >> f.pixelAspect >> f.timeSeconds;
    auto& s=f.settings;
    std::cin >> s.mode >> s.centerX >> s.centerY >> s.scale >> s.aspect >> s.angle >> s.cycles >> s.offset
        >> s.depth >> s.depthRadius >> s.bulge >> s.turbulence >> s.turbulenceScale >> s.seed
        >> s.glow >> s.glowRadius >> s.glowThreshold >> s.highlightProtection
        >> s.diffusion >> s.diffusionRadius >> s.focusX >> s.focusY >> s.focusRadius >> s.focusSoftness
        >> s.grain >> s.animation >> s.duration >> s.phase >> s.colorProcessing;
    for(auto& stop:s.stops) { int enabled;std::cin >> enabled >> stop.color.r >> stop.color.g >> stop.color.b >> stop.position;stop.enabled=enabled!=0; }
    if(!std::cin||w<1||w>512||h<1||h>512)return 2;
    f.downsampleX=float(w)/float(f.layerWidth);f.downsampleY=float(h)/float(f.layerHeight);
    std::vector<Pixel> source(std::size_t(w)*h), result(std::size_t(w)*h);
    for(auto& pixel:source)std::cin >> pixel.a;
    if(!std::cin||render_cpu({source.data(),w,h,w},{result.data(),w,h,w},f)!=Status::success)return 3;
    std::cout << '[' << std::setprecision(9);bool first=true;
    for(auto pixel:result)for(auto value:{pixel.r,pixel.g,pixel.b,pixel.a}) {if(!first)std::cout << ',';first=false;std::cout << value;}
    std::cout << ']';return 0;
}
