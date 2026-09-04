/**
 * Rótulos de Undo, nos dois idiomas.
 *
 * Estes ficam separados do resto da tradução da interface por um motivo
 * concreto: eles são escritos pelo **host**, não pelo painel. Quem grava o texto
 * que aparece em `Edit > Undo` é o `app.beginUndoGroup` dentro do ExtendScript, e
 * o ExtendScript não tem acesso ao sistema de i18n do painel.
 *
 * Por isso esta tabela é gerada para dentro do host, e o `locale` viaja no
 * `CommandContext`. O restante da tradução, que chega no CHMS-008, vive só no
 * painel e não precisa atravessar a ponte.
 *
 * `undo.none` existe para os comandos que não mutam. Eles nunca abrem grupo de
 * Undo, então o valor nunca é usado — mas o `Record` obriga toda chave declarada
 * num descriptor a existir aqui, e é isso que impede um comando mutante de ser
 * adicionado sem rótulo.
 */
export const SUPPORTED_LOCALES = ["en-US", "pt-BR"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export const UNDO_LABELS: Record<string, Record<SupportedLocale, string>> = {
  "undo.none": {
    "en-US": "",
    "pt-BR": ""
  },
  "undo.ae.demo.createComposition": {
    "en-US": "Moti.on: create test composition",
    "pt-BR": "Moti.on: criar composição de teste"
  },
  "undo.ae.expression.loopout": {
    "en-US": "Moti.on: apply LoopOut",
    "pt-BR": "Moti.on: aplicar LoopOut"
  },
  "undo.ae.expression.smooth": {
    "en-US": "Moti.on: apply Smooth",
    "pt-BR": "Moti.on: aplicar Smooth"
  },
  "undo.ae.expression.wiggle": {
    "en-US": "Moti.on: apply Wiggle",
    "pt-BR": "Moti.on: aplicar Wiggle"
  },
  "undo.ae.expression.flicker": {
    "en-US": "Moti.on: apply Flicker",
    "pt-BR": "Moti.on: aplicar Flicker"
  },
  "undo.ae.text.box": {
    "en-US": "Moti.on: create text box",
    "pt-BR": "Moti.on: criar caixa de texto"
  },
  "undo.ae.layer.parent": {
    "en-US": "Moti.on: parent layers",
    "pt-BR": "Moti.on: parentear camadas"
  },
  "undo.ae.layer.createNull": {
    "en-US": "Moti.on: create null",
    "pt-BR": "Moti.on: criar null"
  },
  "undo.ae.layer.flip": {
    "en-US": "Moti.on: flip layers",
    "pt-BR": "Moti.on: espelhar camadas"
  },
  "undo.ae.anchor.align": {
    "en-US": "Moti.on: align anchor point",
    "pt-BR": "Moti.on: alinhar ponto de ancoragem"
  },
  "undo.ae.layer.rename": {
    "en-US": "Moti.on: rename layers",
    "pt-BR": "Moti.on: renomear camadas"
  },
  "undo.ae.layer.reverseOrder": {
    "en-US": "Moti.on: reverse layer order",
    "pt-BR": "Moti.on: inverter ordem das camadas"
  },
  "undo.ae.keys.cut": {
    "en-US": "Moti.on: cut keyframes",
    "pt-BR": "Moti.on: cortar keyframes"
  },
  "undo.ae.keys.delay": {
    "en-US": "Moti.on: delay animation",
    "pt-BR": "Moti.on: atrasar anima\u00e7\u00e3o"
  },
  "undo.ae.keys.ease.apply": {
    "en-US": "Moti.on: apply ease",
    "pt-BR": "Moti.on: aplicar suavização"
  },
  "undo.ae.keys.reverse": {
    "en-US": "Moti.on: reverse keyframes",
    "pt-BR": "Moti.on: inverter keyframes"
  },
  "undo.ae.keys.reverse-values": {
    "en-US": "Moti.on: reverse keyframe values",
    "pt-BR": "Moti.on: inverter valores dos keyframes"
  },
  "undo.ae.style.neon": {
    "en-US": "Moti.on: apply neon style",
    "pt-BR": "Moti.on: aplicar estilo neon"
  },
  "undo.ae.keys.send-to-edge": {
    "en-US": "Moti.on: send keyframes to edge",
    "pt-BR": "Moti.on: enviar keyframes para a borda"
  },
  "undo.ae.keys.clone": {
    "en-US": "Moti.on: duplicate keyframes",
    "pt-BR": "Moti.on: duplicar keyframes"
  },
  "undo.ae.time.controller": {
    "en-US": "Moti.on: apply time controller",
    "pt-BR": "Moti.on: aplicar controlador de tempo"
  },
  "undo.ae.animate.kinetic": {
    "en-US": "Moti.on: apply kinetic animation",
    "pt-BR": "Moti.on: aplicar animação kinetic"
  },
  "undo.ae.shape.break": {
    "en-US": "Moti.on: break shape",
    "pt-BR": "Moti.on: separar formas"
  },
  "undo.ae.rig.effector": {
    "en-US": "Moti.on: apply effector",
    "pt-BR": "Moti.on: aplicar effector"
  },
  "undo.ae.camera.transition": {
    "en-US": "Moti.on: camera transition",
    "pt-BR": "Moti.on: transição de câmera"
  },
  "undo.ae.3d.cylinder": {
    "en-US": "Moti.on: build cylinder",
    "pt-BR": "Moti.on: montar cilindro"
  },
  "undo.ae.3d.cube": {
    "en-US": "Moti.on: build cube",
    "pt-BR": "Moti.on: montar cubo"
  },
  "undo.ae.effect.wave": {
    "en-US": "Moti.on: apply wave",
    "pt-BR": "Moti.on: aplicar onda"
  },
  "undo.ae.effect.tile": {
    "en-US": "Moti.on: tile layers",
    "pt-BR": "Moti.on: repetir camadas"
  },
  "undo.ae.effect.glitch": {
    "en-US": "Moti.on: apply glitch",
    "pt-BR": "Moti.on: aplicar glitch"
  },
  "undo.ae.animate.parallaxQuick": {
    "en-US": "Moti.on: create parallax rig",
    "pt-BR": "Moti.on: criar rig de parallax"
  },
  "undo.ae.3d.lookAt": {
    "en-US": "Moti.on: look at target",
    "pt-BR": "Moti.on: encarar o alvo"
  },
  "undo.ae.3d.orbit": {
    "en-US": "Moti.on: create orbit",
    "pt-BR": "Moti.on: criar \u00f3rbita"
  },
  "undo.ae.effect.echo": {
    "en-US": "Moti.on: apply echo",
    "pt-BR": "Moti.on: aplicar eco"
  },
  "undo.ae.comp.fastEdit": {
    "en-US": "Moti.on: edit composition",
    "pt-BR": "Moti.on: editar composi\u00e7\u00e3o"
  },
  "undo.ae.shape.library": {
    "en-US": "Moti.on: create shape",
    "pt-BR": "Moti.on: criar forma"
  },
  "undo.ae.shape.trimPath": {
    "en-US": "Moti.on: trim paths",
    "pt-BR": "Moti.on: cortar tra\u00e7ados"
  },
  "undo.ae.animate.inertial": {
    "en-US": "Moti.on: apply inertia",
    "pt-BR": "Moti.on: aplicar in\u00e9rcia"
  },
  "undo.ae.animate.jump": {
    "en-US": "Moti.on: create jump",
    "pt-BR": "Moti.on: criar salto"
  },
  "undo.ae.keys.paste": {
    "en-US": "Moti.on: paste keyframes",
    "pt-BR": "Moti.on: colar keyframes"
  },
  "undo.ae.time.markerLoop": {
    "en-US": "Moti.on: apply marker loop",
    "pt-BR": "Moti.on: aplicar loop por marcadores"
  },
  "undo.ae.vector.aiToVector": {
    "en-US": "Moti.on: convert vector layer",
    "pt-BR": "Moti.on: converter camada de vetor"
  },
  "undo.ae.parallax.autoFocus": {
    "en-US": "Moti.on: auto-focus parallax",
    "pt-BR": "Moti.on: focar parallax"
  },
  "undo.ae.parallax.wiggle": {
    "en-US": "Moti.on: wiggle parallax",
    "pt-BR": "Moti.on: agitar parallax"
  },
  "undo.ae.parallax.zoom": {
    "en-US": "Moti.on: zoom parallax",
    "pt-BR": "Moti.on: zoom no parallax"
  },
  "undo.ae.parallax.bake": {
    "en-US": "Moti.on: bake parallax",
    "pt-BR": "Moti.on: bake parallax"
  },
  "undo.ae.vector.textToVector": {
    "en-US": "Moti.on: apply text to vector",
    "pt-BR": "Moti.on: aplicar texto para vetor"
  },
  "undo.ae.effect.particles": {
    "en-US": "Moti.on: apply particles",
    "pt-BR": "Moti.on: aplicar partículas"
  },
  "undo.ae.asset.texture": {
    "en-US": "Moti.on: apply texture",
    "pt-BR": "Moti.on: aplicar textura"
  },
  "undo.ae.project.clean": {
    "en-US": "Moti.on: clean project",
    "pt-BR": "Moti.on: limpar projeto"
  }
} as const;

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Converte formatos reais dos hosts (`pt_BR`, `pt-br`, `pt`) para a chave
 * canônica do catálogo. O CEP 12 foi medido devolvendo underscore, enquanto o
 * catálogo usa BCP 47 com hífen; exigir igualdade byte a byte faria o menu Undo
 * cair silenciosamente para inglês numa interface em português.
 */
function normalizeSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (normalized.length === 0) return null;

  for (const locale of SUPPORTED_LOCALES) {
    if (locale.toLowerCase() === normalized) return locale;
  }

  const language = normalized.split("-")[0];
  for (const locale of SUPPORTED_LOCALES) {
    if (locale.toLowerCase().split("-")[0] === language) return locale;
  }

  return null;
}

/**
 * Resolve o rótulo. Locale desconhecido cai no padrão em vez de devolver a
 * chave: mostrar `undo.ae.demo.createComposition` no menu do After Effects seria
 * pior do que mostrar o texto em inglês.
 */
export function resolveUndoLabel(key: string, locale?: string): string {
  const entry = UNDO_LABELS[key];
  if (!entry) return "";
  const resolved = normalizeSupportedLocale(locale) ?? DEFAULT_LOCALE;
  return entry[resolved];
}
