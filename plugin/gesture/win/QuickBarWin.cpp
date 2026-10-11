// Moti.on quick bar on Windows: the Win32 counterpart of QuickBar.mm.
//
// A borderless, non-activating layered popup owned by AE's main window appears
// next to the pointer when the panel reports a new keyframe selection. Like on
// macOS it only shows, animates and reports clicks; the panel applies presets
// through `ae.keys.ease.apply` (stale-selection check, one Undo). It never
// writes to the project.
//
// Transport is the macOS one: private folder (NativeFilesWin.h), per-launch
// token in handshake.json, request.json polled on AE's main thread by the
// Live Gestures idle hook, atomic event.json for clicks and dismissals.
#include "../QuickBar.h"
#include "NativeFilesWin.h"
#include "QuickBarProtocol.h"

#include <windowsx.h>
#include <commctrl.h>
#include <shellscalingapi.h>
#include <objidl.h>
#include <gdiplus.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <memory>
#include <string>
#include <vector>

namespace {

namespace gp = Gdiplus;
const wchar_t kClassName[] = L"MotiOnQuickBar";
const UINT_PTR kAnimationTimer = 1;

// Layout in device-independent pixels, the same metrics as the NSStackView bar.
const double kInsetX = 6, kInsetY = 5, kSpacing = 2, kButtonW = 32, kButtonH = 28;
const double kRadius = 10, kShadow = 10, kGap = 18;

struct Button {
    enum Kind { Preset, Editor, Close } kind = Preset;
    std::string id;
    std::wstring label;
    quickbar::Curve curve;
    gp::RectF rect;  // window pixels
};

struct Animation {
    enum Phase { Idle, Showing, Hiding } phase = Idle;
    std::chrono::steady_clock::time_point start;
    bool reduce = false;
};

struct Bar {
    std::wstring root;
    std::string token;
    long long sequence = 0;
    long long eventSequence = 0;
    HWND owner = nullptr;
    HWND window = nullptr;
    HWND tooltip = nullptr;
    HHOOK mouseHook = nullptr;
    HHOOK keyHook = nullptr;
    ULONG_PTR gdiplus = 0;
    HMODULE module = nullptr;
    bool classRegistered = false;

