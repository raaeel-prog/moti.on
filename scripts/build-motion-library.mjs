import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function generateMotionLibrary() {
  const source = new URL("../packages/contracts/src/", import.meta.url);
  const compiled = await build({
    stdin: { contents: 'export * from "./motion-library.ts"; export * from "./motion-library-math.ts"; export * from "./motion-library-requirements.ts";', resolveDir: fileURLToPath(source) },
    bundle: true, format: "esm", platform: "node", write: false
  });
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const math = ["libraryEase", "libraryTiming", "libraryWave", "libraryDirection", "libraryOrder", "libraryStudioTiming", "librarySequence", "libraryChoreography", "cameraImpactSample", "librarySignatureEnvelope", "librarySignatureVelocity", "librarySignatureGlyph", "libraryRequiredEffects"];
  const body = `(function(global) {\nglobal.MotionLibraryCatalog = ${JSON.stringify(module.MOTION_LIBRARY_PRESETS)};\nglobal.MotionLibraryCore = {\n${math.map(name => `${name}: ${module[name].toString()}`).join(",\n")}\n};\n}($.global));\n`;
  const output = new URL("../apps/after-effects-cep/host/generated/motion-library.jsx", import.meta.url);
  await mkdir(new URL(".", output), { recursive: true });
  await writeFile(output, body, "utf8");
}
