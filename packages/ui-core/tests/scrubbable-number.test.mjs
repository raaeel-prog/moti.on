import { afterEach } from 'node:test';
import assert from "node:assert/strict";
import test from "node:test";
import { attachScrubbableNumber } from "../dist/scrubbable-number.js";

// CEP-like events, including default prevention before the browser can select text.
function fixture({ value = "24", min = "1", max = "600", step = "1" } = {}) {
  const doc = new EventTarget(), view = new EventTarget();
  doc.defaultView = view;
  view.PointerEvent = class {};
  doc.activeElement = null;
  doc.body = { classList: { add() {}, remove() {} } };
  doc.createEvent = () => {
    const event = new Event("");
    event.initEvent = type => Object.defineProperty(event, "type", { value: type });
    return event;
  };
  const attrs = new Map(), captures = new Set();
  const input = Object.assign(new EventTarget(), {
    ownerDocument: doc, type: "number", title: "", className: "", value, min, max, step,
    disabled: false, readOnly: false, isConnected: true, selectionStart: 0, selectionEnd: 0,
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
    setPointerCapture: id => captures.add(id),
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture: id => { captures.delete(id); fire(input, "lostpointercapture", { pointerId: id }); },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    focus() { if (doc.activeElement !== this) { doc.activeElement = this; fire(this, "focus"); } },
    select() { this.setSelectionRange(0, this.value.length); }
  });
  const previews = [], commits = [], changes = [];
  input.addEventListener("change", () => changes.push(input.value));
  const dispose = attachScrubbableNumber(input, { onInput: v => previews.push(v), onCommit: v => commits.push(v) });
  return { input, doc, view, captures, previews, commits, changes, dispose };
}
function fire(target, type, init = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { button: 0, buttons: 1, clientX: 0, pointerId: 1, isPrimary: true, shiftKey: false, altKey: false }, init);
  target.dispatchEvent(event);
  return event;
}

test("frames claim the press before native selection and capture immediately", () => {
  const f = fixture();
  assert.equal(fire(f.input, "pointerdown", { clientX: 100 }).defaultPrevented, true);
  assert.equal(f.captures.has(1), true);
  assert.equal(f.doc.activeElement, null);
  assert.equal(f.input.getAttribute("data-scrub-pressed"), "true");
  assert.equal(fire(f.input, "selectstart").defaultPrevented, true);
  assert.equal(fire(f.input, "dragstart").defaultPrevented, true);
  // Compatibility events must neither start a second gesture nor select text.
  assert.equal(fire(f.input, "mousedown", { clientX: 100 }).defaultPrevented, true);
  fire(f.doc, "pointermove", { clientX: 140 });
  assert.equal(f.input.value, "34");
  assert.deepEqual(f.commits, []);
  fire(f.doc, "pointerup", { clientX: 140 });
  fire(f.input, "click");
  assert.deepEqual(f.commits, [34]);
  assert.deepEqual(f.changes, ["34"]);
  assert.equal(f.doc.activeElement, null);
  assert.equal(f.captures.size, 0);
  assert.equal(f.input.getAttribute("data-scrub-pressed"), null);
  f.dispose();
});

test("a click without a drag selects the value for typing and Enter commits once", () => {
  const f = fixture();
  fire(f.input, "pointerdown", { clientX: 100 });
  fire(f.doc, "pointermove", { clientX: 101 });
  fire(f.doc, "pointerup", { clientX: 101 });
  fire(f.input, "click");
  assert.equal(f.doc.activeElement, f.input);
  assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [0, 2]);
  assert.deepEqual(f.commits, []);
  f.input.value = "48";
  fire(f.input, "input");
  fire(f.input, "keydown", { key: "Enter" });
  fire(f.input, "change");
  assert.deepEqual(f.commits, [48]);
  f.dispose();
});

test("mouse-only delivery works even when the host exposes a PointerEvent constructor", () => {
  const f = fixture();
  assert.equal(fire(f.input, "mousedown", { clientX: 100 }).defaultPrevented, true);
  console.log("before mousemove", f.input.value); fire(f.doc, "mousemove", { clientX: 60 });  console.log("after mousemove", f.input.value);
  assert.equal(f.input.value, "14");
  fire(f.doc, "mouseup", { clientX: 60 });
  assert.deepEqual(f.commits, [14]);
  f.dispose();
});

test("a numeric row can be the invisible drag target while the compact number stays editable", () => {
  const f = fixture();
  f.dispose();
  const row = new EventTarget(), starts = [], finishes = [];
  const dispose = attachScrubbableNumber(f.input, {
    hitTarget: row,
    onGestureStart: value => { starts.push(value); return true; },
    onGestureEnd: (value, canceled) => finishes.push([value,canceled])
  });
  assert.equal(fire(row,"pointerdown",{clientX:150}).defaultPrevented,true);
  fire(f.doc,"pointermove",{clientX:190});
  assert.equal(f.input.value,"34");
  fire(f.doc,"pointerup",{clientX:190});
  assert.deepEqual(starts,[24]);
  assert.deepEqual(finishes,[[34,false]]);
  dispose();
});

test("frames stay integral with Shift, clamp at bounds and respond immediately on reversal", () => {
  const f = fixture({ value: "590" });
  fire(f.input, "pointerdown", { clientX: 100 });
  fire(f.doc, "pointermove", { clientX: 140, altKey: true });
  assert.equal(f.input.value, "600");
  fire(f.doc, "pointermove", { clientX: 136 });
  assert.equal(f.input.value, "599");
  fire(f.doc, "pointermove", { clientX: 96, shiftKey: true });
  assert.equal(f.input.value, "598");
  fire(f.doc, "pointerup");
  assert.deepEqual(f.commits, [598]);
  f.dispose();
});

test("Escape, pointer cancellation and window blur restore the draft without committing", () => {
  for (const reason of ["escape", "cancel", "blur"]) {
    const f = fixture();
    fire(f.input, "pointerdown");
    fire(f.doc, "pointermove", { clientX: 40 });
    assert.equal(f.input.value, "34");
    if (reason === "escape") fire(f.doc, "keydown", { key: "Escape" });
    if (reason === "cancel") fire(f.doc, "pointercancel");
    if (reason === "blur") fire(f.view, "blur");
    assert.equal(f.input.value, "24");
    assert.deepEqual(f.commits, []);
    fire(f.doc, "pointermove", { clientX: 80 });
    assert.equal(f.input.value, "24");
    f.dispose();
  }
});

test("fine decimal scrubbing preserves commas for typing, disabled fields and disposal", () => {
  const f = fixture({ value: "1,25", min: "0", max: "10", step: "0.1" });
  fire(f.input, "mousedown");
  fire(f.doc, "mousemove", { clientX: 4, shiftKey: true });
  assert.equal(f.input.value, "1.26");
  fire(f.doc, "mouseup");
  assert.deepEqual(f.commits, [1.26]);
  f.input.disabled = true;
  assert.equal(fire(f.input, "mousedown").defaultPrevented, false);
  f.input.disabled = false;
  fire(f.input, "mousedown");
  fire(f.doc, "mousemove", { clientX: 4 });
  f.dispose();
  assert.equal(f.input.value, "1.26");
  assert.equal(f.input.className.trim(), "");
  fire(f.doc, "mousemove", { clientX: 100 });
  assert.equal(f.input.value, "1.26");
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});
