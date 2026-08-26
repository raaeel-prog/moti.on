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
  }
};

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
