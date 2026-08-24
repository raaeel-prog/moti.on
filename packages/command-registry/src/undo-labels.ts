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
  }
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve o rótulo. Locale desconhecido cai no padrão em vez de devolver a
 * chave: mostrar `undo.ae.demo.createComposition` no menu do After Effects seria
 * pior do que mostrar o texto em inglês.
 */
export function resolveUndoLabel(key: string, locale?: string): string {
  const entry = UNDO_LABELS[key];
  if (!entry) return "";
  const resolved = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return entry[resolved];
}
