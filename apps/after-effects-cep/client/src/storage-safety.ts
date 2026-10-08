/**
 * Gravação protegida das bibliotecas pessoais guardadas no localStorage.
 *
 * A leitura dessas bibliotecas descarta o que não reconhece: um registro
 * corrompido vira lista vazia, e um item inválido some da lista. Sem proteção,
 * o próximo "Salvar" gravaria só o que sobrou e apagaria de vez o resto.
 *
 * Antes de cada gravação:
 * - o conteúdo anterior vai para `<chave>.bak` (a versão imediatamente anterior);
 * - se o conteúdo anterior não é legível, ele vai também para
 *   `<chave>.unreadable`, que nunca é sobrescrito por uma gravação normal. Se nem
 *   essa cópia couber, a gravação é recusada e o original fica intacto.
 *
 * O formato de cada biblioteca não muda, para que builds anteriores continuem
 * lendo o mesmo registro.
 */
export type ProtectedStorage = Pick<Storage, "getItem" | "setItem">;

export const backupKey = (key: string): string => `${key}.bak`;
export const unreadableKey = (key: string): string => `${key}.unreadable`;

export function protectedWrite(
  storage: ProtectedStorage | undefined,
  key: string,
  serialized: string,
  readable: (raw: string) => boolean
): boolean {
  if (!storage) return false;
  try {
    const previous = storage.getItem(key);
    if (previous !== null && previous !== serialized) {
      if (!readable(previous) && storage.getItem(unreadableKey(key)) === null) {
        storage.setItem(unreadableKey(key), previous);
      }
      storage.setItem(backupKey(key), previous);
    }
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/** `true` quando o texto é JSON e passa no teste de forma do chamador. */
export function parsesAs(raw: string, shape: (value: unknown) => boolean): boolean {
  try { return shape(JSON.parse(raw)); } catch { return false; }
}
