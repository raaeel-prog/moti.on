import { RigMetadataError, fail } from "./errors.js";
import { encodeUtf8 } from "./utf8.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const MAX_DEPTH = 64;
const MAX_NODES = 100_000;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

interface VisitState {
  readonly ancestors: WeakSet<object>;
  nodes: number;
}

function invalid(message: string, path: string): never {
  return fail("INVALID_JSON_VALUE", message, { path });
}

function quote(value: string, path: string): string {
  try {
    encodeUtf8(value);
  } catch (error) {
    if (error instanceof RigMetadataError) {
      invalid("A string JSON contém Unicode inválido.", path);
    }
    throw error;
  }
  return JSON.stringify(value);
}

function serialize(value: unknown, path: string, depth: number, state: VisitState): string {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    invalid("O valor JSON excede o limite estrutural de segurança.", path);
  }
  if (depth > MAX_DEPTH) {
    invalid("O valor JSON excede a profundidade máxima de segurança.", path);
  }

  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return quote(value, path);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalid("JSON canônico não aceita NaN ou infinito.", path);
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    invalid("O valor não pertence ao subconjunto JSON suportado.", path);
  }

  if (state.ancestors.has(value)) {
    invalid("JSON canônico não aceita ciclos.", path);
  }
  state.ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          invalid("JSON canônico não aceita arrays esparsos.", `${path}[${index}]`);
        }
        parts.push(serialize(value[index], `${path}[${index}]`, depth + 1, state));
      }
      if (Reflect.ownKeys(value).some((key) => typeof key === "symbol"
        || (key !== "length" && !/^\d+$/.test(key)))) {
        invalid("Arrays JSON não podem carregar propriedades adicionais.", path);
      }
      return `[${parts.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid("Somente objetos JSON simples são aceitos.", path);
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) {
      invalid("Objetos JSON não podem carregar chaves Symbol.", path);
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = ownKeys.map((key) => String(key)).sort();
    const parts: string[] = [];
    for (const key of keys) {
      if (DANGEROUS_KEYS.has(key)) {
        invalid("A chave JSON é reservada por segurança.", `${path}.${key}`);
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable
        || descriptor.get !== undefined || descriptor.set !== undefined) {
        invalid("Objetos JSON devem conter apenas propriedades enumeráveis de dados.", `${path}.${key}`);
      }
      parts.push(`${quote(key, `${path}.${key}`)}:${serialize(
        descriptor.value,
        `${path}.${key}`,
        depth + 1,
        state
      )}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    state.ancestors.delete(value);
  }
}

/** Serializa o subconjunto JSON seguro com chaves ordenadas recursivamente. */
export function canonicalStringify(value: unknown): string {
  return serialize(value, "$", 0, { ancestors: new WeakSet<object>(), nodes: 0 });
}

export function parseCanonicalJson(value: string): JsonValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    fail("MALFORMED_BLOCK", "O payload decodificado não é JSON válido.");
  }

  let canonical: string;
  try {
    canonical = canonicalStringify(parsed);
  } catch (error) {
    if (error instanceof RigMetadataError && error.code === "INVALID_JSON_VALUE") {
      fail("MALFORMED_BLOCK", "O payload contém um valor JSON inseguro.");
    }
    throw error;
  }
  if (canonical !== value) {
    fail("NON_CANONICAL_JSON", "O payload JSON não está na representação canônica.");
  }
  return parsed as JsonValue;
}