    std::vector<Button> buttons;
    std::string signature;
    std::string itemsKey;
    std::wstring title;
    double scale = 1;
    double barW = 0, barH = 0;  // pixels, without the shadow margin
    bool below = false;
    bool visible = false;
    int hover = -1;
    int pressed = -1;
    Animation animation;
};

Bar* g = nullptr;

double px(double dip) { return std::round(dip * (g ? g->scale : 1)); }

// ---------------------------------------------------------------- transport

void saveJson(const wchar_t* name, const std::string& json) { nativefiles::writeAtomic(g->root, name, json); }

void emit(const char* kind, const std::string* id, const std::string* reason = nullptr) {
    const long long now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    g->eventSequence = std::max(g->eventSequence + 1, now);
    mjson::Writer w;
    w.field("version", 1).field("sequence", g->eventSequence).field("kind", kind).field("signature", g->signature);
    if (id) w.field("id", *id);
    // Why the bar closed (diagnostics only; the panel ignores unknown fields).
    if (reason) w.field("reason", *reason);
    saveJson(L"event.json", w.str());
}

void ack(long long sequence, int error) {
    saveJson(L"response.json", mjson::Writer().field("version", 1).field("sequence", sequence)
        .field("error", error).flag("visible", g->visible).str());
}

// ---------------------------------------------------------------- drawing

void roundedRect(gp::GraphicsPath& path, gp::RectF r, float radius) {
    const float d = radius * 2;
    path.AddArc(r.X, r.Y, d, d, 180, 90);
    path.AddArc(r.X + r.Width - d, r.Y, d, d, 270, 90);
    path.AddArc(r.X + r.Width - d, r.Y + r.Height - d, d, d, 0, 90);
    path.AddArc(r.X, r.Y + r.Height - d, d, d, 90, 90);
    path.CloseFigure();
}

/** 22x16 glyph of the preset's cubic bezier, the same shape the panel tiles draw. */
void drawCurve(gp::Graphics& graphics, const gp::RectF& button, const quickbar::Curve& c) {
    const float w = static_cast<float>(px(22)), h = static_cast<float>(px(16));
    const float pad = static_cast<float>(px(2));
    const float left = button.X + (button.Width - w) / 2 + pad, bottom = button.Y + (button.Height + h) / 2 - pad;
    const float iw = w - pad * 2, ih = h - pad * 2;
    double low = 0, high = 1;
    quickbar::glyphRange(c, low, high);
    auto Y = [&](double v) { return bottom - static_cast<float>((std::clamp(v, low, high) - low) / (high - low)) * ih; };
    auto X = [&](double v) { return left + static_cast<float>(std::clamp(v, 0.0, 1.0)) * iw; };
    gp::Pen pen(gp::Color(255, 143, 209, 255), static_cast<float>(1.6 * g->scale));
    pen.SetStartCap(gp::LineCapRound);
    pen.SetEndCap(gp::LineCapRound);
    graphics.DrawBezier(&pen, X(0), Y(0), X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(1), Y(1));
}

void drawEditorIcon(gp::Graphics& graphics, const gp::RectF& b) {
    // slider.horizontal.3: three tracks, each with a knob at a different position.
    gp::Pen track(gp::Color(230, 222, 222, 226), static_cast<float>(1.3 * g->scale));
    gp::SolidBrush knob(gp::Color(255, 222, 222, 226));
    const float w = static_cast<float>(px(14)), x = b.X + (b.Width - w) / 2, step = static_cast<float>(px(4.5));
    const float y0 = b.Y + b.Height / 2 - step, r = static_cast<float>(px(2));
    const float knobs[3] = {0.7f, 0.3f, 0.6f};
    for (int i = 0; i < 3; ++i) {
        const float y = y0 + step * i;
        graphics.DrawLine(&track, x, y, x + w, y);
        graphics.FillEllipse(&knob, x + w * knobs[i] - r, y - r, r * 2, r * 2);
    }
}

void drawCloseIcon(gp::Graphics& graphics, const gp::RectF& b) {
    gp::Pen pen(gp::Color(230, 222, 222, 226), static_cast<float>(1.5 * g->scale));
    pen.SetStartCap(gp::LineCapRound);
    pen.SetEndCap(gp::LineCapRound);
    const float s = static_cast<float>(px(4.5)), cx = b.X + b.Width / 2, cy = b.Y + b.Height / 2;
    graphics.DrawLine(&pen, cx - s, cy - s, cx + s, cy + s);
    graphics.DrawLine(&pen, cx - s, cy + s, cx + s, cy - s);
}

/** Renders the whole bar at `alpha` and `grow` (scale around the edge nearest the pointer). */
void present(double alpha, double grow) {
    const int margin = static_cast<int>(px(kShadow));
    const int width = static_cast<int>(g->barW) + margin * 2, height = static_cast<int>(g->barH) + margin * 2;
    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    void* bits = nullptr;
    HDC screen = GetDC(nullptr);
    HDC memory = CreateCompatibleDC(screen);
    HBITMAP dib = CreateDIBSection(screen, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
    if (!dib || !bits) { if (dib) DeleteObject(dib); DeleteDC(memory); ReleaseDC(nullptr, screen); return; }
    HGDIOBJ previous = SelectObject(memory, dib);
    {
        gp::Bitmap canvas(width, height, width * 4, PixelFormat32bppPARGB, static_cast<BYTE*>(bits));
        gp::Graphics graphics(&canvas);
        graphics.SetSmoothingMode(gp::SmoothingModeAntiAlias);
        graphics.SetPixelOffsetMode(gp::PixelOffsetModeHalf);
        graphics.Clear(gp::Color(0, 0, 0, 0));
        const float anchorY = static_cast<float>(g->below ? margin : margin + g->barH);
        graphics.TranslateTransform(static_cast<float>(width) / 2, anchorY);
        graphics.ScaleTransform(static_cast<float>(grow), static_cast<float>(grow));
        graphics.TranslateTransform(-static_cast<float>(width) / 2, -anchorY);

        const gp::RectF bar(static_cast<float>(margin), static_cast<float>(margin), static_cast<float>(g->barW), static_cast<float>(g->barH));
        const float radius = static_cast<float>(px(kRadius));
        // Soft shadow: stacked translucent outlines, a little lower than the bar.
        for (int i = margin; i >= 1; --i) {
            gp::GraphicsPath shadow;
            roundedRect(shadow, gp::RectF(bar.X - i, bar.Y - i + static_cast<float>(px(2)), bar.Width + i * 2, bar.Height + i * 2), radius + i);
            gp::SolidBrush brush(gp::Color(static_cast<BYTE>(10.0 * (1.0 - static_cast<double>(i) / margin) + 1), 0, 0, 0));
            graphics.FillPath(&brush, &shadow);
        }
        gp::GraphicsPath body;
        roundedRect(body, bar, radius);
        gp::SolidBrush fill(gp::Color(250, 38, 38, 40));
        graphics.FillPath(&fill, &body);
        gp::Pen border(gp::Color(23, 255, 255, 255), static_cast<float>(std::max(1.0, g->scale)));
        graphics.DrawPath(&border, &body);

        for (size_t i = 0; i < g->buttons.size(); ++i) {
            const Button& b = g->buttons[i];
            if (static_cast<int>(i) == g->hover || static_cast<int>(i) == g->pressed) {
                gp::GraphicsPath hot;
                roundedRect(hot, b.rect, static_cast<float>(px(6)));
                gp::SolidBrush brush(gp::Color(static_cast<int>(i) == g->pressed ? 38 : 22, 255, 255, 255));
                graphics.FillPath(&brush, &hot);
            }
            if (b.kind == Button::Preset) drawCurve(graphics, b.rect, b.curve);
            else if (b.kind == Button::Editor) drawEditorIcon(graphics, b.rect);
            else drawCloseIcon(graphics, b.rect);
        }
        // Separator before Editor / Close.
        for (const Button& b : g->buttons) {
            if (b.kind != Button::Editor) continue;
            gp::Pen line(gp::Color(28, 255, 255, 255), static_cast<float>(std::max(1.0, g->scale)));
            const float x = b.rect.X - static_cast<float>(px(kSpacing) + std::max(1.0, g->scale) / 2);
            const float half = static_cast<float>(px(10));
            graphics.DrawLine(&line, x, bar.Y + bar.Height / 2 - half, x, bar.Y + bar.Height / 2 + half);
        }
    }
    RECT placed{};
    GetWindowRect(g->window, &placed);
    POINT origin{placed.left, placed.top}, source{0, 0};
    SIZE size{width, height};
    BLENDFUNCTION blend{AC_SRC_OVER, 0, static_cast<BYTE>(std::clamp(alpha, 0.0, 1.0) * 255), AC_SRC_ALPHA};
    UpdateLayeredWindow(g->window, screen, &origin, &size, memory, &source, 0, &blend, ULW_ALPHA);
    SelectObject(memory, previous);
    DeleteObject(dib);
    DeleteDC(memory);
    ReleaseDC(nullptr, screen);
}

// ---------------------------------------------------------------- layout

double dpiScaleAt(POINT point) {
    const DPI_AWARENESS awareness = GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext());
    if (awareness == DPI_AWARENESS_PER_MONITOR_AWARE) {
        UINT x = 96, y = 96;
        if (SUCCEEDED(GetDpiForMonitor(MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST), MDT_EFFECTIVE_DPI, &x, &y))) return x / 96.0;
    }
    if (awareness == DPI_AWARENESS_SYSTEM_AWARE) return GetDpiForSystem() / 96.0;
    return 1.0;
}

