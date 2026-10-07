#include "TransitionKernel.h"
#include <cassert>
#include <chrono>
#include <future>
#include <iostream>
#include <vector>

template<class C> struct Pixel { C alpha, red, green, blue; };
using P8 = Pixel<std::uint8_t>; using P16 = Pixel<std::uint16_t>; using PF = Pixel<float>;
template<class P> motion::ImageView<P> view(const std::vector<P>& p,int w,int h) { return {p.data(),w,h,std::ptrdiff_t(w*sizeof(P))}; }
template<class P> bool same(P a,P b) { return std::memcmp(&a,&b,sizeof(P))==0; }

template<class P> void depthTests(double maximum) {
    constexpr int w=37,h=23;
    std::vector<P> src(w*h); using C=decltype(P{}.red);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
        const double alpha=double((x*23+y*31)%101)/100;
        src[y*w+x]={C(alpha*maximum),C(alpha*maximum*x/(w-1)),C(alpha*maximum*y/(h-1)),C(alpha*maximum*.4)};
    }
    auto img=view(src,w,h);
    for(int style=1;style<=6;style++) {
        motion::TransitionSettings settings;settings.style=style;settings.frame_width=w;settings.frame_height=h;
        settings.samples=16;settings.flow=-.6;settings.angle_degrees=37;
        for(int y=0;y<h;y++)for(int x=0;x<w;x++)assert(same(motion::transition_pixel(img,x,y,motion::prepare_transition(settings),maximum),src[y*w+x]));
        settings.amount=.83;auto g=motion::prepare_transition(settings);
        for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            auto p=motion::transition_pixel(img,x,y,g,maximum);
            assert(std::isfinite(p.alpha)&&p.alpha>=0&&p.alpha<=maximum);
            assert(p.red<=p.alpha+1e-4&&p.green<=p.alpha+1e-4&&p.blue<=p.alpha+1e-4);
        }
        const P color={C(maximum),C(maximum*.4),C(maximum*.7),C(maximum*.2)};
        std::vector<P> solid(w*h,color);
        for(int y=0;y<h;y++)for(int x=0;x<w;x++){
            auto p=motion::transition_pixel(view(solid,w,h),x,y,g,maximum);
            assert(std::abs(double(p.alpha)-color.alpha)<1e-4);
            assert(std::abs(double(p.red)-color.red)<1e-4);assert(std::abs(double(p.green)-color.green)<1e-4);
        }
    }
}

static std::vector<P8> fixture(int w,int h) {
    std::vector<P8> data(w*h);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
        const bool grid=(x%(w/12+1)<3||y%(h/9+1)<3),center=std::hypot(x-w*.46,y-h*.57)<h*.17;
        data[y*w+x]={255,std::uint8_t(center?240:grid?20:30+200*x/w),std::uint8_t(center?140:grid?220:20+180*y/h),std::uint8_t(center?40:grid?240:50)};
    }return data;
}
static std::vector<P8> render(const std::vector<P8>& src,int w,int h,int style,double flow=.65) {
    motion::TransitionSettings s;s.amount=.78;s.style=style;s.flow=flow;s.angle_degrees=style==5?-28:15;s.samples=(style==1||style==5)?64:style==6?16:24;s.frame_width=w;s.frame_height=h;
    auto g=motion::prepare_transition(s);auto image=view(src,w,h);std::vector<P8> out(w*h);
    for(int y=0;y<h;y++)for(int x=0;x<w;x++)out[y*w+x]=motion::transition_pixel(image,x,y,g,255);
    return out;
}
static double difference(const std::vector<P8>& a,const std::vector<P8>& b) {
    double d=0;for(std::size_t i=0;i<a.size();i++)d+=std::abs(int(a[i].red)-b[i].red)+std::abs(int(a[i].green)-b[i].green)+std::abs(int(a[i].blue)-b[i].blue);
    return d/(3*a.size());
}

