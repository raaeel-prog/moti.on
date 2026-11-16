import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Functions are serialized with toString into the ES3 host. esbuild prints `{ roll: roll }` as the ES6
 * shorthand `{ roll }` unless object extensions are marked unsupported, and ExtendScript then refuses
 * the whole host ("Esperado: :"). tests/build-output.test.mjs parses the assembled host as ES3. */
const ES3_OBJECTS = { "object-extensions": false };

/** Elementos: catalogo e tabelas como JSON, a matematica ES3 da trilha como fonte. */
function elements(module) {
  const tables = { catalog: module.MOTION_ELEMENTS, layerNames: module.ELEMENT_LAYER_NAMES, colorNames: module.ELEMENT_COLOR_NAMES, limits: module.ELEMENT_LIMITS,
    sounds: module.ELEMENT_SOUNDS, soundCatalog: module.MOTION_SOUNDS, windowCode: module.ELEMENT_WINDOW_CODE, easeCode: module.ELEMENT_EASE_CODE };
  return `global.MotionElements = ${JSON.stringify(tables).slice(0, -1)},\ntrack: ${module.elementTrack.toString()}\n};\n`;
}

export async function generateMotionLibrary() {
  const source = new URL("../packages/contracts/src/", import.meta.url);
  const compiled = await build({
    stdin: { contents: 'export * from "./motion-library.ts"; export * from "./motion-library-math.ts"; export * from "./motion-library-requirements.ts"; export * from "./elements.ts"; export * from "./sounds.ts";', resolveDir: fileURLToPath(source) },
    bundle: true, format: "esm", platform: "node", write: false, supported: ES3_OBJECTS
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const math = ["libraryEase", "libraryTiming", "libraryWave", "libraryDirection", "libraryOrder", "libraryStudioTiming", "librarySequence", "libraryChoreography", "cameraImpactSample", "librarySignatureEnvelope", "librarySignatureVelocity", "librarySignatureGlyph", "libraryRequiredEffects", "libraryUsesDiagonals", "libraryOffscreenDistance", "libraryEffectWindow", "libraryTextDecode", "libraryTextThreeD",
    "libraryTextReference", "libraryTextLocate", "libraryTextPivot", "libraryTextHold", "libraryTextBase", "libraryTextOrient", "libraryTextOrder"];
  // Declared in one closure so host-side helpers can call each other; the
  // functions that expressions embed with toString() stay self-contained.
  const body = `(function(global) {\nglobal.MotionLibraryCatalog = ${JSON.stringify(module.MOTION_LIBRARY_PRESETS)};\n${math.map(name => module[name].toString()).join("\n")}\nglobal.MotionLibraryCore = {\n${math.map(name => `${name}: ${module[name].name}`).join(",\n")}\n};\n${elements(module)}}($.global));\n`;
  const output = new URL("../apps/after-effects-cep/host/generated/motion-library.jsx", import.meta.url);
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, body, "utf8");
  const filmManifest = JSON.parse(await readFile(new URL("../packs/emulsion-v2/manifest.json", import.meta.url), "utf8"));
  await writeFile(new URL("../apps/after-effects-cep/host/generated/emulsion-manifest.jsx", import.meta.url),
    `(function(global) { global.EmulsionV2Manifest = ${JSON.stringify(filmManifest)}; }($.global));\n`, "utf8");
  await generateCameraLibrary();
}

/** Camera engine: recipes as JSON and the kernel declared in one closure, so its
 * functions can call each other in the ES3 host. `source` carries the same
 * declarations for the expressions, which receive the whole kernel at once. */
export async function generateCameraLibrary() {
  const source = new URL("../packages/contracts/src/", import.meta.url);
  const compiled = await build({
    stdin: { contents: 'export * from "./camera-kernel.ts"; export * from "./camera-presets.ts"; export * from "./camera-choreography.ts"; export { libraryEase } from "./motion-library-math.ts";', resolveDir: fileURLToPath(source) },
    bundle: true, format: "esm", platform: "node", write: false, supported: ES3_OBJECTS
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const serialize = (name) => {
    const text = module[name].toString();
    if (!text.startsWith(`function ${name}(`)) throw new Error(`camera kernel: ${name} was renamed by the bundler`);
    return text;
  };
  // The kernel goes into every expression; the planner only into the host.
  const names = ["libraryEase", ...module.CAMERA_KERNEL_FUNCTIONS], planner = [...module.CAMERA_PLANNER_FUNCTIONS];
  const declarations = names.map(serialize).join("\n");
  const body = `(function(global) {\n${declarations}\n${planner.map(serialize).join("\n")}\n` +
    `global.MotionCameraCatalog = ${JSON.stringify(module.CAMERA_RECIPES)};\n` +
    `global.MotionCameraChoreographies = ${JSON.stringify(module.CAMERA_CHOREOGRAPHIES)};\n` +
    `global.MotionCameraCore = {\n${[...names, ...planner].map((name) => `${name}: ${name}`).join(",\n")},\nsource: ${JSON.stringify(declarations)}\n};\n}($.global));\n`;
  const output = new URL("../apps/after-effects-cep/host/generated/camera-library.jsx", import.meta.url);
  await writeFile(output, body, "utf8");
}
