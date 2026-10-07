// Capability probe only: never shipped as a production command bridge.
#include "AEConfig.h"
#include "AE_GeneralPlug.h"
#include "AEGP_SuiteHandler.h"
#import <Foundation/Foundation.h>
#include <chrono>
#include <string>
#include <sys/stat.h>

struct Probe {
    SPBasicSuite* basic;
    AEGP_PluginID id;
    AEGP_StreamRefH stream = nullptr;
    AEGP_LayerH layer = nullptr;
    A_long layerID = 0;
    double initial = 100;
    bool opened = false;
    long sequence = 0;
    std::string root, token;
    std::chrono::steady_clock::time_point touched;
};
static std::string utf(NSString* s) { return s ? [s UTF8String] : ""; }
static NSString* ns(const std::string& s) { return [NSString stringWithUTF8String:s.c_str()]; }
static void save(Probe* p, NSString* name, NSDictionary* data) {
    NSData* bytes = [NSJSONSerialization dataWithJSONObject:data options:0 error:nil];
    NSString* path = [ns(p->root) stringByAppendingPathComponent:name];
    [bytes writeToFile:path options:NSDataWritingAtomic error:nil];
    chmod([path fileSystemRepresentation], 0600);
}
static A_Err set(Probe* p, double number) {
    AEGP_SuiteHandler s(p->basic);
    AEGP_StreamValue2 value{};
    value.streamH = p->stream;
    value.val.one_d = number;
    return s.StreamSuite5()->AEGP_SetStreamValue(p->id, p->stream, &value);
}
static A_Err finish(Probe* p, bool cancel) {
    AEGP_SuiteHandler s(p->basic); A_Err err = 0;
    if (p->opened) {
        if (cancel) err = set(p,p->initial);
        const auto end = s.UtilitySuite6()->AEGP_EndUndoGroup();
        if (!err) err = end;
        p->opened=false;
    }
    if (p->stream) { s.StreamSuite5()->AEGP_DisposeStream(p->stream); p->stream=nullptr; }
    p->layer=nullptr;
    return err;
}
static A_Err begin(Probe* p) {
    AEGP_SuiteHandler s(p->basic); A_Err err = 0;
    if(p->opened) return A_Err_GENERIC;
    err=s.LayerSuite9()->AEGP_GetActiveLayer(&p->layer);
    if(err || !p->layer) return A_Err_GENERIC;
    s.LayerSuite9()->AEGP_GetLayerID(p->layer,&p->layerID);
    err=s.StreamSuite5()->AEGP_GetNewLayerStream(p->id,p->layer,AEGP_LayerStream_OPACITY,&p->stream);
    if(err) return err;
    A_long keys=0; A_Boolean varying=false;
    err=s.KeyframeSuite4()->AEGP_GetStreamNumKFs(p->stream,&keys);
    if(!err) err=s.StreamSuite5()->AEGP_IsStreamTimevarying(p->stream,&varying);
    if(err || keys!=0 || varying) {finish(p,false);return A_Err_GENERIC;}
    A_Time time{0,1}; AEGP_StreamValue2 value{};
    err=s.StreamSuite5()->AEGP_GetNewStreamValue(p->id,p->stream,AEGP_LTimeMode_CompTime,&time,true,&value);
    if(!err) {p->initial=value.val.one_d;s.StreamSuite5()->AEGP_DisposeStreamValue(&value);}
    if(!err) err=s.UtilitySuite6()->AEGP_StartUndoGroup("Moti.on — gesto de teste");
    if(!err) {p->opened=true;p->touched=std::chrono::steady_clock::now();}
    else finish(p,false);
    return err;
}
static A_Err idle(AEGP_GlobalRefcon, AEGP_IdleRefcon ref, A_long* sleep) {
    auto* p=reinterpret_cast<Probe*>(ref);
    @autoreleasepool {
        *sleep=p->opened?1:6;
        NSString* request=[ns(p->root) stringByAppendingPathComponent:@"request.json"];
        NSData* bytes=[NSData dataWithContentsOfFile:request];
        if(bytes && [bytes length]<=4096) {
            NSDictionary* input=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
            if([input isKindOfClass:[NSDictionary class]] && [input[@"token"] isEqualToString:ns(p->token)]) {
                long seq=[input[@"sequence"] longValue];
                if(seq>p->sequence) {
                    p->sequence=seq; A_Err err=0;NSString* op=input[@"operation"];
                    if([op isEqualToString:@"begin"]) err=begin(p);
                    else if([op isEqualToString:@"update"] && p->opened) {
                        double value=[input[@"value"] doubleValue];
                        if(value>=0 && value<=100) err=set(p,value);else err=A_Err_GENERIC;
                        p->touched=std::chrono::steady_clock::now();
                    } else if([op isEqualToString:@"commit"]) err=finish(p,false);
                    else if([op isEqualToString:@"cancel"]) err=finish(p,true);
                    else err=A_Err_GENERIC;
                    if(err) finish(p,true);
                    save(p,@"response.json",@{@"sequence":@(seq),@"error":@(err),@"open":@(p->opened),@"initial":@(p->initial),@"layerID":@(p->layerID)});
                }
            }
        }
        if(p->opened && std::chrono::steady_clock::now()-p->touched>std::chrono::seconds(8)) {
            auto err=finish(p,true);
            save(p,@"response.json",@{@"sequence":@(p->sequence),@"error":@(err),@"timeout":@YES,@"open":@NO});
        }
    }
    return 0;
}
static A_Err death(AEGP_GlobalRefcon, AEGP_DeathRefcon ref) {
    auto* p=reinterpret_cast<Probe*>(ref);finish(p,true);delete p;return 0;
}
extern "C" __attribute__((visibility("default"))) A_Err GestureProbeMain(SPBasicSuite* basic,A_long,A_long,AEGP_PluginID id,AEGP_GlobalRefcon* out) {
    auto* p=new Probe{};p->basic=basic;p->id=id;
    @autoreleasepool {
        p->root=utf([NSHomeDirectory() stringByAppendingPathComponent:@"Library/Caches/Moti.on/GestureProbe"]);
        [[NSFileManager defaultManager] createDirectoryAtPath:ns(p->root) withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nil];
        p->token=utf([[NSUUID UUID] UUIDString]);
        save(p,@"handshake.json",@{@"version":@1,@"token":ns(p->token),@"probeOnly":@YES});
    }
    AEGP_SuiteHandler s(basic);
    A_Err err=s.RegisterSuite5()->AEGP_RegisterIdleHook(id,idle,reinterpret_cast<AEGP_IdleRefcon>(p));
    if(!err) err=s.RegisterSuite5()->AEGP_RegisterDeathHook(id,death,reinterpret_cast<AEGP_DeathRefcon>(p));
    *out=reinterpret_cast<AEGP_GlobalRefcon>(p);return err;
}
