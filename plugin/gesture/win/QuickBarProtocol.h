// Platform-free rules of the quick bar on Windows, kept apart from Win32 so
// they run in ctest. Mirrors the validation and placement of QuickBar.mm.
#pragma once
#include "NativeJson.h"
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

namespace quickbar {

constexpr size_t kMaxItems = 12;
constexpr size_t kMaxRequest = 8192;

struct Curve { double x1 = 0, y1 = 0, x2 = 1, y2 = 1; };
struct Item { std::string id, label; Curve curve; };
struct Labels { std::string editor, close, title; };
struct Show { std::string signature; std::vector<Item> items; Labels labels; };

/** Same acceptance rules as -[QBController show:]; returns false for anything else. */
inline bool parseShow(const mjson::Value& d, Show& out) {
    const mjson::Value* signature = d.get("signature");
    const mjson::Value* items = d.get("items");
    const mjson::Value* labels = d.get("labels");
    if (!mjson::isString(signature, 4096) || !items || items->type != mjson::Value::Array || !labels || labels->type != mjson::Value::Object) return false;
    if (items->items.empty() || items->items.size() > kMaxItems) return false;
    if (!mjson::isString(labels->get("editor"), 80) || !mjson::isString(labels->get("close"), 80) || !mjson::isString(labels->get("title"), 80)) return false;
    Show show;
    show.signature = signature->text;
    show.labels = {labels->get("editor")->text, labels->get("close")->text, labels->get("title")->text};
    for (const mjson::Value& raw : items->items) {
        if (raw.type != mjson::Value::Object) return false;
        const mjson::Value* id = raw.get("id");
        const mjson::Value* label = raw.get("label");
        const mjson::Value* c = raw.get("curve");
        if (!mjson::isString(id, 80) || !mjson::isString(label, 80) || id->text.rfind("__", 0) == 0) return false;
        if (!c || c->type != mjson::Value::Object) return false;
        const mjson::Value *x1 = c->get("x1"), *y1 = c->get("y1"), *x2 = c->get("x2"), *y2 = c->get("y2");
        if (!mjson::isNumber(x1) || !mjson::isNumber(y1) || !mjson::isNumber(x2) || !mjson::isNumber(y2)) return false;
        show.items.push_back({id->text, label->text, {x1->number, y1->number, x2->number, y2->number}});
    }
    out = std::move(show);
    return true;
}

/** Identity of what is drawn: rebuild the buttons only when this changes. */
inline std::string itemsKey(const Show& show) {
    std::string key = show.labels.editor + '\x1f' + show.labels.close + '\x1f' + show.labels.title;
    for (const Item& item : show.items) {
        key += '\x1e' + item.id + '\x1f' + item.label;
        for (double v : {item.curve.x1, item.curve.y1, item.curve.x2, item.curve.y2}) key += '\x1f' + mjson::number(v);
    }
    return key;
}

struct Rect { double left = 0, top = 0, right = 0, bottom = 0; };
struct Point { double x = 0, y = 0; };
struct Placement { Point origin; bool below = false; };

/**
 * Above the pointer and centred on it, kept inside the monitor's work area;
 * below the pointer when there is no room above (screen y grows downwards).
 */
inline Placement place(Point pointer, double width, double height, Rect work, double gap, double margin = 4) {
    Placement p;
    p.origin.x = pointer.x - width / 2;
    p.origin.y = pointer.y - gap - height;
    if (p.origin.y < work.top + margin) { p.origin.y = pointer.y + gap; p.below = true; }
    p.origin.x = std::max(work.left + margin, std::min(p.origin.x, work.right - width - margin));
    p.origin.y = std::min(p.origin.y, work.bottom - height - margin);
    p.origin.y = std::max(work.top + margin, p.origin.y);
    return p;
}

/** CSS-style cubic-bezier(x1, y1, x2, y2) evaluated at progress t (0..1). */
inline double cubicBezier(double x1, double y1, double x2, double y2, double t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    auto sample = [](double a1, double a2, double s) { const double u = 1 - s; return 3 * u * u * s * a1 + 3 * u * s * s * a2 + s * s * s; };
    double lo = 0, hi = 1, s = t;
    for (int i = 0; i < 40; ++i) {
        s = (lo + hi) / 2;
        if (sample(x1, x2, s) < t) lo = s; else hi = s;
    }
    return sample(y1, y2, s);
}

/** Overshooting presets (back) leave the 0..1 box: the glyph squeezes the full vertical range. */
inline void glyphRange(const Curve& c, double& low, double& high) {
    low = std::min(0.0, std::min(c.y1, c.y2));
    high = std::max(1.0, std::max(c.y1, c.y2));
    // A hostile or broken curve must not turn the glyph into a hairline.
    low = std::max(low, -4.0);
    high = std::min(high, 5.0);
}

}  // namespace quickbar
