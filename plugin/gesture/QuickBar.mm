// Moti.on quick bar: a borderless, non-activating floating bar that appears
// next to the pointer when the panel reports a new keyframe selection.
//
// After Effects exposes neither the Timeline's drawing surface nor keyframe
// screen positions, so the bar is anchored to the pointer: selecting keyframes
// means the pointer has just been on them. The panel decides WHEN (selection
// watch); this file only shows, animates and reports clicks. It never writes to
// the project: a pick is reported to the panel, which applies it through the
// same `ae.keys.ease.apply` command (stale-selection check, one Undo).
//
// Transport mirrors GestureBridge: private 0700 folder, a per-launch token in
// handshake.json, request.json polled on AE's main thread by the idle hook
// (AppKit is main-thread only), atomic event.json for clicks/dismissals.
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#include "QuickBar.h"
#include <cmath>
#include <string>
#include <sys/stat.h>
#include <unistd.h>

static NSString* const kRootSuffix = @"Library/Caches/Moti.on/QuickBar";
static const NSUInteger kMaxItems = 12;
static const NSUInteger kMaxRequest = 8192;

@class QBController;
static QBController* gController = nil;

static BOOL qbString(NSDictionary* d, NSString* key, NSUInteger max) {
    return [d[key] isKindOfClass:[NSString class]] && [d[key] length] > 0 && [d[key] length] <= max;
}
static BOOL qbNumber(id value) {
    return [value isKindOfClass:[NSNumber class]] && CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID() && std::isfinite([value doubleValue]);
}

/** Never becomes key: AE's Timeline keeps keyboard focus while the bar is up. */
@interface QBPanel : NSPanel
@end
@implementation QBPanel
- (BOOL)canBecomeKeyWindow { return NO; }
- (BOOL)canBecomeMainWindow { return NO; }
@end

/** A click lands on the first press even though AE stays the active window. */
@interface QBButton : NSButton
@property(nonatomic, copy) NSString* itemId;
@end
@implementation QBButton
- (BOOL)acceptsFirstMouse:(NSEvent*)event { return YES; }
@end

/** 22×16 glyph of a cubic bezier, the same shape the panel's preset tiles draw. */
static NSImage* qbCurveImage(double x1, double y1, double x2, double y2) {
    NSSize size = NSMakeSize(22, 16);
    return [NSImage imageWithSize:size flipped:NO drawingHandler:^BOOL(NSRect rect) {
        const double pad = 2, w = rect.size.width - pad * 2, h = rect.size.height - pad * 2;
        // Overshooting presets (back) leave the 0..1 box: squeeze -0.6..1.6 into the glyph.
        const double low = std::fmin(0, std::fmin(y1, y2)), high = std::fmax(1, std::fmax(y1, y2));
        auto Y = [&](double v) { return pad + (v - low) / (high - low) * h; };
        NSBezierPath* path = [NSBezierPath bezierPath];
        [path moveToPoint:NSMakePoint(pad, Y(0))];
        [path curveToPoint:NSMakePoint(pad + w, Y(1)) controlPoint1:NSMakePoint(pad + x1 * w, Y(y1)) controlPoint2:NSMakePoint(pad + x2 * w, Y(y2))];
        path.lineWidth = 1.6; path.lineCapStyle = NSLineCapStyleRound;
        [[NSColor colorWithSRGBRed:0.56 green:0.82 blue:1.0 alpha:1] setStroke];
        [path stroke];
        return YES;
    }];
}

@interface QBController : NSObject
@property(nonatomic) std::string root;
@property(nonatomic) std::string token;
@property(nonatomic) long long sequence;
@property(nonatomic) long long eventSequence;
@property(nonatomic, strong) QBPanel* panel;
@property(nonatomic, strong) NSStackView* stack;
@property(nonatomic, copy) NSString* signature;
@property(nonatomic, copy) NSString* itemsKey;
@property(nonatomic, strong) id monitor;
@property(nonatomic) NSUInteger generation;
@property(nonatomic) BOOL visible;
@end

@implementation QBController

- (NSString*)path:(NSString*)name { return [[NSString stringWithUTF8String:self.root.c_str()] stringByAppendingPathComponent:name]; }

- (void)save:(NSString*)name value:(NSDictionary*)value {
    NSData* bytes = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    NSString* path = [self path:name];
    [bytes writeToFile:path options:NSDataWritingAtomic error:nil];
    chmod([path fileSystemRepresentation], 0600);
}