void layout() {
    const int margin = static_cast<int>(px(kShadow));
    double x = margin + px(kInsetX);
    const double y = margin + px(kInsetY);
    for (Button& b : g->buttons) {
        if (b.kind == Button::Editor) x += px(1) + px(kSpacing);  // separator
        b.rect = gp::RectF(static_cast<float>(x), static_cast<float>(y), static_cast<float>(px(kButtonW)), static_cast<float>(px(kButtonH)));
        x += px(kButtonW) + px(kSpacing);
    }
    g->barW = x - px(kSpacing) + px(kInsetX) - margin;
    g->barH = px(kInsetY) * 2 + px(kButtonH);
}

void syncTooltips() {
    if (!g->tooltip) return;
    while (SendMessageW(g->tooltip, TTM_GETTOOLCOUNT, 0, 0) > 0) {
        TTTOOLINFOW tool{};
        tool.cbSize = sizeof tool;
        if (!SendMessageW(g->tooltip, TTM_ENUMTOOLSW, 0, reinterpret_cast<LPARAM>(&tool))) break;
        SendMessageW(g->tooltip, TTM_DELTOOLW, 0, reinterpret_cast<LPARAM>(&tool));
    }
    for (size_t i = 0; i < g->buttons.size(); ++i) {
        const Button& b = g->buttons[i];
        TTTOOLINFOW tool{};
        tool.cbSize = sizeof tool;
        tool.uFlags = TTF_SUBCLASS;
        tool.hwnd = g->window;
        tool.uId = i + 1;
        tool.rect = {static_cast<LONG>(b.rect.X), static_cast<LONG>(b.rect.Y),
                     static_cast<LONG>(b.rect.X + b.rect.Width), static_cast<LONG>(b.rect.Y + b.rect.Height)};
        tool.lpszText = const_cast<wchar_t*>(b.label.c_str());
        SendMessageW(g->tooltip, TTM_ADDTOOLW, 0, reinterpret_cast<LPARAM>(&tool));
    }
}

