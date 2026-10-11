// Windows quick bar / Live Gestures protocol: JSON parsing, request validation
// and placement. Platform-free code, built on Windows only: floating-point
// std::to_chars needs macOS 13.3+, above this project's 12.0 deployment target.
#include "../gesture/win/NativeJson.h"
#include "../gesture/win/QuickBarProtocol.h"
#include <cassert>
#include <clocale>
#include <cmath>
#include <cstdio>
#include <string>

static mjson::Value parsed(const std::string& text) {
    mjson::Value v;
    const bool ok = mjson::parse(text, v);
    assert(ok);
    return v;
}
static bool rejects(const std::string& text) { mjson::Value v; return !mjson::parse(text, v); }

static const char* kShow =
    R"({"version":1,"token":"T","sequence":5,"operation":"show","signature":"sig-1",)"
    R"("items":[{"id":"ease","label":"Ease","curve":{"x1":0.25,"y1":0.1,"x2":0.25,"y2":1}},)"
    R"({"id":"back","label":"Recuo · Back","curve":{"x1":0.34,"y1":1.56,"x2":0.64,"y2":1}}],)"
    R"("labels":{"editor":"Editor completo","close":"Fechar","title":"Suavização rápida"}})";

static void testJsonBasics() {
    const mjson::Value v = parsed(R"({"a":1,"b":-2.5e2,"c":"x\"y\u00e7\ud83d\ude00","d":[true,false,null],"e":{}})");
    assert(v.type == mjson::Value::Object);
    assert(mjson::isNumber(v.get("a")) && v.get("a")->number == 1);
    assert(v.get("b")->number == -250);
    assert(v.get("c")->text == "x\"y\xC3\xA7\xF0\x9F\x98\x80");
    assert(mjson::utf16Length(v.get("c")->text) == 6);  // the emoji takes two UTF-16 units
    assert(v.get("d")->items.size() == 3 && v.get("d")->items[0].type == mjson::Value::Bool);
    assert(!mjson::isNumber(&v.get("d")->items[0]));  // booleans are never numbers
}

static void testJsonRejects() {
    assert(rejects(""));
    assert(rejects("{"));
    assert(rejects(R"({"a":1} trailing)"));
    assert(rejects(R"({"a":01})"));
    assert(rejects(R"({"a":1.})"));
    assert(rejects(R"({"a":NaN})"));
    assert(rejects(R"({"a":1e999})"));          // not finite
    const std::string loneSurrogate = R"({"a":"\ud800"})";  // outside assert(): MSVC expands UCNs in macro arguments
    assert(rejects(loneSurrogate));
    const std::string escapedNul = R"({"a":"x\u0000y"})";
    assert(rejects(escapedNul));                         // would truncate C strings (tooltips)
    assert(rejects("{\"a\":\"\xC3\"}"));                  // truncated UTF-8 sequence
    assert(rejects("{\"a\":\"\xC0\xAF\"}"));              // overlong encoding
    assert(rejects("{\"a\":\"\xED\xA0\x80\"}"));          // UTF-8-encoded surrogate
    assert(rejects("{\"a\":\"\xFF\"}"));                  // never valid in UTF-8
    assert(!rejects("{\"a\":\"Suaviza\xC3\xA7\xC3\xA3o \xF0\x9F\x98\x80\"}"));
    assert(rejects("{\"a\":\"line\nbreak\"}"));  // raw control character
    assert(rejects(R"({"a":1,"a":2})"));         // duplicate key
    std::string deep;
    for (int i = 0; i < 20; ++i) deep += "[";
    for (int i = 0; i < 20; ++i) deep += "]";
    assert(rejects(deep));
    assert(rejects(std::string(9000, ' ') + "{}"));  // over the 8 KB request limit
}

static void testNumbersIgnoreLocale() {
    // AE can run with a comma decimal separator; the protocol must not change.
    std::setlocale(LC_ALL, "pt-BR");
    assert(parsed(R"({"v":147.3})").get("v")->number == 147.3);
    assert(mjson::number(147.3) == "147.3");
    assert(mjson::number(1791736567123.0) == "1791736567123");
    assert(mjson::number(-0.5) == "-0.5");
    std::setlocale(LC_ALL, "C");
}

