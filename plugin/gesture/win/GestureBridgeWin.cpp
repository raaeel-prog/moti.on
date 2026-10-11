// Moti.on Live Gestures AEGP on Windows: the counterpart of GestureBridge.mm.
//
// Hosts the quick bar (QuickBarWin.cpp) and the native phase-number drag: the
// panel scrubs a Moti.on Slider Control and this side writes the value live
// inside one Undo group, restoring the initial value on cancel, timeout or a
// selection change. Same protocol, limits and checks as macOS; the file
// transport is polled exclusively on AE's main thread by the documented idle hook.
#include "AEConfig.h"
#include "AE_GeneralPlug.h"
#include "AEGP_SuiteHandler.h"
#include "../QuickBar.h"
#include "NativeFilesWin.h"
#include "NativeJson.h"

#include <chrono>
#include <cmath>
#include <regex>
#include <string>

namespace {

using Clock = std::chrono::steady_clock;

struct Bridge {
    SPBasicSuite* basic = nullptr;
    AEGP_PluginID id = 0;
    AEGP_StreamRefH stream = nullptr;
    AEGP_LayerH layer = nullptr;
    A_long compID = 0, layerID = 0;
    double initial = 0, current = 0, minimum = 0, maximum = 0;
    bool integer = false, opened = false;
    long long sequence = 0;
    std::wstring root;
    std::string token, session, gesture;
    Clock::time_point touched, started;
};

bool isText(const mjson::Value* v, size_t max = 240) { return mjson::isString(v, max); }

/** An AE item/layer id: an exact integer in A_long's range (macOS compares the NSNumber exactly). */
bool isId(const mjson::Value* v) {
    return mjson::isNumber(v) && v->number == std::floor(v->number) && v->number >= -2147483648.0 && v->number <= 2147483647.0;
}

void save(Bridge* p, const wchar_t* name, const std::string& json) { nativefiles::writeAtomic(p->root, name, json); }

/** AE UTF-16 memory handle → UTF-8; the handle is always freed. */
std::string memoryString(Bridge* p, AEGP_MemHandle h) {
    if (!h) return "";
    AEGP_SuiteHandler s(p->basic);
    void* ptr = nullptr;
    std::string text;
    if (!s.MemorySuite1()->AEGP_LockMemHandle(h, &ptr) && ptr) {
        const auto* chars = static_cast<const A_UTF16Char*>(ptr);
        size_t n = 0;
        while (n < 4096 && chars[n]) n++;
        text = nativefiles::narrow(reinterpret_cast<const wchar_t*>(chars), n);
        s.MemorySuite1()->AEGP_UnlockMemHandle(h);
    }
    s.MemorySuite1()->AEGP_FreeMemHandle(h);
    return text;
}

struct Ref {
    Bridge* p;
    AEGP_StreamRefH h = nullptr;
    explicit Ref(Bridge* value) : p(value) {}
    ~Ref() { if (h) { AEGP_SuiteHandler s(p->basic); s.StreamSuite5()->AEGP_DisposeStream(h); } }
    Ref(const Ref&) = delete;
    Ref& operator=(const Ref&) = delete;
};

A_Err active(Bridge* p, AEGP_LayerH* out, A_long* compID, A_long* layerID) {
    AEGP_SuiteHandler s(p->basic);
    AEGP_CompH comp = nullptr;
    AEGP_ItemH item = nullptr;
    AEGP_LayerFlags flags = 0;
    A_Err e = s.LayerSuite9()->AEGP_GetActiveLayer(out);
    if (e || !*out) return A_Err_GENERIC;
    if ((e = s.LayerSuite9()->AEGP_GetLayerFlags(*out, &flags)) || (flags & AEGP_LayerFlag_LOCKED)) return A_Err_GENERIC;
    if ((e = s.LayerSuite9()->AEGP_GetLayerParentComp(*out, &comp)) || (e = s.CompSuite11()->AEGP_GetItemFromComp(comp, &item))
        || (e = s.ItemSuite9()->AEGP_GetItemID(item, compID))) return e;
    return s.LayerSuite9()->AEGP_GetLayerID(*out, layerID);
}

A_Err selected(Bridge* p) {
    AEGP_LayerH layer = nullptr;
    A_long c = 0, l = 0;
    const A_Err e = active(p, &layer, &c, &l);
    return e || c != p->compID || l != p->layerID ? A_Err_GENERIC : 0;
}

A_Err set(Bridge* p, double value) {
    if (!std::isfinite(value) || value < p->minimum || value > p->maximum || (p->integer && std::floor(value) != value)) return A_Err_GENERIC;
    if (value == p->current) return 0;
    AEGP_SuiteHandler s(p->basic);
    AEGP_StreamValue2 v{};
    v.streamH = p->stream;
    v.val.one_d = value;
    const A_Err e = s.StreamSuite5()->AEGP_SetStreamValue(p->id, p->stream, &v);
    if (!e) p->current = value;
    return e;
}

A_Err finish(Bridge* p, bool cancel) {
    AEGP_SuiteHandler s(p->basic);
    A_Err e = 0;
    if (p->opened) {
        if (cancel) e = set(p, p->initial);
        const A_Err close = s.UtilitySuite6()->AEGP_EndUndoGroup();
        if (!e) e = close;
        p->opened = false;
    }
    if (p->stream) { s.StreamSuite5()->AEGP_DisposeStream(p->stream); p->stream = nullptr; }
    p->layer = nullptr;
    return e;
}

/** Parameter key → limits and the localized control label (PT/EN), same table as macOS. */
bool parameter(Bridge* p, const std::string& key, std::string& label) {
    p->integer = true;
    p->minimum = 0;
    if (key == "durationFrames") { p->minimum = 1; p->maximum = 600; label = "(Duração \\(frames\\)|Duration \\(frames\\))"; }
    else if (key == "intensity") { p->maximum = 300; p->integer = false; label = "(Intensidade \\(%\\)|Intensity \\(%\\))"; }
    else if (key == "staggerFrames") { p->maximum = 60; label = "(Intervalo do texto \\(frames\\)|Text stagger \\(frames\\))"; }
    else if (key == "elasticity") { p->maximum = 100; label = "(Elasticidade \\(%\\)|Elasticity \\(%\\))"; }
    else if (key == "overlap") { p->maximum = 100; label = "(Sobreposição \\(%\\)|Overlap \\(%\\))"; }
    else if (key == "seed") { p->maximum = 9999; label = "(Variação|Variation)"; }
    else return false;
    return true;
}

A_Err begin(Bridge* p, const mjson::Value& d) {
    const mjson::Value *compId = d.get("compId"), *layerId = d.get("layerId"), *initial = d.get("initial");
    if (p->opened || !isId(compId) || !isId(layerId) || !mjson::isNumber(initial)
        || !isText(d.get("instance"), 96) || !isText(d.get("phaseInstance"), 100) || !isText(d.get("phase"), 3)
        || !isText(d.get("parameter"), 32) || !isText(d.get("control")) || !isText(d.get("session"), 96) || !isText(d.get("gesture"), 96)) return A_Err_GENERIC;
    const std::string root = d.get("instance")->text, phase = d.get("phase")->text, instance = d.get("phaseInstance")->text;
    if (!std::regex_match(root, std::regex("[0-9]+(-[0-9]+){1,4}")) || (phase != "in" && phase != "out")
        || instance != root + (phase == "in" ? "-1" : "-2")) return A_Err_GENERIC;
    std::string label;
    if (!parameter(p, d.get("parameter")->text, label)) return A_Err_GENERIC;
    const std::string expected = "Moti.on " + instance + " · ";
    const std::string name = d.get("control")->text;
    if (name.rfind(expected, 0) != 0 || !std::regex_match(name.substr(expected.size()), std::regex(label))) return A_Err_GENERIC;
    A_Err e = active(p, &p->layer, &p->compID, &p->layerID);
    if (e || p->compID != static_cast<A_long>(compId->number) || p->layerID != static_cast<A_long>(layerId->number)) return A_Err_GENERIC;

    AEGP_SuiteHandler s(p->basic);
    Ref layer(p), effects(p), found(p);
    if ((e = s.DynamicStreamSuite4()->AEGP_GetNewStreamRefForLayer(p->id, p->layer, &layer.h))
        || (e = s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByMatchname(p->id, layer.h, "ADBE Effect Parade", &effects.h))) return e;
    A_long count = 0;
    if ((e = s.DynamicStreamSuite4()->AEGP_GetNumStreamsInGroup(effects.h, &count)) || count > 512) return A_Err_GENERIC;
    for (A_long i = 0; i < count; i++) {
        Ref candidate(p);
        AEGP_MemHandle h = nullptr;
        char match[AEGP_MAX_STREAM_MATCH_NAME_SIZE]{};
        if ((e = s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByIndex(p->id, effects.h, i, &candidate.h))
            || (e = s.StreamSuite5()->AEGP_GetStreamName(p->id, candidate.h, false, &h))) return e;
        if (memoryString(p, h) == name) {
            if (found.h) return A_Err_GENERIC;  // ambiguous: two controls with the same name
            if ((e = s.DynamicStreamSuite4()->AEGP_GetMatchName(candidate.h, match)) || std::string(match) != "ADBE Slider Control") return A_Err_GENERIC;
            found.h = candidate.h;
            candidate.h = nullptr;
        }
    }
    if (!found.h) return A_Err_GENERIC;
    if ((e = s.DynamicStreamSuite4()->AEGP_GetNewStreamRefByMatchname(p->id, found.h, "ADBE Slider Control-0001", &p->stream))) return e;
    A_long keys = 0;
    A_Boolean varying = false;
    AEGP_StreamType type = AEGP_StreamType_NO_DATA;
    AEGP_MemHandle expression = nullptr;
    if ((e = s.KeyframeSuite4()->AEGP_GetStreamNumKFs(p->stream, &keys)) || (e = s.StreamSuite5()->AEGP_IsStreamTimevarying(p->stream, &varying))
        || (e = s.StreamSuite5()->AEGP_GetStreamType(p->stream, &type)) || (e = s.StreamSuite5()->AEGP_GetExpression(p->id, p->stream, &expression))) return e;
    const std::string expr = memoryString(p, expression);
    if (keys != 0 || varying || type != AEGP_StreamType_OneD || !expr.empty()) return A_Err_GENERIC;
    A_Time time{0, 1};
    AEGP_StreamValue2 v{};
    if ((e = s.StreamSuite5()->AEGP_GetNewStreamValue(p->id, p->stream, AEGP_LTimeMode_CompTime, &time, true, &v))) return e;
    p->initial = p->current = v.val.one_d;
    s.StreamSuite5()->AEGP_DisposeStreamValue(&v);
    if (std::abs(p->initial - initial->number) > .000001 || p->initial < p->minimum || p->initial > p->maximum) return A_Err_GENERIC;
    p->session = d.get("session")->text;
    p->gesture = d.get("gesture")->text;
    e = s.UtilitySuite6()->AEGP_StartUndoGroup("Moti.on — ajustar parâmetro");
    if (!e) { p->opened = true; p->started = p->touched = Clock::now(); }
    return e;
}

void response(Bridge* p, A_Err error, bool canceled = false) {
    save(p, L"response.json", mjson::Writer().field("version", 1).field("sequence", p->sequence).field("session", p->session)
        .field("gesture", p->gesture).field("error", static_cast<int>(error)).flag("open", p->opened).flag("canceled", canceled)
        .field("value", p->current).str());
}

void handle(Bridge* p, const mjson::Value& d) {
    const mjson::Value *token = d.get("token"), *version = d.get("version"), *sequenceValue = d.get("sequence");
    if (!token || token->type != mjson::Value::String || token->text != p->token) return;
    if (!mjson::isNumber(version) || version->number != 1 || !mjson::isNumber(sequenceValue)) return;
    const double raw = sequenceValue->number;
    if (raw != std::floor(raw) || raw <= static_cast<double>(p->sequence) || raw >= 9007199254740991.0) return;
    p->sequence = static_cast<long long>(raw);
    A_Err e = A_Err_GENERIC;
    bool canceled = false;
    const mjson::Value* operation = d.get("operation");
    const std::string op = operation && operation->type == mjson::Value::String ? operation->text : "";
    const mjson::Value *session = d.get("session"), *gesture = d.get("gesture");
    if (op == "begin") {
        if (!p->opened && isText(session, 96) && isText(gesture, 96)) { p->session = session->text; p->gesture = gesture->text; }
        e = begin(p, d);
    } else if (p->opened && session && session->type == mjson::Value::String && session->text == p->session
               && gesture && gesture->type == mjson::Value::String && gesture->text == p->gesture) {
        const mjson::Value* value = d.get("value");
        if (op == "cancel") { e = finish(p, true); canceled = true; }
        else if ((e = selected(p)) == 0) {
            if (op == "update" && mjson::isNumber(value)) e = set(p, value->number);
            else if (op == "commit" && mjson::isNumber(value)) { e = set(p, value->number); if (!e) e = finish(p, false); }
            else e = A_Err_GENERIC;
        }
    }
    if (e) { finish(p, true); canceled = true; }
    p->touched = Clock::now();
    response(p, e, canceled);
}

A_Err idleBody(Bridge* p, A_long* sleep);

/**
 * C++ exceptions (a missing suite in AEGP_SuiteHandler, std::regex limits,
 * bad_alloc) must never unwind through After Effects' C frames: they would
 * crash AE. A failed tick restores an open drag and waits for the next one.
 */
A_Err idle(AEGP_GlobalRefcon, AEGP_IdleRefcon ref, A_long* sleep) {
    auto* p = reinterpret_cast<Bridge*>(ref);
    try { return idleBody(p, sleep); }
    catch (...) {
        try { finish(p, true); } catch (...) { /* nothing more can be undone here */ }
        return 0;
    }
}

A_Err idleBody(Bridge* p, A_long* sleep) {
    // AE's main window can be created after this plug-in loads: resolve the owner every tick (cheap).
    AEGP_SuiteHandler s(p->basic);
    HWND mainWindow = nullptr;
    if (!s.UtilitySuite6()->AEGP_GetMainHWND(&mainWindow)) QuickBarSetOwner(mainWindow);
    QuickBarIdle();
    *sleep = p->opened ? 1 : 6;
    std::string bytes;
    mjson::Value d;
    if (!p->root.empty() && nativefiles::readSmall(nativefiles::join(p->root, L"request.json"), 4096, bytes) && mjson::parse(bytes, d, 4096)
        && d.type == mjson::Value::Object) handle(p, d);
    if (p->opened && (Clock::now() - p->touched > std::chrono::seconds(4) || Clock::now() - p->started > std::chrono::seconds(120) || selected(p))) {
        const A_Err e = finish(p, true);
        response(p, e ? e : A_Err_GENERIC, true);
    }
    return 0;
}

A_Err death(AEGP_GlobalRefcon, AEGP_DeathRefcon ref) {
    auto* p = reinterpret_cast<Bridge*>(ref);
    try { QuickBarStop(); } catch (...) { /* shutting down */ }
    try { finish(p, true); } catch (...) { /* shutting down */ }
    if (!p->root.empty()) nativefiles::remove(p->root, L"handshake.json");
    delete p;
    return 0;
}

}  // namespace