void rebuild(const quickbar::Show& show) {
    g->buttons.clear();
    g->hover = g->pressed = -1;
    for (const quickbar::Item& item : show.items) {
        Button b;
        b.id = item.id;
        b.label = nativefiles::widen(item.label);
        b.curve = item.curve;
        g->buttons.push_back(b);
    }
    Button editor;
    editor.kind = Button::Editor;
    editor.label = nativefiles::widen(show.labels.editor);
    g->buttons.push_back(editor);
    Button close;
    close.kind = Button::Close;
    close.label = nativefiles::widen(show.labels.close);
    g->buttons.push_back(close);
    g->title = nativefiles::widen(show.labels.title);
    SetWindowTextW(g->window, g->title.c_str());
    layout();
    syncTooltips();
}

int hitTest(int x, int y) {
    for (size_t i = 0; i < g->buttons.size(); ++i) {
        const gp::RectF& r = g->buttons[i].rect;
        if (x >= r.X && x < r.X + r.Width && y >= r.Y && y < r.Y + r.Height) return static_cast<int>(i);
    }
    return -1;
}

// ---------------------------------------------------------------- visibility

bool reduceMotion() {
    BOOL animations = TRUE;
    return SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0) && !animations;
}

void unwatch() {
    if (g->mouseHook) { UnhookWindowsHookEx(g->mouseHook); g->mouseHook = nullptr; }
    if (g->keyHook) { UnhookWindowsHookEx(g->keyHook); g->keyHook = nullptr; }
}

void hideAnimated() {
    if (!g->visible) return;
    g->visible = false;
    g->hover = g->pressed = -1;
    unwatch();
    if (GetCapture() == g->window) ReleaseCapture();
    g->animation = {Animation::Hiding, std::chrono::steady_clock::now(), reduceMotion()};
    SetTimer(g->window, kAnimationTimer, 15, nullptr);
}

void dismiss(const std::string& reason) {
    emit("dismiss", nullptr, &reason);
    hideAnimated();
}

std::string describePress(WPARAM message, HWND target) {
    wchar_t name[64] = L"";
    if (target) GetClassNameW(target, name, 64);
    char head[48];
    std::snprintf(head, sizeof head, "press:0x%04x:", static_cast<unsigned>(message));
    return head + nativefiles::narrow(name, wcslen(name));
}