- (void)event:(NSString*)kind item:(NSString*)itemId {
    self.eventSequence = std::max(self.eventSequence + 1, (long long)([[NSDate date] timeIntervalSince1970] * 1000));
    NSMutableDictionary* value = [@{ @"version": @1, @"sequence": @(self.eventSequence), @"kind": kind, @"signature": self.signature ?: @"" } mutableCopy];
    if (itemId) value[@"id"] = itemId;
    [self save:@"event.json" value:value];
}

- (void)ack:(long long)sequence error:(int)error {
    [self save:@"response.json" value:@{ @"version": @1, @"sequence": @(sequence), @"error": @(error), @"visible": @(self.visible) }];
}

- (QBPanel*)ensurePanel {
    if (self.panel) return self.panel;
    QBPanel* panel = [[QBPanel alloc] initWithContentRect:NSMakeRect(0, 0, 240, 40)
        styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel backing:NSBackingStoreBuffered defer:YES];
    panel.floatingPanel = YES; panel.becomesKeyOnlyIfNeeded = YES; panel.hidesOnDeactivate = YES;
    panel.level = NSFloatingWindowLevel; panel.opaque = NO; panel.backgroundColor = NSColor.clearColor; panel.hasShadow = YES;
    panel.releasedWhenClosed = NO; panel.animationBehavior = NSWindowAnimationBehaviorNone;
    panel.collectionBehavior = NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle;
    panel.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    NSView* content = [[NSView alloc] initWithFrame:panel.contentView.bounds];
    content.wantsLayer = YES;
    content.layer.backgroundColor = [NSColor colorWithSRGBRed:0.15 green:0.15 blue:0.155 alpha:0.98].CGColor;
    content.layer.cornerRadius = 10; content.layer.borderWidth = 1;
    content.layer.borderColor = [NSColor colorWithWhite:1 alpha:0.09].CGColor;
    NSStackView* stack = [NSStackView stackViewWithViews:@[]];
    stack.orientation = NSUserInterfaceLayoutOrientationHorizontal; stack.spacing = 2;
    stack.edgeInsets = NSEdgeInsetsMake(5, 6, 5, 6); stack.translatesAutoresizingMaskIntoConstraints = NO;
    [content addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.leadingAnchor constraintEqualToAnchor:content.leadingAnchor], [stack.trailingAnchor constraintEqualToAnchor:content.trailingAnchor],
        [stack.topAnchor constraintEqualToAnchor:content.topAnchor], [stack.bottomAnchor constraintEqualToAnchor:content.bottomAnchor]]];
    panel.contentView = content;
    panel.accessibilityRole = NSAccessibilityToolbarRole;
    self.panel = panel; self.stack = stack;
    return panel;
}

- (QBButton*)button:(NSString*)itemId label:(NSString*)label image:(NSImage*)image {
    QBButton* b = [QBButton buttonWithImage:image target:self action:@selector(pressed:)];
    b.itemId = itemId; b.bezelStyle = NSBezelStyleRecessed; b.showsBorderOnlyWhileMouseInside = YES;
    b.imagePosition = NSImageOnly; b.toolTip = label; b.accessibilityLabel = label;
    [b.widthAnchor constraintEqualToConstant:32].active = YES; [b.heightAnchor constraintEqualToConstant:28].active = YES;
    return b;
}

- (void)rebuild:(NSArray<NSDictionary*>*)items labels:(NSDictionary*)labels {
    [self ensurePanel];
    for (NSView* view in [self.stack.arrangedSubviews copy]) { [self.stack removeArrangedSubview:view]; [view removeFromSuperview]; }
    for (NSDictionary* item in items) {
        NSDictionary* c = item[@"curve"];
        [self.stack addArrangedSubview:[self button:item[@"id"] label:item[@"label"]
            image:qbCurveImage([c[@"x1"] doubleValue], [c[@"y1"] doubleValue], [c[@"x2"] doubleValue], [c[@"y2"] doubleValue])]];
    }
    NSBox* separator = [[NSBox alloc] initWithFrame:NSMakeRect(0, 0, 1, 20)];
    separator.boxType = NSBoxSeparator; [separator.widthAnchor constraintEqualToConstant:1].active = YES;
    [self.stack addArrangedSubview:separator];
    NSImage* editor = [NSImage imageWithSystemSymbolName:@"slider.horizontal.3" accessibilityDescription:labels[@"editor"]];
    NSImage* close = [NSImage imageWithSystemSymbolName:@"xmark" accessibilityDescription:labels[@"close"]];
    [self.stack addArrangedSubview:[self button:@"__editor" label:labels[@"editor"] image:editor]];
    [self.stack addArrangedSubview:[self button:@"__close" label:labels[@"close"] image:close]];
    self.panel.accessibilityLabel = labels[@"title"];
    [self.panel.contentView layoutSubtreeIfNeeded];
    [self.panel setContentSize:self.stack.fittingSize];
}

