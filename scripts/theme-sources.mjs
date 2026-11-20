import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const tokens = file => `packages/ui-tokens/src/${file}`;
const core = file => `packages/ui-core/src/${file}`;
const readSource = source => readFile(new URL(`../${source}`, import.meta.url), "utf8");

const SHARED_THEME_SOURCES = [
  tokens("tokens.css"),
  core("base.css"),
  // Componentes compartilhados e composição das telas.
  core("components.css"),
  core("control-library.css"),
  core("design-system.css"),
  core("preset-approved.css"),
  core("scrubbable-number.css"),
  core("overlay-controls.css"),
  "packages/ui-motion/src/motion.css"
];

export const AE_THEME_SOURCES = [
  // A ordem preserva a cascata no Chromium do CEP.
  tokens("after-effects.css"),
  core("ae-refinement.css"),
  core("ae-settings.css"),
  core("ae-camera.css"),
  core("ae-workstation.css"),
  core("ae-motion.css"),
  core("ae-quick-actions.css"),
  "apps/after-effects-cep/client/src/tool-previews.css",
  core("ae-layout.css"),
  core("ae-composer-browse.css"),
  core("ae-micro.css"),
  core("ae-preset-actions.css"),
  core("ae-preset-gallery.css"),
  core("ae-design-system.css"),
  core("ae-icon-life.css"),
  core("ae-action-button.css"),
  core("ae-slider.css")
];

export async function renderTheme({ afterEffects }) {
  const [canonical, base, ...layers] = await Promise.all(SHARED_THEME_SOURCES.map(readSource));
  // Keep the token span identifiable in the distributed theme.
  const foundation = `/* @generated tokens:start */\n${canonical.trimEnd()}\n/* @generated tokens:end */\n\n${base}`;
  const shared = [foundation, ...layers].join("\n\n").trimEnd();
  if (!afterEffects) return `${shared}\n`;

  const ae = (await Promise.all(AE_THEME_SOURCES.map(readSource))).join("\n\n");
  const { code } = await transform(ae, { loader: "css", minifyWhitespace: true, legalComments: "inline" });
  return `${shared}\n\n${code}`;
}