int main(int argc,char** argv) {
    depthTests<P8>(255);depthTests<P16>(32768);depthTests<PF>(1);
    // HDR and RGB underneath zero alpha are not rounded or clamped at neutral.
    std::vector<PF> hdr={{0,-1.7f,4.2f,16.f},{1,-.5f,8.f,2.f}};
    motion::TransitionSettings s;s.frame_width=2;s.frame_height=1;
    for(int x=0;x<2;x++)assert(same(hdr[x],motion::transition_pixel(view(hdr,2,1),x,0,motion::prepare_transition(s),1)));
    s.amount=.7;std::vector<PF> solidHDR(12,PF{1,-.5f,8.f,2.f});s.frame_width=4;s.frame_height=3;
    for(int style=1;style<=6;style++){s.style=style;auto p=motion::transition_pixel(view(solidHDR,4,3),1,1,motion::prepare_transition(s),1);assert(p.green>7.99&&p.red<-.49);}
    s.amount=1;s.samples=100000;s.style=100;s.flow=1e9;s.angle_degrees=INFINITY;
    auto invalid=motion::prepare_transition(s);assert(invalid.samples==128&&invalid.style==6&&invalid.flow==1);
    s.amount=NAN;assert(motion::prepare_transition(s).amount==0);
    assert(motion::transition_mirror(-1,8)==1&&motion::transition_mirror(8,8)==6);
    std::vector<P8> one={{255,30,120,230}};s.amount=1;s.frame_width=s.frame_height=1;
    for(int style=1;style<=6;style++){s.style=style;assert(same(one[0],motion::transition_pixel(view(one,1,1),0,0,motion::prepare_transition(s),255)));}
    // Origins and negative row strides obey the same identity contract.
    std::vector<P8> rows={{255,10,20,30},{255,40,50,60},{255,70,80,90},{255,100,110,120}};
    motion::ImageView<P8> reverse{rows.data()+2,2,2,-std::ptrdiff_t(2*sizeof(P8))};assert(reverse.valid());
    s.amount=0;assert(same(rows[2],motion::transition_pixel(reverse,9,11,motion::prepare_transition(s),255,9,11)));
    // Downsampling and non-square pixels preserve the normalized path.
    s.amount=.7;s.frame_width=1920;s.frame_height=1080;s.style=3;s.samples=9;s.flow=.7;s.angle_degrees=0;
    auto full=motion::prepare_transition(s);s.frame_width=960;s.frame_height=540;s.downsample_x=s.downsample_y=.5;
    auto half=motion::prepare_transition(s);auto f=motion::transition_coordinate(800,300,full,.25),d=motion::transition_coordinate(399.75,149.75,half,.25);
    assert(std::abs((f.x+.5)*.5-.5-d.x)<1e-9&&std::abs((f.y+.5)*.5-.5-d.y)<1e-9);
    auto src=fixture(160,90);std::vector<std::vector<P8>> outputs;
    for(int style=1;style<=6;style++) {
        outputs.push_back(render(src,160,90,style));assert(difference(src,outputs.back())>4);
        for(auto p:outputs.back())assert(p.alpha==255); // mirrored border never introduces black transparency
    }
    for(int i=0;i<6;i++)for(int j=i+1;j<6;j++){const double d=difference(outputs[i],outputs[j]);assert(d>2);std::cout<<"styles "<<i+1<<"/"<<j+1<<" MAE="<<d<<"\n";}
    assert(difference(outputs[0],render(src,160,90,1,-.65))>4);
    auto parallel=std::async(std::launch::async,[&]{return render(src,160,90,6);});assert(difference(parallel.get(),outputs[5])==0);
    std::cout<<"Transition kernel: identity, 8/16/32 bpc, HDR, alpha, mirror edges, origins, scale, style separation, determinism PASS\n";
    if(argc>1&&std::string(argv[1])=="--benchmark") {
        for(auto size: {std::pair<int,int>{640,360},{1920,1080}}) {
            auto image=fixture(size.first,size.second);
            for(int style=1;style<=6;style++) {
                render(image,size.first,size.second,style);std::vector<double> times;
                for(int run=0;run<5;run++) {auto start=std::chrono::steady_clock::now();auto result=render(image,size.first,size.second,style);assert(result.size()==image.size());
                    times.push_back(std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count());}
                std::sort(times.begin(),times.end());std::cout<<size.first<<"x"<<size.second<<" style="<<style<<" samples="<<((style==1||style==5)?64:style==6?16:24)<<" single-thread median_ms="<<times[2]<<" worst_ms="<<times.back()<<"\n";
            }
        }
    }
}