extern "C" __declspec(dllexport) A_Err GestureBridgeMain(SPBasicSuite* basic, A_long, A_long, AEGP_PluginID id, AEGP_GlobalRefcon* out) {
    auto* p = new Bridge{};
    p->basic = basic;
    p->id = id;
    p->root = nativefiles::root(L"Gestures");
    p->token = nativefiles::token();
    if (!p->root.empty() && !p->token.empty()) {
        save(p, L"handshake.json", mjson::Writer().field("version", 1).field("token", p->token).raw("capabilities", "[\"phase-number\"]")
            .flag("hostProof", true).field("pid", static_cast<long long>(GetCurrentProcessId())).str());
    }
    A_Err e = A_Err_GENERIC;
    bool idleRegistered = false;
    try {
        QuickBarStart();
        AEGP_SuiteHandler s(basic);
        e = s.RegisterSuite5()->AEGP_RegisterIdleHook(id, idle, reinterpret_cast<AEGP_IdleRefcon>(p));
        idleRegistered = !e;
        if (!e) e = s.RegisterSuite5()->AEGP_RegisterDeathHook(id, death, reinterpret_cast<AEGP_DeathRefcon>(p));
    } catch (...) {
        e = A_Err_GENERIC;
    }
    if (e) {
        // Without the hooks nobody would answer: take the handshakes back so the panel sees no host.
        try { QuickBarStop(); } catch (...) { /* best effort */ }
        if (!p->root.empty()) nativefiles::remove(p->root, L"handshake.json");
        p->root.clear();  // the idle hook (if registered) then never reads the transport again
        // A registered idle hook still holds `p`: keep it alive (one small leak) rather than dangling.
        if (!idleRegistered) delete p;
        *out = nullptr;
        return e;
    }
    *out = reinterpret_cast<AEGP_GlobalRefcon>(p);
    return e;
}
