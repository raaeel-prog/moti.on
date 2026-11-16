import test from "node:test";
import assert from "node:assert/strict";

import { MOTION_SOUNDS, SOUND_FAMILIES, soundInsertError } from "../../../packages/contracts/dist/index.js";
import { elementsFixture } from "./elements-harness.mjs";

// `ae.sound.insert`: the synthesized WAV becomes one audio layer at the
// current time; the footage is imported once per project and reused.

test("every sound family has at least one sound and ids are unique", () => {
  assert.equal(new Set(MOTION_SOUNDS.map(s => s.id)).size, MOTION_SOUNDS.length);
  for (const family of SOUND_FAMILIES) assert.ok(MOTION_SOUNDS.some(s => s.family === family), family);
  for (const locale of ["pt-BR", "en-US"]) assert.equal(new Set(MOTION_SOUNDS.map(s => s.name[locale])).size, MOTION_SOUNDS.length, locale);
});

test("inserts an audio layer at the current time and reuses the imported footage", async () => {
  const f = await elementsFixture();
  const first = f.sound({ soundId: "boom-cinema" });
  assert.equal(first.changed, true);
  assert.equal(first.data.importedSound, true);
  const layer = f.comp.layer(first.data.layerIndex);
  assert.equal(layer.startTime, 2);
  assert.equal(layer.name, "Moti.on · Estrondo de cinema");
  assert.ok(layer.selected);
  assert.ok(layer.comment.startsWith("[MOTION_SOUND_V1]"));
  const second = f.sound({ soundId: "boom-cinema" }, "en-US");
  assert.equal(second.data.importedSound, false, "footage reused");
  assert.equal(f.imports, 1);
  assert.equal(f.comp.layer(second.data.layerIndex).name, "Moti.on · Trailer boom");
  const folders = f.list.filter(item => item.constructor.name === "FolderItem").map(item => item.name).sort();
  assert.deepEqual(folders, ["Moti.on Elementos", "Sons"]);
});

test("reverse plays backwards from the current time and gain sets the levels", async () => {
  const f = await elementsFixture();
  const result = f.sound({ soundId: "slide-up", reverse: true, gainDb: -6 });
  const layer = f.comp.layer(result.data.layerIndex);
  assert.equal(layer.stretch, -100);
  assert.equal(layer.startTime, 2 + .5, "in-point lands on the current time");
  assert.deepEqual(layer.property("ADBE Audio Group").property("ADBE Audio Levels").value, [-6, -6]);
});

test("host preflight and the contract refuse the same arguments", async () => {
  const f = await elementsFixture({ missingSounds: ["tick"] });
  const cases = [{}, { soundId: "nope" }, { soundId: "beep", reverse: "yes" }, { soundId: "beep", gainDb: 12 }, { soundId: "beep", extra: 1 }];
  for (const args of cases) {
    assert.notEqual(soundInsertError(args), null, JSON.stringify(args));
    assert.ok(f.soundCommand.preflight(args, { locale: "pt-BR" }), JSON.stringify(args));
  }
  assert.equal(soundInsertError({ soundId: "beep", reverse: true, gainDb: -3 }), null);
  assert.equal(f.soundCommand.preflight({ soundId: "tick" }, { locale: "pt-BR" }).code, "CAPABILITY_UNAVAILABLE", "missing WAV");
  f.project.activeItem = null;
  assert.equal(f.soundCommand.preflight({ soundId: "beep" }, { locale: "pt-BR" }).code, "NO_ACTIVE_COMP");
});

test("run without a matching preflight is refused", async () => {
  const f = await elementsFixture();
  assert.throws(() => f.soundCommand.run({ soundId: "beep" }, { locale: "pt-BR" }), /preflight/);
});
