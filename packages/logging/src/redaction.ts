/**
 * Redaction de diagnóstico.
 *
 * A §25 do master spec proíbe registrar nome de projeto, caminho de mídia, texto
 * de legenda e credencial. A §26 exige que o log seja exportável pelo usuário
 * como bundle de suporte — ou seja, o conteúdo sai da máquina dele e chega até
 * quem dá suporte.
 *
 * As duas exigências juntas decidem **onde** a redaction acontece: na escrita, e
 * não na exportação. Se o valor cru fosse guardado e limpo só na hora de
 * exportar, ele existiria em memória durante toda a sessão, apareceria em
 * qualquer dump e dependeria de todo caminho de saída futuro lembrar de limpar.
 * Redigindo na escrita, o dado sensível nunca chega à estrutura.
 *
 * O que é preservado de propósito: o **tamanho** do valor redigido. "não salvo"
 * e "Campanha Verão 2026" são diagnósticos diferentes, e o tamanho distingue os
 * dois sem revelar nada.
 */

/** Marcador único, para que uma busca no bundle mostre tudo que foi redigido. */
export const PLACEHOLDER = "«redigido»";

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

/**
 * Nomes de campo que carregam conteúdo criativo ou identificável.
 *
 * Comparados em forma normalizada — minúsculas, sem `_` nem `-` — porque o mesmo
 * campo aparece como `projectName`, `project_name` e `project-name` conforme a
 * camada, e uma lista que só previsse uma das grafias deixaria as outras passar.
 */
const SENSITIVE_KEYS: readonly string[] = [
  "projectname", "projectpath", "path", "fspath", "filepath", "file",
  "activeitemname", "compositionname", "compname", "layername", "sequencename",
  "itemname", "markername", "text", "sourcetext", "transcript", "caption",
  "query", "search", "prompt",
  "email", "user", "username", "account",
  "token", "accesstoken", "refreshtoken", "apikey", "authorization", "secret",
  "password", "license", "licensekey", "signature", "clientsecret", "privatekey",
  "cookie", "setcookie", "session", "sessionid", "csrf", "csrftoken",
  "projectfingerprint", "activeitemid"
];

/**
 * Headers de autenticação e cookies são redigidos por inteiro.
 *
 * Tentar capturar apenas o primeiro "valor" é inseguro: em
 * `Authorization: Bearer segredo`, `Bearer` seria confundido com a credencial e
 * o segredo real sobreviveria depois do espaço. Cookies também carregam vários
 * pares e atributos separados por `;`; preservar qualquer fragmento não traz
 * valor diagnóstico que compense o risco.
 */
const AUTHORIZATION_HEADER = /\b(proxy-authorization|authorization)\s*[:=]\s*[^\r\n]*/gi;
const COOKIE_HEADER = /\b(set-cookie|cookie)\s*[:=]\s*[^\r\n]*/gi;
const BEARER_CREDENTIAL = /\bbearer\s+("[^"]*"|'[^']*'|[^\s,;)}]+)/gi;
const SECRET_ASSIGNMENT =
  /\b(token|secret|password|passwd|api[_-]?key|client[_-]?secret|private[_-]?key|session(?:[_-]?id)?|csrf(?:[_-]?token)?|license)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;)}]+)/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Caminhos entre aspas podem terminar em diretório e conter espaços. Mantemos
 * as aspas para o restante da mensagem continuar legível.
 */
