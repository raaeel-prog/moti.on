/**
 * Tradução do painel — CHMS-008.
 *
 * O host informa o idioma da própria interface; o painel segue esse idioma, e
 * não o do sistema operacional. Alguém que roda o After Effects em inglês dentro
 * de um Windows em português espera um painel em inglês, encaixado no resto da
 * aplicação.
 *
 * `normalizeLocale` existe porque o formato varia: o CEP do After Effects 26.3
 * devolve `appUILocale = "pt_BR"`, com underscore — medido em host real, não
 * suposto. Uma comparação direta com `"pt-BR"` cairia no fallback em inglês para
 * todo usuário brasileiro, e de um jeito que só apareceria na máquina dele.
 */
import { CATALOGS, FALLBACK_LOCALE, type MessageKey } from "./locales.js";

/**
 * Idiomas que escrevem decimal com vírgula.
 *
 * Afeta só a exibição. A representação numérica interna nunca muda: formatar é a
 * última coisa que acontece antes de o texto entrar no DOM.
 */
const DECIMAL_COMMA_LANGUAGES = new Set(["pt", "es", "fr", "de", "it", "nl", "pl", "ru", "tr"]);

export type MessageParams = Record<string, string | number>;

export interface I18n {
  locale(): string;
  available(): string[];
  setLocale(next: string | undefined): string;
  has(key: string): boolean;
  t(key: MessageKey, params?: MessageParams): string;
  /** Formata para exibição, sem alterar o valor numérico de origem. */
  formatNumber(value: number | null | undefined, decimals?: number): string;
}

/**
 * Converte o que o host informou numa chave de catálogo.
 *
 * Aceita `pt_BR`, `pt-BR` e `pt`. Devolve `null` — e não o fallback — quando não
 * há catálogo: quem chama decide o que fazer, e o teste consegue distinguir
 * "não suportado" de "caiu no inglês".
 */
export function normalizeLocale(raw: string | undefined | null): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.replace("_", "-");
  if (CATALOGS[value]) {
    return value;
  }

  const language = value.split("-")[0]?.toLowerCase() ?? "";
  for (const key of Object.keys(CATALOGS)) {
    if (key.split("-")[0]?.toLowerCase() === language) {
      return key;
    }
  }

  return null;
}

export function interpolate(template: string, params?: MessageParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export interface I18nOptions {
  locale?: string | undefined;
}

export function createI18n(options: I18nOptions = {}): I18n {
  let current = normalizeLocale(options.locale) ?? FALLBACK_LOCALE;

  function lookup(key: string): string | null {
    const catalog = CATALOGS[current];
    const fallback = CATALOGS[FALLBACK_LOCALE];

    return (
      (catalog as Record<string, string> | undefined)?.[key] ??
      (fallback as Record<string, string> | undefined)?.[key] ??
      null
    );
  }

  return {
    locale: () => current,
    available: () => Object.keys(CATALOGS).sort(),

    setLocale(next) {
      current = normalizeLocale(next) ?? FALLBACK_LOCALE;
      return current;
    },

    has: (key) => lookup(key) !== null,

    t(key, params) {
      // Chave ausente devolve a própria chave. É feio de propósito: aparece no
      // teste e na revisão, enquanto uma string vazia passaria despercebida até
      // um usuário encontrar um rótulo em branco.
      const template = lookup(key);
      return template === null ? key : interpolate(template, params);
    },

    formatNumber(value, decimals) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return this.t("value.none");
      }

      const text = decimals === undefined ? String(value) : value.toFixed(decimals);
      const language = current.split("-")[0]?.toLowerCase() ?? "";

      return DECIMAL_COMMA_LANGUAGES.has(language) ? text.replace(".", ",") : text;
    }
  };
}
