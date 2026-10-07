#include "GlitchKernel.h"
#include <array>
#include <cassert>
#include <cstdio>
#include <vector>
struct Pixel8 { std::uint8_t alpha, red, green, blue; };
struct Pixel16 { std::uint16_t alpha, red, green, blue; };

template<class Pixel> void pixels(unsigned maximum) {
    const auto c = [=](unsigned n) { return static_cast<decltype(Pixel{}.alpha)>(n * maximum / 255); };
    std::array<Pixel, 8> storage{{{c(255), c(100), c(20), c(30)}, {c(128),c(64),c(60),c(20)},
        {c(255),c(20),c(40),c(200)}, {}, {c(255),c(50),c(50),c(50)}, {}, {}, {}}};
    motion::ImageView<Pixel> src{storage.data(), 3, 2, static_cast<std::ptrdiff_t>(4 * sizeof(Pixel))};
    assert(src.valid());
    for(int y=0;y<2;++y) for(int x=0;x<3;++x) {
        const Pixel got = motion::glitch_pixel(src,x,y,{},maximum);
        const Pixel expected = src.sample(x,y);
        assert(std::memcmp(&got,&expected,sizeof(Pixel))==0);
    }
    assert(src.sample(-1,0).alpha==0 && src.sample(3,0).alpha==0 && src.sample(0,2).alpha==0);
    auto split = motion::glitch_pixel(src,1,0,{0,1},maximum);
    assert(split.alpha==c(128));
    assert(split.green==c(60));
    assert(split.red==static_cast<unsigned>(std::round(static_cast<double>(c(100))*c(128)/c(255))));
    assert(split.blue==static_cast<unsigned>(std::round(static_cast<double>(c(200))*c(128)/c(255))));
    assert(motion::glitch_pixel(src,0,0,{-2000,200},maximum).alpha==0);
    const auto shifted = motion::glitch_pixel(src,0,0,{1,0},maximum);
    assert(shifted.red==c(64) && shifted.alpha==c(128));
    motion::ImageView<Pixel> reversed{storage.data()+4,3,2,-static_cast<std::ptrdiff_t>(4*sizeof(Pixel))};
    assert(reversed.valid() && reversed.sample(0,1).red==c(100));
    motion::ImageView<Pixel> invalid{storage.data(),3,2,1};
    assert(!invalid.valid());
    motion::ImageView<Pixel> empty{nullptr,0,0,0};
    assert(empty.valid());
}
int main() {
    pixels<Pixel8>(255); pixels<Pixel16>(32768);
    motion::GlitchSettings s;
    s.intensity=0;
    for(int y=0;y<300;++y) { auto r=motion::prepare_row(s,y); assert(r.shift==0 && r.split==0); }
    s.intensity=1; s.displacement=100; s.frequency=0;
    auto a=motion::prepare_row(s,20); s.seconds=1234; auto b=motion::prepare_row(s,20);
    assert(a.shift==b.shift && a.split==b.split);
    assert(motion::event_index(-1,12)==4294967284U);
    assert(motion::event_index(0.001,12)==0 && motion::event_index(1,12)==12);
    s.frequency=12;
    std::vector<int> pattern;
    for(int y=0;y<300;++y) pattern.push_back(motion::prepare_row(s,y).shift);
    s.seconds+=1; bool different=false;
    for(int y=0;y<300;++y) different |= pattern[y] != motion::prepare_row(s,y).shift;
    assert(different);
    s.seconds-=1; for(int y=0;y<300;++y) assert(pattern[y]==motion::prepare_row(s,y).shift);
    s.seed+=1; different=false;
    for(int y=0;y<300;++y) different |= pattern[y] != motion::prepare_row(s,y).shift;
    assert(different);
    s.frequency=0;s.scale_x=1;s.scale_y=1;s.source_origin_y=0;
    auto full=motion::prepare_row(s,40);
    s.scale_x=.5;s.scale_y=.5;auto half=motion::prepare_row(s,20);
    assert(std::abs(half.shift*2-full.shift)<=1 && std::abs(half.split*2-full.split)<=1);
    s.source_origin_y=5;auto origin=motion::prepare_row(s,25);
    assert(origin.shift==half.shift);
    s.intensity=std::numeric_limits<double>::quiet_NaN();
    assert(motion::prepare_row(s,0).shift==0);
    std::puts("PASS: 8/16bpc, bypass, stride, alpha, bounds, determinism, seed, frequency, scale, origin");
}