/** Esc closes; a press anywhere else in AE closes without being swallowed. Thread-local, only while visible. */
LRESULT CALLBACK mouseHook(int code, WPARAM message, LPARAM data) {
    if (code == HC_ACTION && g && g->visible) {
        const auto* info = reinterpret_cast<const MOUSEHOOKSTRUCT*>(data);
        const bool press = message == WM_LBUTTONDOWN || message == WM_RBUTTONDOWN || message == WM_MBUTTONDOWN
            || message == WM_NCLBUTTONDOWN || message == WM_NCRBUTTONDOWN || message == WM_NCMBUTTONDOWN;
        if (press && info->hwnd != g->window && info->hwnd != g->tooltip) {
            try { dismiss(describePress(message, info->hwnd)); } catch (...) { /* never unwind through AE */ }
        }
    }
    return CallNextHookEx(nullptr, code, message, data);
}

LRESULT CALLBACK keyHook(int code, WPARAM key, LPARAM flags) {
    const bool down = !(flags & (1u << 31));
    if (code == HC_ACTION && g && g->visible && down && key == VK_ESCAPE) {
        try { dismiss("escape"); } catch (...) { /* never let C++ unwind through AE's message loop */ }
        return 1;
    }
    return CallNextHookEx(nullptr, code, key, flags);
}

void watch() {
    if (!g->mouseHook) g->mouseHook = SetWindowsHookExW(WH_MOUSE, mouseHook, nullptr, GetCurrentThreadId());
    if (!g->keyHook) g->keyHook = SetWindowsHookExW(WH_KEYBOARD, keyHook, nullptr, GetCurrentThreadId());
}

void placeAtPointer() {
    POINT pointer{};
    GetCursorPos(&pointer);
    const double scale = dpiScaleAt(pointer);
    if (scale != g->scale) { g->scale = scale; layout(); syncTooltips(); }
    MONITORINFO monitor{};
    monitor.cbSize = sizeof monitor;
    GetMonitorInfoW(MonitorFromPoint(pointer, MONITOR_DEFAULTTONEAREST), &monitor);
    const quickbar::Rect work{static_cast<double>(monitor.rcWork.left), static_cast<double>(monitor.rcWork.top),
                              static_cast<double>(monitor.rcWork.right), static_cast<double>(monitor.rcWork.bottom)};
    const quickbar::Placement place = quickbar::place({static_cast<double>(pointer.x), static_cast<double>(pointer.y)},
                                                      g->barW, g->barH, work, px(kGap));
    g->below = place.below;
    const int margin = static_cast<int>(px(kShadow));
    SetWindowPos(g->window, nullptr, static_cast<int>(std::lround(place.origin.x)) - margin, static_cast<int>(std::lround(place.origin.y)) - margin,
                 static_cast<int>(g->barW) + margin * 2, static_cast<int>(g->barH) + margin * 2,
                 SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER);
}

void showAnimated() {
    g->animation = {Animation::Showing, std::chrono::steady_clock::now(), reduceMotion()};
    present(0, g->animation.reduce ? 1 : 0.92);
    SetWindowPos(g->window, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    g->visible = true;
    SetTimer(g->window, kAnimationTimer, 15, nullptr);
    watch();
}

void animate() {
    const double elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - g->animation.start).count();
    const bool reduce = g->animation.reduce;
    if (g->animation.phase == Animation::Showing) {
        const double fade = std::min(1.0, elapsed / (reduce ? 0.08 : 0.16));
        const double growT = std::min(1.0, elapsed / 0.2);
        const double alpha = quickbar::cubicBezier(0, 0, 0.58, 1, fade);  // ease-out
        const double grow = reduce ? 1.0 : 0.92 + 0.08 * quickbar::cubicBezier(0.2, 0.9, 0.3, 1.15, growT);
        present(alpha, grow);
        if (fade >= 1 && (reduce || growT >= 1)) { KillTimer(g->window, kAnimationTimer); g->animation.phase = Animation::Idle; }
    } else if (g->animation.phase == Animation::Hiding) {
        const double fade = std::min(1.0, elapsed / (reduce ? 0.06 : 0.12));
        present(1.0 - quickbar::cubicBezier(0.42, 0, 1, 1, fade), 1.0);  // ease-in
        if (fade >= 1) {
            KillTimer(g->window, kAnimationTimer);
            g->animation.phase = Animation::Idle;
            ShowWindow(g->window, SW_HIDE);
        }
    } else {
        KillTimer(g->window, kAnimationTimer);
    }
}

