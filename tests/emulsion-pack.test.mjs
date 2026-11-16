import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { findBannedConstructs } from "../scripts/check-extendscript.mjs";
import "../packs/emulsion-v2/tests/runtime.test.mjs";

const manifest = JSON.parse(await readFile(new URL("../packs/emulsion-v2/manifest.json", import.meta.url), "utf8"));
const compilation = await build({stdin:{contents:'export * from "./packages/contracts/src/motion-library.js"; export * from "./packages/contracts/src/motion-library-emulsion.js"; export * from "./packages/contracts/src/motion-library-requirements.js"; export * from "./apps/after-effects-cep/client/src/preset-gallery.js"; export * from "./apps/after-effects-cep/client/src/emulsion-reference-assets.js";',resolveDir:process.cwd()},bundle:true,platform:"node",format:"esm",write:false});
const library = await import(`data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString("base64")}`);

test("Emulsion manifest, catalog and cut-scoped gallery remain consistent", () => {
  const presets = library.MOTION_LIBRARY_EMULSION_PRESETS;
  assert.equal(presets.length, manifest.profiles.length);
  assert.deepEqual(presets.map(p => p.id), manifest.profiles.map(p => p.id));
  assert.equal(library.MOTION_LIBRARY_PRESETS.some(p => p.filmSpec), false, "Independent cut packs do not enter the layer-animation engine");
  for (const p of presets) {
    const recipe = manifest.profiles.find(r => r.id === p.id);
    assert.deepEqual(p.name, recipe.name);
    assert.equal(library.motionLibraryRequirements(p).layer, "composition");
    assert.equal(library.motionLibraryRequirements(p).motionCore, false);
    const card = library.GALLERY_PRESETS.find(c => c.motion?.id === p.id);
    assert.equal(card.category, "camera-transitions");
    assert.equal(card.applyMode, "precomp");
    assert.equal(card.handler, "ae.presets.camera-transition");
    assert.equal(card.params.durationFrames, manifest.defaultDurationFrames);
    assert.equal(library.galleryCategoryMatches("emulsion", card), true);
    assert.equal(library.galleryCategoryMatches(`emulsion-${p.filmSpec.family}`, card), true);
    assert.equal(library.galleryCategoryMatches("premium", card), false);
  }
});

test("Emulsion preview media never resolves a supplied path or remote URL", () => {
  const p = library.MOTION_LIBRARY_EMULSION_PRESETS[0];
  assert.equal(library.emulsionReferenceFor(p).video, `${p.id}.mp4`);
  assert.equal(library.emulsionReferenceFor({...p,id:"../../escape"}), undefined);
  assert.equal(library.emulsionReferenceFor({...p,id:"https://example.com/a"}), undefined);
  assert.equal(library.emulsionReferenceFor({...p,collection:"text"}), undefined);
});

test("Independent runtime and standalone loader obey the ExtendScript subset", async () => {
  for (const file of ["runtime.jsx"]) {
    const source = await readFile(new URL(`../packs/emulsion-v2/${file}`, import.meta.url), "utf8");
    assert.deepEqual(findBannedConstructs(source), [], file);
    new vm.Script(source.replace(/^#target\b.*$/mg, ""), {filename:file});
  }
});

test("Film adapter preserves existing camera routing and isolates missing pack assets", async () => {
  const source = await readFile(new URL("../apps/after-effects-cep/host/src/commands/emulsion-transition.jsx", import.meta.url), "utf8");
  const calls = [], handler = {preflight:()=>{calls.push("camera-preflight");return null;},run:()=>"camera-result"};
  const camera = {owns:()=>false,inspect:()=>"camera-inspect",hasSelected:()=>false,adjustPreflight:()=>null,apply:()=>"camera-apply",selectionPreflight:()=>null,remove:()=>"camera-remove",bake:()=>"camera-bake"};
  const filmLayer = {id:77,source:{id:78}};
  const pack = {configure:()=>{calls.push("configure");},preflight:()=>null,apply:()=>({layer:filmLayer,created:true}),owns:l=>l===filmLayer,inspect:()=>"film-inspect"};
  const context = {EmulsionV2:pack,EmulsionV2Manifest:manifest,MotionCameraTransition:camera,MotionEmulsionAssetRoot:"C:/test/assets",MotionRegistry:{get:()=>handler},MotionContracts:{ERROR:{INVALID_PRESET:"INVALID_PRESET"}},app:{project:{activeItem:{selectedLayers:[]}}}};
  context.$ = {global:context};
  vm.runInNewContext(source, context);
  assert.equal(handler.preflight({presetId:"camera-zoom-soft"},{}),null);
  assert.equal(handler.run({presetId:"camera-zoom-soft"},{}),"camera-result");
  for (const recipe of manifest.profiles) {
    assert.equal(handler.preflight({presetId:recipe.id},{}),null);
    assert.equal(handler.run({presetId:recipe.id},{locale:"pt-BR"}).data.packId,"emulsion-v2");
  }
  assert.equal(camera.inspect(filmLayer),"film-inspect");
  assert.equal(camera.inspect({}),"camera-inspect");
  pack.configure=()=>{throw Object.assign(new Error("Missing pack"),{code:"ASSET_NOT_FOUND"});};
  vm.runInNewContext(source,context);
  assert.equal(handler.preflight({presetId:manifest.profiles[0].id},{}).message,"Missing pack");
  assert.equal(handler.run({presetId:"camera-zoom-soft"},{}),"camera-result");
});