const QUOTED_PATH = /(["'])((?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|Volumes|private|var|tmp)\/)[^"'<>|\r\n]+)\1/g;

/**
 * Caminhos não delimitados com espaço são reconhecidos até uma extensão.
 *
 * Sem estas três regras, a expressão simples abaixo parava no primeiro espaço:
 * `C:\\Users\\Ana Silva\\Cliente X\\cena final.aep` virava uma mistura de
 * placeholder com metade do caminho privado ainda visível. Exigir extensão no
 * caso não delimitado evita consumir arbitrariamente o restante de uma frase.
 */
const WINDOWS_FILE_PATH =
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^"'<>|\r\n]*?\.[A-Za-z0-9]{1,12}(?=$|[\s"'<>|,;:)}\]])/g;
const UNC_FILE_PATH =
  /\\\\[^"'<>|\r\n]*?\.[A-Za-z0-9]{1,12}(?=$|[\s"'<>|,;:)}\]])/g;
const POSIX_FILE_PATH =
  /\/(?:Users|home|Volumes|private|var|tmp)\/[^"'<>|\r\n]*?\.[A-Za-z0-9]{1,12}(?=$|[\s"'<>|,;:)}\]])/g;
/**
 * A letra de unidade não pode vir logo depois de outra letra ou dígito.
 *
 * Sem o lookbehind, o `s:/` de `https://` casa como caminho do Windows e toda
 * URL vira `«caminho»`. Lookbehind exige Chromium 62+; o CEP 12 embute o
 * Chromium 99, verificado em host real.
 *
 * Estes fallbacks consomem o restante do trecho quando não há uma extensão que
 * delimite o caminho. Um diretório sem aspas e com espaços é ambíguo; nesse
 * caso, perder parte da mensagem é preferível a deixar metade do caminho vazar.
 */
const WINDOWS_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/][^"'<>|,;\r\n]+/g;
const UNC_PATH = /\\\\[^"'<>|,;\r\n]+/g;
const POSIX_PATH = /\/(?:Users|home|Volumes|private|var|tmp)\/[^"'<>|,;\r\n]+/g;
/** Sequência opaca longa: token, hash ou id de sessão. */
const OPAQUE_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;

function basename(value: string): string {
  const trimmed = value.replace(/[\\/]+$/, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separator === -1 ? trimmed : trimmed.slice(separator + 1);
}

/**
 * Reduz um caminho à extensão.
 *
 * A extensão fica porque é diagnóstico real — `.aep` e `.mp4` levam a caminhos de
 * investigação diferentes — e não identifica ninguém. O nome do arquivo sai
 * junto com o diretório: é ele que costuma carregar nome de cliente.
 */
function redactPath(value: string): string {
  const name = basename(value);
  const dot = name.lastIndexOf(".");
  const candidate = dot > 0 ? name.slice(dot) : "";
  const extension = /^\.[A-Za-z0-9]{1,12}$/.test(candidate) ? candidate : "";
  return `«caminho»/${PLACEHOLDER}${extension}`;
}

/**
 * Mantém somente esquema, host e porta.
 *
 * Caminhos de CDN e storage frequentemente carregam nome de cliente, projeto ou
 * arquivo (`/Cliente X/cena final.mov`). Query e fragmento também podem conter
 * assinatura. Nenhum desses trechos é necessário para identificar o provedor.
 */
function redactUrl(value: string): string {
  const match = /^(https?:\/\/)(?:[^@/?#]+@)?([^/?#]+)/i.exec(value);
  if (!match) {
    return PLACEHOLDER;
  }

  return `${match[1]}${match[2]}/${PLACEHOLDER}`;
}

function redactQuotedPath(_match: string, quote: string, value: string): string {
  return `${quote}${redactPath(value)}${quote}`;
}

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.includes(normalized);
}

/**
 * Aplica as regras de texto.
 *
 * A ordem importa: headers de autenticação/cookie antes das regras genéricas,
 * URL antes de caminho (senão o `s:/` viraria caminho), e token opaco por
 * último, para não engolir pedaço de algo que outra regra reconheceria melhor.
 */
export function redactText(value: string): string {
  if (value === "") {
    return value;
  }

  return value
    .replace(AUTHORIZATION_HEADER, (_match, name: string) => `${name}=${PLACEHOLDER}`)
    .replace(COOKIE_HEADER, (_match, name: string) => `${name}=${PLACEHOLDER}`)
    .replace(BEARER_CREDENTIAL, `Bearer ${PLACEHOLDER}`)
    .replace(SECRET_ASSIGNMENT, (_match, name: string) => `${name}=${PLACEHOLDER}`)
    .replace(URL_PATTERN, redactUrl)
    .replace(EMAIL_PATTERN, PLACEHOLDER)
    .replace(QUOTED_PATH, redactQuotedPath)
    .replace(UNC_FILE_PATH, redactPath)
    .replace(WINDOWS_FILE_PATH, redactPath)
    .replace(POSIX_FILE_PATH, redactPath)
    .replace(UNC_PATH, redactPath)
    .replace(WINDOWS_PATH, redactPath)
    .replace(POSIX_PATH, redactPath)
    .replace(OPAQUE_TOKEN, PLACEHOLDER);
}

function describeSensitive(value: unknown): string {
  return typeof value === "string"
    ? `${PLACEHOLDER} (${value.length} caracteres)`
    : PLACEHOLDER;
}

function walk(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // Profundidade e tamanho são limitados porque o log é um buffer em memória
  // dentro do painel: uma estrutura cíclica ou um array de milhares de camadas
  // travaria o host, que é o pior lugar possível para descobrir isso.
  if (depth > MAX_DEPTH) {
    return "«profundidade excedida»";
  }

  if (typeof value === "string") {
    return redactText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => walk(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`«+${value.length - MAX_ARRAY_ITEMS} itens»`);
    }
    return items;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? describeSensitive(item) : walk(item, depth + 1);
    }
    return result;
  }

  // Função, símbolo ou bigint: nada disso deveria chegar num log estruturado, e
  // deixar passar o valor cru seria pior do que perder a informação.
  return PLACEHOLDER;
}

export function redactValue(value: unknown): unknown {
  return walk(value, 0);
}