void pressed(int index) {
    if (index < 0 || index >= static_cast<int>(g->buttons.size())) return;
    const Button& b = g->buttons[static_cast<size_t>(index)];
    if (b.kind == Button::Close) { dismiss("close"); return; }
    if (b.kind == Button::Editor) { emit("editor", nullptr); hideAnimated(); return; }
    // The bar stays up so presets can be compared on the same keys; the panel applies.
    emit("pick", &b.id);
}

void repaint() {
    if (g->visible && g->animation.phase == Animation::Idle) present(1, 1);
}

LRESULT handleMessage(HWND window, UINT message, WPARAM wParam, LPARAM lParam);

LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    if (!g || window != g->window) return DefWindowProcW(window, message, wParam, lParam);
    try { return handleMessage(window, message, wParam, lParam); }
    catch (...) { return DefWindowProcW(window, message, wParam, lParam); }  // never unwind through AE
}

LRESULT handleMessage(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_MOUSEACTIVATE: return MA_NOACTIVATE;  // AE's Timeline keeps keyboard focus
        case WM_SETCURSOR: SetCursor(LoadCursorW(nullptr, MAKEINTRESOURCEW(32512) /* IDC_ARROW */)); return TRUE;
        case WM_MOUSEMOVE: {
            const int hit = hitTest(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
            if (hit != g->hover) { g->hover = hit; repaint(); }
            TRACKMOUSEEVENT track{sizeof track, TME_LEAVE, window, 0};
            TrackMouseEvent(&track);
            return 0;
        }
        case WM_MOUSELEAVE: if (g->hover != -1) { g->hover = -1; repaint(); } return 0;
        case WM_LBUTTONDOWN:
            g->pressed = hitTest(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
            if (g->pressed >= 0) SetCapture(window);
            repaint();
            return 0;
        case WM_LBUTTONUP: {
            const int hit = hitTest(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
            const int down = g->pressed;
            g->pressed = -1;
            if (GetCapture() == window) ReleaseCapture();
            repaint();
            if (down >= 0 && down == hit) pressed(hit);
            return 0;
        }
        case WM_CAPTURECHANGED: if (g->pressed != -1) { g->pressed = -1; repaint(); } return 0;
        case WM_TIMER: if (wParam == kAnimationTimer) animate(); return 0;
        case WM_DPICHANGED: return 0;  // placement re-reads the monitor scale on every show
        default: return DefWindowProcW(window, message, wParam, lParam);
    }
}

bool ensureWindow() {
    if (!g->owner || !IsWindow(g->owner)) return false;
    if (g->window && IsWindow(g->window) && GetWindow(g->window, GW_OWNER) == g->owner) return true;
    // AE recreated its main window (owned windows die with it) or the owner changed: start clean.
    unwatch();
    if (g->window && IsWindow(g->window)) DestroyWindow(g->window);
    g->window = nullptr;
    g->tooltip = nullptr;
    g->itemsKey.clear();
    g->visible = false;
    g->hover = g->pressed = -1;
    g->animation = {};
    if (!g->classRegistered) {
        WNDCLASSEXW wc{};
        wc.cbSize = sizeof wc;
        wc.lpfnWndProc = windowProc;
        wc.hInstance = g->module;
        wc.lpszClassName = kClassName;
        wc.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512) /* IDC_ARROW */);
        if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) return false;
        g->classRegistered = true;
    }
    g->window = CreateWindowExW(WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, kClassName, L"Moti.on",
                                WS_POPUP, 0, 0, 1, 1, g->owner, nullptr, g->module, nullptr);
    if (!g->window) return false;
    INITCOMMONCONTROLSEX controls{sizeof controls, ICC_WIN95_CLASSES};
    InitCommonControlsEx(&controls);
    g->tooltip = CreateWindowExW(WS_EX_TOPMOST | WS_EX_NOACTIVATE, TOOLTIPS_CLASSW, nullptr, WS_POPUP | TTS_ALWAYSTIP | TTS_NOPREFIX,
                                 CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT, CW_USEDEFAULT, g->window, nullptr, g->module, nullptr);
    return true;
}

