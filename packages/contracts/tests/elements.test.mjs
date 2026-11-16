import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ELEMENT_COLOR_NAMES, ELEMENT_LAYER_NAMES, ELEMENT_SOUNDS, MOTION_ELEMENTS, elementColorRoles, elementInsertError, elementTextRoles,
  elementTrack, elementTrackData, findSound, resolveElementArgs
} from "../dist/index.js";
import { SFX_IDS, SFX_RATE, encodeWav, synthesize } from "../../../scripts/generate-sfx.mjs";

const WINDOW_START = { in: 0, out: 1, all: 0 };

test("the element catalog is complete, original and consistent", async () => {
  assert.equal(MOTION_ELEMENTS.length, 203);
  assert.deepEqual([...new Set(MOTION_ELEMENTS.map(e => e.kind))].sort(), ["background", "counter", "drawn", "lower-third", "shape", "social", "text-box", "title", "transition"]);
  assert.equal(new Set(MOTION_ELEMENTS.map(e => e.id)).size, MOTION_ELEMENTS.length);
  const reference = JSON.parse(await readFile(new URL("../../../docs/implementation/2026-09-14-animation-composer/catalogo-referencia.json", import.meta.url), "utf8"));
  for (const locale of ["pt-BR", "en-US"]) {
    assert.equal(new Set(MOTION_ELEMENTS.map(e => e.name[locale])).size, MOTION_ELEMENTS.length, locale);
    for (const element of MOTION_ELEMENTS) assert.ok(!reference.items.some(item => item.referenceLabel === element.name[locale]), element.id);
  }
  for (const element of MOTION_ELEMENTS) {
    assert.ok(ELEMENT_SOUNDS.includes(element.sound), element.id);
    assert.equal(new Set(element.layers.map(l => l.id)).size, element.layers.length, `${element.id}: layer ids`);
    for (const layer of element.layers) {
      assert.ok(ELEMENT_LAYER_NAMES[layer.id], `${element.id}: ${layer.id} has a name`);
      const hasStroke = layer.type === "shape" && typeof layer.stroke === "number";
      for (const t of layer.tracks) {
        if (t.channel.startsWith("trim") || t.channel === "strokeWidth") assert.ok(hasStroke, `${element.id}.${layer.id}: ${t.channel} needs a stroke`);
        // Segments are chronological inside one kind of window, never mixed with the whole duration.
        const windows = new Set(t.segments.map(s => s.window));
        assert.ok(!(windows.has("all") && windows.size > 1), `${element.id}.${layer.id}.${t.channel}`);
        assert.ok(element.timing === "oneshot" ? windows.has("all") : !windows.has("all"), `${element.id}: windows follow the timing`);
        for (let i = 0; i < t.segments.length; i++) {
          const s = t.segments[i];
          assert.ok(s.start >= 0 && s.end <= 1 && s.start < s.end, `${element.id}.${layer.id}.${t.channel}[${i}]`);
          const previous = t.segments[i - 1];
          if (previous) assert.ok(WINDOW_START[previous.window] < WINDOW_START[s.window] || previous.end <= s.start, `${element.id}.${layer.id}.${t.channel} order`);
          if (previous) assert.equal(previous.to, s.from, `${element.id}.${layer.id}.${t.channel} continuity`);
        }
      }
      if (layer.type === "shape" && layer.geometry.shape === "rect" && layer.geometry.fit) {
        const target = element.layers.findIndex(l => l.type === "text" && l.id === layer.geometry.fit.layer);
        assert.ok(target >= 0, `${element.id}: fit target`);
        // Paint order: a filled box drawn after its text would hide it (found in AE 26.5).
        if (layer.stroke === undefined && layer.geometry.fit.axis === "both") assert.ok(target > element.layers.indexOf(layer), `${element.id}: ${layer.id} below its text`);
      }
    }
    assert.ok(elementColorRoles(element).every(role => ELEMENT_COLOR_NAMES[role]));
    for (const role of elementTextRoles(element)) assert.ok(element.defaults.texts[role]?.["pt-BR"] && element.defaults.texts[role]?.["en-US"], `${element.id}: default ${role}`);
    assert.equal(elementInsertError({ elementId: element.id }), null, element.id);
  }
});