/** Above the pointer, centred, kept on the pointer's screen; below it when there is no room above. */
- (void)placeAtPointer {
    NSPoint mouse = [NSEvent mouseLocation];
    NSScreen* screen = NSScreen.mainScreen;
    for (NSScreen* candidate in NSScreen.screens) if (NSMouseInRect(mouse, candidate.frame, NO)) { screen = candidate; break; }
    NSRect visible = screen.visibleFrame; NSSize size = self.panel.frame.size;
    const CGFloat gap = 18;
    NSPoint origin = NSMakePoint(mouse.x - size.width / 2, mouse.y + gap);
    if (origin.y + size.height > NSMaxY(visible)) origin.y = mouse.y - gap - size.height;
    origin.x = std::fmax(NSMinX(visible) + 4, std::fmin(origin.x, NSMaxX(visible) - size.width - 4));
    origin.y = std::fmax(NSMinY(visible) + 4, origin.y);
    [self.panel setFrameOrigin:origin];
}

- (BOOL)reduceMotion { return NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion; }

- (void)showAnimated {
    ++self.generation;
    QBPanel* panel = self.panel; CALayer* layer = panel.contentView.layer;
    BOOL reduce = [self reduceMotion];
    panel.alphaValue = 0;
    [panel orderFrontRegardless];
    self.visible = YES;
    if (!reduce && layer) {
        // Grow from the edge nearest the pointer: a pop that reads as "came from the keyframe".
        layer.anchorPoint = CGPointMake(0.5, 0); layer.position = CGPointMake(NSWidth(layer.frame) / 2, 0);
        CABasicAnimation* grow = [CABasicAnimation animationWithKeyPath:@"transform.scale"];
        grow.fromValue = @0.92; grow.toValue = @1; grow.duration = 0.2;
        grow.timingFunction = [CAMediaTimingFunction functionWithControlPoints:0.2 :0.9 :0.3 :1.15];
        [layer addAnimation:grow forKey:@"qb-grow"];
    }
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext* context) {
        context.duration = reduce ? 0.08 : 0.16;
        context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseOut];
        panel.animator.alphaValue = 1;
    } completionHandler:nil];
    [self watch];
}

- (void)hideAnimated {
    if (!self.visible) return;
    self.visible = NO; [self unwatch];
    NSUInteger generation = ++self.generation;
    QBPanel* panel = self.panel;
    [NSAnimationContext runAnimationGroup:^(NSAnimationContext* context) {
        context.duration = [self reduceMotion] ? 0.06 : 0.12;
        context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseIn];
        panel.animator.alphaValue = 0;
    } completionHandler:^{ if (self.generation == generation) [panel orderOut:nil]; }];
}

/** Esc closes; a press anywhere else in AE closes without being swallowed. */
- (void)watch {
    if (self.monitor) return;
    __weak QBController* weak = self;
    self.monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown | NSEventMaskKeyDown handler:^NSEvent*(NSEvent* event) {
        QBController* me = weak;
        if (!me || !me.visible) return event;
        if (event.type == NSEventTypeKeyDown) {
            if (event.keyCode == 53) { [me event:@"dismiss" item:nil]; [me hideAnimated]; return nil; }
            return event;
        }
        if (event.window != me.panel) { [me event:@"dismiss" item:nil]; [me hideAnimated]; }
        return event;
    }];
}
- (void)unwatch { if (self.monitor) { [NSEvent removeMonitor:self.monitor]; self.monitor = nil; } }

- (void)pressed:(QBButton*)sender {
    if ([sender.itemId isEqualToString:@"__close"]) { [self event:@"dismiss" item:nil]; [self hideAnimated]; return; }
    if ([sender.itemId isEqualToString:@"__editor"]) { [self event:@"editor" item:nil]; [self hideAnimated]; return; }
    // The bar stays up so presets can be compared on the same keys; the panel applies.
    [self event:@"pick" item:sender.itemId];
}