static void testWriter() {
    const std::string out = mjson::Writer().field("version", 1).field("token", "A\"B").flag("visible", true).field("value", 2.5).str();
    const std::string expected = R"({"version":1,"token":"A\"B","visible":true,"value":2.5})";
    assert(out == expected);
    assert(mjson::quote("\x01") == "\"\\u0001\"");
}

static void testShowAccepted() {
    quickbar::Show show;
    assert(quickbar::parseShow(parsed(kShow), show));
    assert(show.signature == "sig-1" && show.items.size() == 2);
    assert(show.items[1].label == "Recuo \xC2\xB7 Back" && show.items[1].curve.y1 == 1.56);
    assert(show.labels.title == "Suaviza\xC3\xA7\xC3\xA3o r\xC3\xA1pida");
    quickbar::Show again;
    assert(quickbar::parseShow(parsed(kShow), again) && quickbar::itemsKey(show) == quickbar::itemsKey(again));
}

static void testShowRejected() {
    auto reject = [](std::string text, const std::string& from, const std::string& to) {
        const size_t at = text.find(from);
        assert(at != std::string::npos);
        text.replace(at, from.size(), to);
        quickbar::Show show;
        return !quickbar::parseShow(parsed(text), show);
    };
    assert(reject(kShow, R"("id":"ease")", R"("id":"__editor")"));  // reserved ids
    assert(reject(kShow, R"("x1":0.25,)", R"("x1":true,)"));        // boolean as number
    assert(reject(kShow, R"("signature":"sig-1")", R"("signature":"")"));
    assert(reject(kShow, R"("close":"Fechar")", R"("close":"")"));
    assert(reject(kShow, R"("label":"Ease")", "\"label\":\"" + std::string(81, 'x') + "\""));
    std::string many = R"({"signature":"s","labels":{"editor":"e","close":"c","title":"t"},"items":[)";
    for (int i = 0; i < 13; ++i) many += std::string(i ? "," : "") + R"({"id":"p)" + std::to_string(i) + R"(","label":"l","curve":{"x1":0,"y1":0,"x2":1,"y2":1}})";
    many += "]}";
    quickbar::Show show;
    assert(!quickbar::parseShow(parsed(many), show));  // more than 12 items
}

static void testPlacement() {
    const quickbar::Rect work{0, 0, 1920, 1040};
    // Room above: centred above the pointer.
    auto p = quickbar::place({960, 500}, 300, 40, work, 18);
    assert(!p.below && p.origin.x == 810 && p.origin.y == 442);
    // No room above: below the pointer.
    p = quickbar::place({960, 30}, 300, 40, work, 18);
    assert(p.below && p.origin.y == 48);
    // Kept inside the work area horizontally.
    p = quickbar::place({10, 500}, 300, 40, work, 18);
    assert(p.origin.x == 4);
    p = quickbar::place({1915, 500}, 300, 40, work, 18);
    assert(p.origin.x == 1920 - 300 - 4);
    // Second monitor with negative coordinates.
    p = quickbar::place({-500, 300}, 300, 40, {-1920, 0, 0, 1080}, 18);
    assert(p.origin.x == -650 && p.origin.y == 242);
}

static void testEasing() {
    assert(quickbar::cubicBezier(0.2, 0.9, 0.3, 1.15, 0) == 0);
    assert(quickbar::cubicBezier(0.2, 0.9, 0.3, 1.15, 1) == 1);
    const double mid = quickbar::cubicBezier(0.42, 0, 0.58, 1, 0.5);
    assert(std::fabs(mid - 0.5) < 1e-6);
    double peak = 0;
    for (int i = 1; i < 100; ++i) peak = std::fmax(peak, quickbar::cubicBezier(0.2, 0.9, 0.3, 1.15, i / 100.0));
    assert(peak > 1.0);  // the pop overshoots slightly, like the macOS bar
    double low = 0, high = 0;
    quickbar::glyphRange({0.34, 1.56, 0.64, 1}, low, high);
    assert(low == 0 && high == 1.56);
    quickbar::glyphRange({0, -1e9, 1, 1e9}, low, high);
    assert(low == -4 && high == 5);
}

int main() {
    testJsonBasics();
    testJsonRejects();
    testNumbersIgnoreLocale();
    testWriter();
    testShowAccepted();
    testShowRejected();
    testPlacement();
    testEasing();
    std::puts("quickbar protocol tests passed");
    return 0;
}