test("the track math is exact at the edges and holds between segments", () => {
  const data = elementTrackData([{ window: "in", start: 0, end: .5, from: 0, to: 100, ease: "back" }, { window: "out", start: .5, end: 1, from: 100, to: 20, ease: "in" }]);
  assert.equal(elementTrack(0, 4, 1, data), 0);
  assert.equal(elementTrack(.5, 4, 1, data), 100);
  assert.ok(elementTrack(.3, 4, 1, data) > 100, "back overshoots");
  assert.equal(elementTrack(2, 4, 1, data), 100, "rest");
  assert.equal(elementTrack(3.5, 4, 1, data), 100, "out starts half way into the exit");
  assert.equal(elementTrack(4, 4, 1, data), 20);
  assert.equal(elementTrack(1, 1, 1, data), 20, "a short element halves the window");
  for (const ease of ["linear", "out", "in", "in-out", "back"]) {
    const d = elementTrackData([{ window: "all", start: 0, end: 1, from: 0, to: 1, ease }]);
    assert.equal(elementTrack(0, 2, 0, d), 0); assert.equal(elementTrack(2, 2, 0, d), 1);
  }
  assert.equal(elementTrack(1, 2, 1, []), 0);
});

test("arguments resolve with the element defaults in the session language", () => {
  const resolved = resolveElementArgs({ elementId: "lt-bar", colors: { accent: [0, 0, 1] }, sound: "none" }, "en-US");
  assert.equal(resolved.texts.title, "First Last"); assert.equal(resolved.texts.subtitle, "Role or topic");
  assert.deepEqual(resolved.colors.accent, [0, 0, 1]); assert.deepEqual(resolved.colors.primary, [.07, .09, .16]);
  assert.equal(resolved.soundId, null);
  assert.equal(resolveElementArgs({ elementId: "ring" }, "pt-BR").soundId, "impact");
  assert.equal(elementInsertError({ elementId: "lt-bar", durationFrames: 30, animationFrames: 16 }), "animationFrames");
  assert.equal(elementInsertError({ elementId: "burst", durationFrames: 12, animationFrames: 40 }), null, "a one-shot has no separate exit");
});

test("generated sounds are short, normalized, deterministic 48 kHz WAVs", () => {
  assert.deepEqual([...SFX_IDS].sort(), [...ELEMENT_SOUNDS].sort());
  for (const id of SFX_IDS) {
    const samples = synthesize(id), wav = encodeWav(samples);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.toString("ascii", 8, 12), "WAVE");
    assert.equal(wav.readUInt32LE(24), SFX_RATE); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(40), samples.length * 2);
    const seconds = samples.length / SFX_RATE;
    // Ambiences hold up to 4 s; everything else is a short effect.
    assert.ok(seconds > .05 && seconds <= (findSound(id).family === "drone" ? 4 : 3), `${id}: ${seconds}s`);
    let peak = 0; for (const v of samples) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > .85 && peak <= .89 + 1e-9, `${id}: peak ${peak}`);
    assert.ok(samples[0] === 0, `${id}: fades in`); assert.ok(samples[samples.length - 1] === 0, `${id}: fades out`);
    assert.ok(encodeWav(synthesize(id)).equals(wav), `${id}: deterministic`);
  }
});

test("repeated shapes sit away from the origin the copies turn around", () => {
  // The Repeater turns each copy around the layer origin; a shape drawn on that
  // origin (moved only by the layer position) stacks every copy on one spot.
  for (const element of MOTION_ELEMENTS) for (const layer of element.layers) {
    if (layer.type !== "shape" || !layer.repeater || !layer.repeater.rotation) continue;
    const g = layer.geometry;
    const centre = g.shape === "rect" ? (g.offset ?? [0, 0])
      : g.shape === "path" ? g.points.reduce(([x, y], [px, py]) => [x + px / g.points.length, y + py / g.points.length], [0, 0])
      : [0, 0];
    assert.ok(Math.hypot(centre[0], centre[1]) > 10, `${element.id}.${layer.id}: copies would overlap`);
  }
});
