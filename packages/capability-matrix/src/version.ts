/**
 * Comparação de versão de host.
 *
 * Existe por causa de uma frase da §9 do master spec: *"Nenhuma feature deve
 * depender apenas de `parseFloat(hostVersion)`."*
 *
 * O problema com `parseFloat` não é estilo. `parseFloat("25.10")` devolve
 * `25.1`, e `parseFloat("25.9")` devolve `25.9` — então `25.10 < 25.9`, e um
 * gate escrito assim **bloqueia a versão mais nova** e libera a mais velha. O
 * erro não aparece em teste nenhum enquanto os números menores não passarem de
 * 9, e aparece meses depois na máquina de um usuário que atualizou o aplicativo.
 *
 * E mesmo correta, versão só serve para rotular o tier de suporte e decidir se
 * vale tentar sondar. Nunca para liberar uma feature: quem libera é a presença
 * do símbolo.
 */

export interface HostVersion {
  major: number;
  minor: number;
  patch: number;
  /** A string original, para exibir e registrar sem reformatar. */
  raw: string;
}

/**
 * Extrai `major.minor.patch` de uma string de versão de host.
 *
 * Os hosts Adobe não têm um formato único: o After Effects reporta coisas como
 * `"25.0x123"`, o Premiere reporta `"25.6.0"`, e há builds com sufixo. A regra
 * aqui é ler os números iniciais e **ignorar o resto**, em vez de tentar
 * entender cada variação.
 *
 * Devolve `null` quando não há número nenhum a ler. `null` é a resposta honesta
 * para "não sei", e o chamador precisa decidir o que fazer com isso — que é
 * diferente de receber `0.0.0` e tratar como uma versão muito antiga.
 */
export function parseHostVersion(raw: unknown): HostVersion | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(trimmed);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    raw: trimmed
  };
}

/**
 * Compara duas versões: `-1` se `a < b`, `0` se iguais, `1` se `a > b`.
 *
 * Componente a componente, como número. É isso que faz `25.10` ser maior que
 * `25.9`.
 */
export function compareVersions(a: HostVersion, b: HostVersion): -1 | 0 | 1 {
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] < b[key]) return -1;
    if (a[key] > b[key]) return 1;
  }
  return 0;
}

/** `a >= b`? */
export function isAtLeast(a: HostVersion, b: string): boolean {
  const target = parseHostVersion(b);
  if (!target) throw new Error(`Versão de referência inválida: ${b}`);
  return compareVersions(a, target) >= 0;
}

/** `a < b`? */
export function isBelow(a: HostVersion, b: string): boolean {
  return !isAtLeast(a, b);
}

/** Formata para exibição, sem inventar precisão que a origem não tinha. */
export function formatVersion(version: HostVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