int show(const mjson::Value& d) {
    quickbar::Show request;
    if (!quickbar::parseShow(d, request)) return 1;
    if (!ensureWindow()) return 1;
    const std::string key = quickbar::itemsKey(request);
    const bool rebuilt = key != g->itemsKey;
    if (rebuilt) { rebuild(request); g->itemsKey = key; }
    const std::string previous = g->signature;
    g->signature = request.signature;
    // The same selection (e.g. after an apply) never makes the bar jump; a new one re-pops it at the pointer.
    if (g->visible && previous == g->signature) {
        if (rebuilt) {  // new favourites under an open bar: resize in place, keep the bottom-centre anchor
            RECT r{};
            GetWindowRect(g->window, &r);
            const int margin = static_cast<int>(px(kShadow));
            const int width = static_cast<int>(g->barW) + margin * 2, height = static_cast<int>(g->barH) + margin * 2;
            SetWindowPos(g->window, nullptr, (r.left + r.right - width) / 2, g->below ? r.top : r.bottom - height, width, height,
                         SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER);
            if (g->animation.phase == Animation::Idle) present(1, 1);
        }
        return 0;
    }
    if (g->visible) { unwatch(); ShowWindow(g->window, SW_HIDE); g->visible = false; }
    placeAtPointer();
    showAnimated();
    return 0;
}

void tick() {
    std::string bytes;
    if (!nativefiles::readSmall(nativefiles::join(g->root, L"request.json"), quickbar::kMaxRequest, bytes)) return;
    mjson::Value d;
    if (!mjson::parse(bytes, d, quickbar::kMaxRequest) || d.type != mjson::Value::Object) return;
    const mjson::Value* token = d.get("token");
    const mjson::Value* version = d.get("version");
    const mjson::Value* sequenceValue = d.get("sequence");
    if (!token || token->type != mjson::Value::String || token->text != g->token) return;
    if (!mjson::isNumber(version) || version->number != 1 || !mjson::isNumber(sequenceValue)) return;
    const double raw = sequenceValue->number;
    if (raw != std::floor(raw) || raw <= static_cast<double>(g->sequence) || raw >= 9007199254740991.0) return;
    const long long sequence = static_cast<long long>(raw);
    g->sequence = sequence;
    const mjson::Value* operation = d.get("operation");
    int error = 1;
    if (operation && operation->type == mjson::Value::String) {
        if (operation->text == "show") error = show(d);
        else if (operation->text == "hide") { if (g->window) hideAnimated(); error = 0; }
    }
    ack(sequence, error);
}

}  // namespace

void QuickBarSetOwner(void* mainWindow) {
    if (g) g->owner = static_cast<HWND>(mainWindow);
}

void QuickBarStart() {
    if (g) return;
    auto bar = std::make_unique<Bar>();
    bar->root = nativefiles::root(L"QuickBar");
    bar->token = nativefiles::token();
    if (bar->root.empty() || bar->token.empty()) return;  // no transport: the panel simply sees no handshake
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                            reinterpret_cast<LPCWSTR>(&QuickBarStart), &bar->module) || !bar->module) return;
    gp::GdiplusStartupInput input;
    if (gp::GdiplusStartup(&bar->gdiplus, &input, nullptr) != gp::Ok) return;
    g = bar.release();
    // A request left by a previous AE session must never be replayed by this one.
    nativefiles::remove(g->root, L"request.json");
    std::string capabilities = "[\"quick-bar\"]";
    saveJson(L"handshake.json", mjson::Writer().field("version", 1).field("token", g->token)
        .raw("capabilities", capabilities).flag("hostProof", true).field("pid", static_cast<long long>(GetCurrentProcessId())).str());
}

void QuickBarIdle() {
    if (!g) return;
    try { tick(); } catch (...) { /* a bad request must never take After Effects down */ }
}

void QuickBarStop() {
    if (!g) return;
    unwatch();
    if (g->window && IsWindow(g->window)) { KillTimer(g->window, kAnimationTimer); DestroyWindow(g->window); }
    if (g->classRegistered) UnregisterClassW(kClassName, g->module);
    nativefiles::remove(g->root, L"handshake.json");
    gp::GdiplusShutdown(g->gdiplus);
    delete g;
    g = nullptr;
}