- (int)show:(NSDictionary*)d {
    if (!qbString(d, @"signature", 4096) || ![d[@"items"] isKindOfClass:[NSArray class]] || ![d[@"labels"] isKindOfClass:[NSDictionary class]]) return 1;
    NSArray* raw = d[@"items"]; NSDictionary* labels = d[@"labels"];
    if (raw.count == 0 || raw.count > kMaxItems || !qbString(labels, @"editor", 80) || !qbString(labels, @"close", 80) || !qbString(labels, @"title", 80)) return 1;
    NSMutableArray* items = [NSMutableArray array];
    for (NSDictionary* item in raw) {
        if (![item isKindOfClass:[NSDictionary class]] || !qbString(item, @"id", 80) || !qbString(item, @"label", 80) || [item[@"id"] hasPrefix:@"__"]) return 1;
        NSDictionary* c = item[@"curve"];
        if (![c isKindOfClass:[NSDictionary class]] || !qbNumber(c[@"x1"]) || !qbNumber(c[@"y1"]) || !qbNumber(c[@"x2"]) || !qbNumber(c[@"y2"])) return 1;
        [items addObject:item];
    }
    NSString* key = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:@[items, labels] options:0 error:nil] encoding:NSUTF8StringEncoding];
    if (![key isEqualToString:self.itemsKey]) { [self rebuild:items labels:labels]; self.itemsKey = key; }
    NSString* previous = self.signature;
    self.signature = d[@"signature"];
    // The same selection (e.g. after an apply) never makes the bar jump; a new one re-pops it at the pointer.
    if (self.visible && [previous isEqualToString:self.signature]) return 0;
    if (self.visible) { [self.panel orderOut:nil]; self.visible = NO; }
    [self placeAtPointer];
    [self showAnimated];
    return 0;
}

- (void)tick {
    NSString* path = [self path:@"request.json"];
    struct stat info{};
    if (lstat([path fileSystemRepresentation], &info) || !S_ISREG(info.st_mode) || info.st_uid != getuid() || info.st_size <= 0 || info.st_size > (off_t)kMaxRequest) return;
    NSData* bytes = [NSData dataWithContentsOfFile:path];
    if (!bytes || bytes.length > kMaxRequest) return;
    NSDictionary* d = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    if (![d isKindOfClass:[NSDictionary class]] || ![d[@"token"] isKindOfClass:[NSString class]] || ![d[@"token"] isEqualToString:[NSString stringWithUTF8String:self.token.c_str()]]) return;
    if (!qbNumber(d[@"version"]) || [d[@"version"] intValue] != 1 || !qbNumber(d[@"sequence"])) return;
    double raw = [d[@"sequence"] doubleValue]; long long sequence = [d[@"sequence"] longLongValue];
    if (raw != (double)sequence || sequence <= self.sequence || sequence >= 9007199254740991LL) return;
    self.sequence = sequence;
    NSString* operation = d[@"operation"]; int error = 1;
    if ([operation isEqual:@"show"]) error = [self show:d];
    else if ([operation isEqual:@"hide"]) { [self hideAnimated]; error = 0; }
    [self ack:sequence error:error];
}

- (void)start {
    NSString* root = [NSHomeDirectory() stringByAppendingPathComponent:kRootSuffix];
    [[NSFileManager defaultManager] createDirectoryAtPath:root withIntermediateDirectories:YES attributes:@{ NSFilePosixPermissions: @0700 } error:nil];
    chmod([root fileSystemRepresentation], 0700);
    self.root = [root UTF8String];
    self.token = [[[NSUUID UUID] UUIDString] UTF8String];
    // A request left by a previous AE session must never be replayed by this one.
    [[NSFileManager defaultManager] removeItemAtPath:[self path:@"request.json"] error:nil];
    [self save:@"handshake.json" value:@{ @"version": @1, @"token": [NSString stringWithUTF8String:self.token.c_str()], @"capabilities": @[@"quick-bar"], @"hostProof": @YES, @"pid": @(getpid()) }];
}

- (void)stop {
    [self unwatch];
    if (self.panel) [self.panel orderOut:nil];
    [[NSFileManager defaultManager] removeItemAtPath:[self path:@"handshake.json"] error:nil];
}
@end

void QuickBarStart() { @autoreleasepool { if (!gController) { gController = [QBController new]; [gController start]; } } }
void QuickBarIdle() { @autoreleasepool { [gController tick]; } }
void QuickBarStop() { @autoreleasepool { [gController stop]; gController = nil; } }
