// File transport is polled exclusively on AE's main thread by the documented idle hook.
#include "AEConfig.h"
#include "AE_GeneralPlug.h"
#include "AEGP_SuiteHandler.h"
#import <Foundation/Foundation.h>
#include <chrono>
#include <cmath>
#include <regex>
#include <string>
#include <sys/stat.h>

using Clock=std::chrono::steady_clock;
struct Bridge {
    SPBasicSuite* basic; AEGP_PluginID id;
    AEGP_StreamRefH stream=nullptr; AEGP_LayerH layer=nullptr;
    A_long compID=0, layerID=0;
    double initial=0, current=0, minimum=0, maximum=0;
    bool integer=false, opened=false;
    long long sequence=0;
    std::string root, token, session, gesture;
    Clock::time_point touched, started;
};
static std::string utf(NSString* s){return s?[s UTF8String]:"";}
static NSString* ns(const std::string& s){return [NSString stringWithUTF8String:s.c_str()];}
static bool string(NSDictionary* d,NSString* key,NSUInteger max=240){return [d[key] isKindOfClass:[NSString class]]&&[d[key] length]>0&&[d[key] length]<=max;}
static bool number(NSDictionary* d,NSString* key){return [d[key] isKindOfClass:[NSNumber class]]&&CFGetTypeID((__bridge CFTypeRef)d[key])!=CFBooleanGetTypeID()&&std::isfinite([d[key] doubleValue]);}
static void save(Bridge* p,NSString* name,NSDictionary* value){
    NSData* bytes=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    NSString* path=[ns(p->root) stringByAppendingPathComponent:name];
    [bytes writeToFile:path options:NSDataWritingAtomic error:nil];chmod([path fileSystemRepresentation],0600);
}
static NSString* memoryString(Bridge* p,AEGP_MemHandle h){
    if(!h)return @"";AEGP_SuiteHandler s(p->basic);void* ptr=nullptr;NSString* text=@"";
    if(!s.MemorySuite1()->AEGP_LockMemHandle(h,&ptr)&&ptr){const A_UTF16Char* chars=(const A_UTF16Char*)ptr;size_t n=0;while(n<4096&&chars[n])n++;text=[NSString stringWithCharacters:(const unichar*)chars length:n];s.MemorySuite1()->AEGP_UnlockMemHandle(h);}
    s.MemorySuite1()->AEGP_FreeMemHandle(h);return text;
}
struct Ref {
    Bridge* p;AEGP_StreamRefH h=nullptr;Ref(Bridge* value):p(value){}
    ~Ref(){if(h){AEGP_SuiteHandler s(p->basic);s.StreamSuite5()->AEGP_DisposeStream(h);}}
};
static A_Err active(Bridge* p,AEGP_LayerH* out,A_long* compID,A_long* layerID){
    AEGP_SuiteHandler s(p->basic);AEGP_CompH comp=nullptr;AEGP_ItemH item=nullptr;AEGP_LayerFlags flags=0;
    A_Err e=s.LayerSuite9()->AEGP_GetActiveLayer(out);if(e||!*out)return A_Err_GENERIC;
    if((e=s.LayerSuite9()->AEGP_GetLayerFlags(*out,&flags))||flags&AEGP_LayerFlag_LOCKED)return A_Err_GENERIC;
    if((e=s.LayerSuite9()->AEGP_GetLayerParentComp(*out,&comp))||(e=s.CompSuite11()->AEGP_GetItemFromComp(comp,&item))||(e=s.ItemSuite9()->AEGP_GetItemID(item,compID)))return e;
    return s.LayerSuite9()->AEGP_GetLayerID(*out,layerID);
}
static A_Err selected(Bridge* p){AEGP_LayerH layer=nullptr;A_long c=0,l=0;A_Err e=active(p,&layer,&c,&l);return e||c!=p->compID||l!=p->layerID?A_Err_GENERIC:0;}
static A_Err set(Bridge* p,double value){
    if(!std::isfinite(value)||value<p->minimum||value>p->maximum||(p->integer&&std::floor(value)!=value))return A_Err_GENERIC;
    if(value==p->current)return 0;
    AEGP_SuiteHandler s(p->basic);AEGP_StreamValue2 v{};v.streamH=p->stream;v.val.one_d=value;
    A_Err e=s.StreamSuite5()->AEGP_SetStreamValue(p->id,p->stream,&v);if(!e)p->current=value;return e;
}
static A_Err finish(Bridge* p,bool cancel){
    AEGP_SuiteHandler s(p->basic);A_Err e=0;
    if(p->opened){if(cancel)e=set(p,p->initial);A_Err close=s.UtilitySuite6()->AEGP_EndUndoGroup();if(!e)e=close;p->opened=false;}
    if(p->stream){s.StreamSuite5()->AEGP_DisposeStream(p->stream);p->stream=nullptr;}p->layer=nullptr;return e;
}
static A_Err begin(Bridge* p,NSDictionary* d){
    if(p->opened||!number(d,@"compId")||!number(d,@"layerId")||!number(d,@"initial")||!string(d,@"instance",96)||!string(d,@"phaseInstance",100)||!string(d,@"phase",3)||!string(d,@"parameter",32)||!string(d,@"control")||!string(d,@"session",96)||!string(d,@"gesture",96))return A_Err_GENERIC;
    std::string root=utf(d[@"instance"]),phase=utf(d[@"phase"]),instance=utf(d[@"phaseInstance"]);
    if(!std::regex_match(root,std::regex("[0-9]+(-[0-9]+){1,4}"))||(phase!="in"&&phase!="out")||instance!=root+(phase=="in"?"-1":"-2"))return A_Err_GENERIC;
    NSString* key=d[@"parameter"];std::string label;
    p->integer=true;p->minimum=0;
    if([key isEqual:@"durationFrames"]){p->minimum=1;p->maximum=600;label="(Duração \\(frames\\)|Duration \\(frames\\))";}
    else if([key isEqual:@"intensity"]){p->maximum=300;p->integer=false;label="(Intensidade \\(\\%\\)|Intensity \\(\\%\\))";}
    else if([key isEqual:@"staggerFrames"]){p->maximum=60;label="(Intervalo do texto \\(frames\\)|Text stagger \\(frames\\))";}
    else if([key isEqual:@"elasticity"]){p->maximum=100;label="(Elasticidade \\(\\%\\)|Elasticity \\(\\%\\))";}
    else if([key isEqual:@"overlap"]){p->maximum=100;label="(Sobreposição \\(\\%\\)|Overlap \\(\\%\\))";}
    else if([key isEqual:@"seed"]){p->maximum=9999;label="(Variação|Variation)";}
    else return A_Err_GENERIC;
    const std::string expected="Moti.on "+instance+" · ";std::string name=utf(d[@"control"]);
    if(name.rfind(expected,0)!=0||!std::regex_match(name.substr(expected.size()),std::regex(label)))return A_Err_GENERIC;
    A_Err e=active(p,&p->layer,&p->compID,&p->layerID);if(e||p->compID!=[d[@"compId"] longValue]||p->layerID!=[d[@"layerId"] longValue])return A_Err_GENERIC;
    AEGP_SuiteHandler s(p->basic);Ref layer(p),effects(p),found(p);
    if((e=s.DynamicStreamSuite4()->AEGP_GetNewStreamRefForLayer(p->id,p->layer,&layer.h))||(e=s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByMatchname(p->id,layer.h,"ADBE Effect Parade",&effects.h)))return e;
    A_long count=0;if((e=s.DynamicStreamSuite4()->AEGP_GetNumStreamsInGroup(effects.h,&count))||count>512)return A_Err_GENERIC;
    for(A_long i=0;i<count;i++){Ref candidate(p);AEGP_MemHandle h=nullptr;char match[AEGP_MAX_STREAM_MATCH_NAME_SIZE]{};
        if((e=s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByIndex(p->id,effects.h,i,&candidate.h))||(e=s.StreamSuite5()->AEGP_GetStreamName(p->id,candidate.h,false,&h)))return e;
        NSString* candidateName=memoryString(p,h);
        if([candidateName isEqualToString:d[@"control"]]){if(found.h)return A_Err_GENERIC;
            if((e=s.DynamicStreamSuite4()->AEGP_GetMatchName(candidate.h,match))||std::string(match)!="ADBE Slider Control")return A_Err_GENERIC;
            found.h=candidate.h;candidate.h=nullptr;
        }
    }
    if(!found.h)return A_Err_GENERIC;
    if((e=s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByMatchname(p->id,found.h,"ADBE Slider Control-0001",&p->stream)))return e;
    A_long keys=0;A_Boolean varying=false;AEGP_StreamType type=AEGP_StreamType_NO_DATA;AEGP_MemHandle expression=nullptr;
    if((e=s.KeyframeSuite4()->AEGP_GetStreamNumKFs(p->stream,&keys))||(e=s.StreamSuite5()->AEGP_IsStreamTimevarying(p->stream,&varying))||(e=s.StreamSuite5()->AEGP_GetStreamType(p->stream,&type))||(e=s.StreamSuite5()->AEGP_GetExpression(p->id,p->stream,&expression)))return e;
    NSString* expr=memoryString(p,expression);if(keys!=0||varying||type!=AEGP_StreamType_OneD||[expr length])return A_Err_GENERIC;
    A_Time time{0,1};AEGP_StreamValue2 v{};if((e=s.StreamSuite5()->AEGP_GetNewStreamValue(p->id,p->stream,AEGP_LTimeMode_CompTime,&time,true,&v)))return e;
    p->initial=p->current=v.val.one_d;s.StreamSuite5()->AEGP_DisposeStreamValue(&v);
    if(std::abs(p->initial-[d[@"initial"] doubleValue])>.000001||p->initial<p->minimum||p->initial>p->maximum)return A_Err_GENERIC;
    p->session=utf(d[@"session"]);p->gesture=utf(d[@"gesture"]);
    e=s.UtilitySuite6()->AEGP_StartUndoGroup("Moti.on — ajustar parâmetro");if(!e){p->opened=true;p->started=p->touched=Clock::now();}return e;
}
static void response(Bridge* p,A_Err error,bool canceled=false){save(p,@"response.json",@{@"version":@1,@"sequence":@(p->sequence),@"session":ns(p->session),@"gesture":ns(p->gesture),@"error":@(error),@"open":@(p->opened),@"canceled":@(canceled),@"value":@(p->current)});}
static A_Err idle(AEGP_GlobalRefcon,AEGP_IdleRefcon ref,A_long* sleep){
    auto* p=reinterpret_cast<Bridge*>(ref);@autoreleasepool{
        *sleep=p->opened?1:6;NSString* path=[ns(p->root) stringByAppendingPathComponent:@"request.json"];
        struct stat info{};NSData* bytes=nil;
        if(!lstat([path fileSystemRepresentation],&info)&&S_ISREG(info.st_mode)&&info.st_uid==getuid()&&info.st_size>0&&info.st_size<=4096)bytes=[NSData dataWithContentsOfFile:path];
        if(bytes&&[bytes length]<=4096){NSDictionary* d=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
            if([d isKindOfClass:[NSDictionary class]]&&[d[@"token"] isKindOfClass:[NSString class]]&&[d[@"token"] isEqual:ns(p->token)]&&number(d,@"version")&&[d[@"version"] intValue]==1&&number(d,@"sequence")){
                double raw=[d[@"sequence"] doubleValue];long long seq=[d[@"sequence"] longLongValue];
                if(raw==seq&&seq>p->sequence&&seq<9007199254740991LL){p->sequence=seq;A_Err e=A_Err_GENERIC;bool canceled=false;NSString* op=d[@"operation"];
                    if([op isEqual:@"begin"]){
                        if(!p->opened&&string(d,@"session",96)&&string(d,@"gesture",96)){p->session=utf(d[@"session"]);p->gesture=utf(d[@"gesture"]);}
                        e=begin(p,d);
                    }
                    else if(p->opened&&[d[@"session"] isEqual:ns(p->session)]&&[d[@"gesture"] isEqual:ns(p->gesture)]){
                        if([op isEqual:@"cancel"]){e=finish(p,true);canceled=true;}
                        else if((e=selected(p))==0){
                            if([op isEqual:@"update"]&&number(d,@"value"))e=set(p,[d[@"value"] doubleValue]);
                            else if([op isEqual:@"commit"]&&number(d,@"value")){e=set(p,[d[@"value"] doubleValue]);if(!e)e=finish(p,false);}
                            else e=A_Err_GENERIC;
                        }
                    }
                    if(e){finish(p,true);canceled=true;}p->touched=Clock::now();response(p,e,canceled);
                }
            }
        }
        if(p->opened&&(Clock::now()-p->touched>std::chrono::seconds(4)||Clock::now()-p->started>std::chrono::seconds(120)||selected(p))){A_Err e=finish(p,true);response(p,e?e:A_Err_GENERIC,true);}
    }return 0;
}
static A_Err death(AEGP_GlobalRefcon,AEGP_DeathRefcon ref){auto* p=reinterpret_cast<Bridge*>(ref);finish(p,true);@autoreleasepool{[[NSFileManager defaultManager] removeItemAtPath:[ns(p->root) stringByAppendingPathComponent:@"handshake.json"] error:nil];}delete p;return 0;}
extern "C" __attribute__((visibility("default"))) A_Err GestureBridgeMain(SPBasicSuite* basic,A_long,A_long,AEGP_PluginID id,AEGP_GlobalRefcon* out){
    auto* p=new Bridge{};p->basic=basic;p->id=id;@autoreleasepool{
        p->root=utf([NSHomeDirectory() stringByAppendingPathComponent:@"Library/Caches/Moti.on/Gestures"]);
        [[NSFileManager defaultManager] createDirectoryAtPath:ns(p->root) withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nil];chmod(p->root.c_str(),0700);
        p->token=utf([[NSUUID UUID] UUIDString]);
        save(p,@"handshake.json",@{@"version":@1,@"token":ns(p->token),@"capabilities":@[@"phase-number"],@"hostProof":@YES,@"pid":@(getpid())});
    }
    AEGP_SuiteHandler s(basic);A_Err e=s.RegisterSuite5()->AEGP_RegisterIdleHook(id,idle,reinterpret_cast<AEGP_IdleRefcon>(p));if(!e)e=s.RegisterSuite5()->AEGP_RegisterDeathHook(id,death,reinterpret_cast<AEGP_DeathRefcon>(p));*out=reinterpret_cast<AEGP_GlobalRefcon>(p);return e;
}
