export const EXPRESSION_LIBRARY_ERROR_CODES = [
  "UNKNOWN_TEMPLATE_ID",
  "NON_FINITE_NUMBER",
  "INVALID_TOKEN_VALUE",
  "INVALID_RENDER_REQUEST",
  "INVALID_TOKEN_SHAPE",
  "UNSUPPORTED_EXPRESSION_VERSION",
  "MALFORMED_MANAGED_EXPRESSION",
  "INVALID_PROPERTY_STATE",
  "INVALID_CONFLICT_MODE",
  "ADJUST_REQUIRES_MANAGED_STATE",
  "MANAGED_TEMPLATE_MISMATCH",
  "INVALID_MANAGED_STATE",
  "INVALID_PLAN_REQUEST"
] as const;

export type ExpressionLibraryErrorCode = (typeof EXPRESSION_LIBRARY_ERROR_CODES)[number];

export class ExpressionLibraryError extends Error {
  readonly code: ExpressionLibraryErrorCode;
  readonly details: Readonly<Record<string, unknown>> | null;

  constructor(
    code: ExpressionLibraryErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> | null = null
  ) {
    super(message);
    this.name = "ExpressionLibraryError";
    this.code = code;
    this.details = details;
  }
}

function fail(
  code: ExpressionLibraryErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> | null = null
): never {
  throw new ExpressionLibraryError(code, message, details);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

type PlainRecord = Record<string, unknown>;

function readDataRecord(
  value: unknown,
  code: ExpressionLibraryErrorCode,
  message: string
): PlainRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, message);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor)) fail(code, message);
  }
  return value as PlainRecord;
}

function assertKeys(
  record: PlainRecord,
  required: readonly string[],
  optional: readonly string[],
  code: ExpressionLibraryErrorCode,
  message: string
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(code, message, { field: key });
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) fail(code, message, { field: key });
  }
}

export type LoopOutType = "cycle" | "pingpong" | "offset" | "continue";

export interface LoopOutTokens {
  readonly type: LoopOutType;
  readonly numKeyframes: number;
  readonly duration: number;
  readonly useDuration: boolean;
}

export interface SmoothTokens {
  readonly widthSeconds: number;
  readonly samples: number;
  readonly referenceTime: "current" | number;
}

/**
 * Tokens do wiggle gerenciado.
 *
 * `seed` existe porque a skill de rigs exige resultado reproduzível: sem
 * `seedRandom`, a semente do wiggle deriva do identificador da camada, então
 * duas camadas com os mesmos parâmetros se movem diferente e o mesmo projeto
 * reaberto não é comparável. O registro está em
 * `docs/research/after-effects-wiggle-and-seed.md`.
 */
export interface WiggleTokens {
  readonly frequency: number;
  readonly amplitude: number;
  readonly octaves: number;
  readonly amplitudeMultiplier: number;
  readonly seed: number;
}

/**
 * Tokens do flicker gerenciado.
 *
 * `minFactor`/`maxFactor` são multiplicadores do próprio valor da propriedade,
 * e não valores absolutos. A razão está em
 * `docs/research/after-effects-wiggle-and-seed.md`: `random(min, max)` com dois
 * números devolve um escalar, que quebraria qualquer propriedade não 1D.
 * Multiplicar `value` carrega a dimensionalidade da propriedade e ainda preserva
 * a animação existente em vez de descartá-la.
 */
export interface FlickerTokens {
  readonly rate: number;
  readonly minFactor: number;
  readonly maxFactor: number;
  readonly seed: number;
}

/**
 * Tokens da caixa responsiva atras de texto.
 *
 * Sao dois templates irmaos — tamanho e posicao — que compartilham os mesmos
 * tokens, porque leem o mesmo retangulo de origem e precisam concordar sobre o
 * padding. Separa-los em dois conjuntos deixaria possivel gerar uma caixa cujo
 * centro nao corresponde ao proprio tamanho.
 */
export interface TextBoxTokens {
  readonly paddingX: number;
  readonly paddingY: number;
}

export interface ExpressionTemplate {
  readonly id:
    | "ae.expression.loopout"
    | "ae.expression.smooth"
    | "ae.expression.wiggle"
    | "ae.expression.flicker"
    | "ae.textbox.size"
    | "ae.textbox.position";
  readonly version: 1;
}

const TEMPLATES: readonly ExpressionTemplate[] = deepFreeze([
  { id: "ae.expression.loopout", version: 1 },
  { id: "ae.expression.smooth", version: 1 },
  { id: "ae.expression.wiggle", version: 1 },
  { id: "ae.expression.flicker", version: 1 },
  { id: "ae.textbox.size", version: 1 },
  { id: "ae.textbox.position", version: 1 }
]);

export const EXPRESSION_TEMPLATE_REGISTRY_V1 = deepFreeze({
  schemaVersion: 1 as const,
  templates: TEMPLATES
});

export const CONFLICT_MODES = deepFreeze(["skip", "replace-with-backup"] as const);
export type ExpressionConflictMode = (typeof CONFLICT_MODES)[number];

export function listExpressionTemplates(): readonly ExpressionTemplate[] {
  return EXPRESSION_TEMPLATE_REGISTRY_V1.templates;
}

export function getExpressionTemplate(id: string): ExpressionTemplate {
  const found = TEMPLATES.find((template) => template.id === id);
  if (!found) fail("UNKNOWN_TEMPLATE_ID", "Unknown expression template id.", { id });
  return found;
}

export function canonicalExpressionNumber(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("NON_FINITE_NUMBER", "Expression numbers must be finite.");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

/** Literal completo, ASCII e deterministico para futuros tokens textuais. */
export function escapeExpressionString(value: string): string {
  if (typeof value !== "string" || value.length > 65_535) {
    fail("INVALID_TOKEN_VALUE", "Expression string must be bounded text.");
  }
  let escaped = '"';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22) escaped += '\\"';
    else if (code === 0x5c) escaped += "\\\\";
    else if (code === 0x08) escaped += "\\b";
    else if (code === 0x09) escaped += "\\t";
    else if (code === 0x0a) escaped += "\\n";
    else if (code === 0x0c) escaped += "\\f";
    else if (code === 0x0d) escaped += "\\r";
    else if (code < 0x20 || code > 0x7e) escaped += `\\u${code.toString(16).padStart(4, "0")}`;
    else escaped += value[index];
  }
  return escaped + '"';
}

export const escapeExpressionNumber = canonicalExpressionNumber;

function readLoopOutTokens(value: unknown): LoopOutTokens {
  const record = readDataRecord(value, "INVALID_TOKEN_SHAPE", "Invalid LoopOut token record.");
  assertKeys(
    record,
    ["type", "numKeyframes", "duration", "useDuration"],
    [],
    "INVALID_TOKEN_SHAPE",
    "Invalid LoopOut token record."
  );
  const type = record.type;
  if (type !== "cycle" && type !== "pingpong" && type !== "offset" && type !== "continue") {
    fail("INVALID_TOKEN_VALUE", "Invalid LoopOut type.", { field: "type" });
  }
  const numKeyframes = record.numKeyframes;
  if (
    typeof numKeyframes !== "number" ||
    !Number.isSafeInteger(numKeyframes) ||
    numKeyframes < 0 ||
    numKeyframes > 1000
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid LoopOut keyframe count.", { field: "numKeyframes" });
  }
  const duration = record.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > 3600) {
    fail("INVALID_TOKEN_VALUE", "Invalid LoopOut duration.", { field: "duration" });
  }
  if (typeof record.useDuration !== "boolean") {
    fail("INVALID_TOKEN_VALUE", "Invalid LoopOut duration mode.", { field: "useDuration" });
  }

  if (type === "continue") {
    return deepFreeze({ type, numKeyframes: 0, duration: 0, useDuration: false });
  }
  if (record.useDuration) {
    return deepFreeze({ type, numKeyframes: 0, duration: Object.is(duration, -0) ? 0 : duration, useDuration: true });
  }
  return deepFreeze({ type, numKeyframes, duration: 0, useDuration: false });
}

function readSmoothTokens(value: unknown): SmoothTokens {
  const record = readDataRecord(value, "INVALID_TOKEN_SHAPE", "Invalid Smooth token record.");
  assertKeys(
    record,
    ["widthSeconds", "samples", "referenceTime"],
    [],
    "INVALID_TOKEN_SHAPE",
    "Invalid Smooth token record."
  );
  const widthSeconds = record.widthSeconds;
  if (
    typeof widthSeconds !== "number" ||
    !Number.isFinite(widthSeconds) ||
    widthSeconds <= 0 ||
    widthSeconds > 3600
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid Smooth width.", { field: "widthSeconds" });
  }
  const samples = record.samples;
  if (
    typeof samples !== "number" ||
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    samples > 101
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid Smooth sample count.", { field: "samples" });
  }
  const referenceTime = record.referenceTime;
  if (
    referenceTime !== "current" &&
    (typeof referenceTime !== "number" || !Number.isFinite(referenceTime) || referenceTime < 0)
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid Smooth reference time.", { field: "referenceTime" });
  }
  return deepFreeze({
    widthSeconds,
    samples,
    referenceTime: typeof referenceTime === "number" && Object.is(referenceTime, -0) ? 0 : referenceTime
  }) as SmoothTokens;
}

function readWiggleTokens(value: unknown): WiggleTokens {
  const record = readDataRecord(value, "INVALID_TOKEN_SHAPE", "Invalid Wiggle token record.");
  assertKeys(
    record,
    ["frequency", "amplitude", "octaves", "amplitudeMultiplier", "seed"],
    [],
    "INVALID_TOKEN_SHAPE",
    "Invalid Wiggle token record."
  );

  // As faixas nao sao da Adobe: a documentacao nao publica limites. Sao limites
  // de produto, escolhidos em docs/research/after-effects-wiggle-and-seed.md.
  const frequency = record.frequency;
  if (typeof frequency !== "number" || !Number.isFinite(frequency) || frequency <= 0 || frequency > 100) {
    fail("INVALID_TOKEN_VALUE", "Invalid Wiggle frequency.", { field: "frequency" });
  }
  const amplitude = record.amplitude;
  if (
    typeof amplitude !== "number" ||
    !Number.isFinite(amplitude) ||
    amplitude < 0 ||
    amplitude > 100_000
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid Wiggle amplitude.", { field: "amplitude" });
  }
  const octaves = record.octaves;
  if (typeof octaves !== "number" || !Number.isSafeInteger(octaves) || octaves < 1 || octaves > 10) {
    fail("INVALID_TOKEN_VALUE", "Invalid Wiggle octave count.", { field: "octaves" });
  }
  const amplitudeMultiplier = record.amplitudeMultiplier;
  if (
    typeof amplitudeMultiplier !== "number" ||
    !Number.isFinite(amplitudeMultiplier) ||
    amplitudeMultiplier < 0 ||
    amplitudeMultiplier > 10
  ) {
    fail("INVALID_TOKEN_VALUE", "Invalid Wiggle amplitude multiplier.", { field: "amplitudeMultiplier" });
  }
  const seed = record.seed;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 100_000) {
    fail("INVALID_TOKEN_VALUE", "Invalid Wiggle seed.", { field: "seed" });
  }

  return deepFreeze({
    frequency: Object.is(frequency, -0) ? 0 : frequency,
    amplitude: Object.is(amplitude, -0) ? 0 : amplitude,
    octaves,
    amplitudeMultiplier: Object.is(amplitudeMultiplier, -0) ? 0 : amplitudeMultiplier,
    seed
  });
}

function readFlickerTokens(value: unknown): FlickerTokens {
  const record = readDataRecord(value, "INVALID_TOKEN_SHAPE", "Invalid Flicker token record.");
  assertKeys(
    record,
    ["rate", "minFactor", "maxFactor", "seed"],
    [],
    "INVALID_TOKEN_SHAPE",
    "Invalid Flicker token record."
  );

  const rate = record.rate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 120) {
    fail("INVALID_TOKEN_VALUE", "Invalid Flicker rate.", { field: "rate" });
  }
  const minFactor = record.minFactor;
  if (typeof minFactor !== "number" || !Number.isFinite(minFactor) || minFactor < 0 || minFactor > 10) {
    fail("INVALID_TOKEN_VALUE", "Invalid Flicker minimum factor.", { field: "minFactor" });
  }
  const maxFactor = record.maxFactor;
  if (typeof maxFactor !== "number" || !Number.isFinite(maxFactor) || maxFactor < 0 || maxFactor > 10) {
    fail("INVALID_TOKEN_VALUE", "Invalid Flicker maximum factor.", { field: "maxFactor" });
  }
  // Invariante entre campos: random(1, 0) nao e erro no After Effects, mas
  // inverte a intencao declarada na interface. Recusar aqui evita uma expressao
  // que "funciona" fazendo o contrario do que o usuario pediu.
  if (minFactor > maxFactor) {
    fail("INVALID_TOKEN_VALUE", "Flicker minimum factor cannot exceed the maximum.", {
      field: "minFactor"
    });
  }
  const seed = record.seed;
  if (typeof seed !== "number" || !Number.isSafeInteger(seed) || seed < 0 || seed > 100_000) {
    fail("INVALID_TOKEN_VALUE", "Invalid Flicker seed.", { field: "seed" });
  }

  return deepFreeze({
    rate: Object.is(rate, -0) ? 0 : rate,
    minFactor: Object.is(minFactor, -0) ? 0 : minFactor,
    maxFactor: Object.is(maxFactor, -0) ? 0 : maxFactor,
    seed
  });
}

function readTextBoxTokens(value: unknown): TextBoxTokens {
  const record = readDataRecord(value, "INVALID_TOKEN_SHAPE", "Invalid Text Box token record.");
  assertKeys(
    record,
    ["paddingX", "paddingY"],
    [],
    "INVALID_TOKEN_SHAPE",
    "Invalid Text Box token record."
  );

  for (const field of ["paddingX", "paddingY"] as const) {
    const valor = record[field];
    // Padding negativo encolheria a caixa para dentro do texto, cortando-o. Se
    // isso vier a ser um recurso, precisa de nome proprio e de tela — nao de um
    // numero negativo passando despercebido.
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 10_000) {
      fail("INVALID_TOKEN_VALUE", "Invalid Text Box padding.", { field });
    }
  }

  return deepFreeze({
    paddingX: Object.is(record.paddingX, -0) ? 0 : (record.paddingX as number),
    paddingY: Object.is(record.paddingY, -0) ? 0 : (record.paddingY as number)
  });
}

export interface RenderExpressionRequest {
  readonly id: string;
  readonly tokens: unknown;
}

export interface RenderedExpression<
  TTokens = LoopOutTokens | SmoothTokens | WiggleTokens | FlickerTokens | TextBoxTokens
> {
  readonly id: ExpressionTemplate["id"];
  readonly version: 1;
  readonly tokens: TTokens;
  readonly source: string;
}

export function renderExpression(requestInput: RenderExpressionRequest): RenderedExpression {
  const request = readDataRecord(
    requestInput,
    "INVALID_RENDER_REQUEST",
    "Invalid expression render request."
  );
  assertKeys(
    request,
    ["id", "tokens"],
    [],
    "INVALID_RENDER_REQUEST",
    "Invalid expression render request."
  );
  if (typeof request.id !== "string") {
    fail("UNKNOWN_TEMPLATE_ID", "Unknown expression template id.");
  }
  const template = getExpressionTemplate(request.id);
  let tokens: LoopOutTokens | SmoothTokens | WiggleTokens | FlickerTokens | TextBoxTokens;
  let body: string;

  // A caixa aponta para o texto por `thisLayer.parent`, e nao por
  // `thisComp.layer("nome")`: o vinculo de parentesco ja e criado pelo proprio
  // rig, sobrevive a rename e a reordenacao, e nao existe um segundo
  // acoplamento para manter em sincronia.
  if (template.id === "ae.textbox.size") {
    tokens = readTextBoxTokens(request.tokens);
    // Texto vazio e texto so com espaco devolvem o retangulo zerado — medido no
    // host. Sem este colapso, apagar o texto deixaria um bloco de cor orfao do
    // tamanho do padding pousado na origem da camada.
    body =
      "var alvo = thisLayer.parent;\n" +
      "var r = alvo.sourceRectAtTime(time, false);\n" +
      "r.width === 0 && r.height === 0 ? [0, 0] : [r.width + " +
      `${canonicalExpressionNumber(tokens.paddingX)} * 2, r.height + ` +
      `${canonicalExpressionNumber(tokens.paddingY)} * 2];`;
  } else if (template.id === "ae.textbox.position") {
    tokens = readTextBoxTokens(request.tokens);
    // O centro e o do bounding box do texto, nao a origem da camada: e isso que
    // faz a caixa acompanhar alinhamento a esquerda, ao centro e a direita sem
    // nenhum input adicional.
    body =
      "var alvo = thisLayer.parent;\n" +
      "var r = alvo.sourceRectAtTime(time, false);\n" +
      "[r.left + r.width / 2, r.top + r.height / 2];";
  } else if (template.id === "ae.expression.flicker") {
    tokens = readFlickerTokens(request.tokens);
    // Multiplica `value` em vez de substituir: carrega a dimensionalidade da
    // propriedade e preserva a animacao existente.
    body =
      `seedRandom(${canonicalExpressionNumber(tokens.seed)});\n` +
      `posterizeTime(${canonicalExpressionNumber(tokens.rate)});\n` +
      `value * random(${canonicalExpressionNumber(tokens.minFactor)}, ` +
      `${canonicalExpressionNumber(tokens.maxFactor)});`;
  } else if (template.id === "ae.expression.wiggle") {
    tokens = readWiggleTokens(request.tokens);
    // `seedRandom` sempre acompanha o wiggle: e o offset dele que controla o
    // valor inicial do wiggle. O argumento `timeless` NAO e emitido porque a
    // documentacao diz que ele nao governa o wiggle — emiti-lo sugeriria um
    // controle que nao existe.
    body =
      `seedRandom(${canonicalExpressionNumber(tokens.seed)});\n` +
      `wiggle(${canonicalExpressionNumber(tokens.frequency)}, ` +
      `${canonicalExpressionNumber(tokens.amplitude)}, ` +
      `${canonicalExpressionNumber(tokens.octaves)}, ` +
      `${canonicalExpressionNumber(tokens.amplitudeMultiplier)});`;
  } else if (template.id === "ae.expression.loopout") {
    tokens = readLoopOutTokens(request.tokens);
    if (tokens.type === "continue") {
      body = 'loopOut("continue");';
    } else if (tokens.useDuration) {
      body = `loopOutDuration("${tokens.type}", ${canonicalExpressionNumber(tokens.duration)});`;
    } else {
      body = `loopOut("${tokens.type}", ${canonicalExpressionNumber(tokens.numKeyframes)});`;
    }
  } else {
    tokens = readSmoothTokens(request.tokens);
    const reference = tokens.referenceTime === "current"
      ? "time"
      : canonicalExpressionNumber(tokens.referenceTime);
    body = `smooth(${canonicalExpressionNumber(tokens.widthSeconds)}, ${canonicalExpressionNumber(tokens.samples)}, ${reference});`;
  }

  return deepFreeze({
    id: template.id,
    version: 1 as const,
    tokens,
    source: `// MOTION_EXPRESSION v1 | ${template.id}\n${body}`
  });
}

export type ManagedExpressionIdentity =
  | { readonly kind: "unmanaged" }
  | { readonly kind: "managed"; readonly expression: RenderedExpression }
  | { readonly kind: "unsupported-version"; readonly version: number }
  | { readonly kind: "invalid-managed"; readonly reason: "malformed-header" | "unknown-template" | "invalid-body" };

/** Numero na forma que `canonicalExpressionNumber` emite, e so nela. */
const NUMERO_CANONICO = "(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?";

function parseCanonicalBody(id: string, body: string): RenderedExpression | null {
  if (id === "ae.textbox.size") {
    const size = new RegExp(
      "^var alvo = thisLayer\\.parent;\\nvar r = alvo\\.sourceRectAtTime\\(time, false\\);\\n" +
        "r\\.width === 0 && r\\.height === 0 \\? \\[0, 0\\] : " +
        `\\[r\\.width \\+ (${NUMERO_CANONICO}) \\* 2, r\\.height \\+ (${NUMERO_CANONICO}) \\* 2\\];$`
    );
    const partes = size.exec(body);
    if (!partes) return null;

    try {
      return renderExpression({
        id,
        tokens: { paddingX: Number(partes[1]), paddingY: Number(partes[2]) }
      });
    } catch {
      return null;
    }
  }

  if (id === "ae.textbox.position") {
    // A posicao nao carrega token: ou o corpo e exatamente o canonico, ou nao e
    // gerenciado. Reaproveita paddingX/paddingY zerados apenas para satisfazer o
    // formato de tokens do template irmao.
    const canonico =
      "var alvo = thisLayer.parent;\n" +
      "var r = alvo.sourceRectAtTime(time, false);\n" +
      "[r.left + r.width / 2, r.top + r.height / 2];";
    if (body !== canonico) return null;
    return renderExpression({ id, tokens: { paddingX: 0, paddingY: 0 } });
  }

  if (id === "ae.expression.flicker") {
    const flicker = new RegExp(
      `^seedRandom\\((0|[1-9][0-9]*)\\);\\nposterizeTime\\(${NUMERO_CANONICO}\\);` +
        `\\nvalue \\* random\\(${NUMERO_CANONICO}, ${NUMERO_CANONICO}\\);$`
    );
    if (!flicker.test(body)) return null;

    const partes =
      /^seedRandom\((.+?)\);\nposterizeTime\((.+?)\);\nvalue \* random\((.+?), (.+?)\);$/.exec(body);
    if (!partes) return null;

    try {
      return renderExpression({
        id,
        tokens: {
          seed: Number(partes[1]),
          rate: Number(partes[2]),
          minFactor: Number(partes[3]),
          maxFactor: Number(partes[4])
        }
      });
    } catch {
      return null;
    }
  }

  if (id === "ae.expression.wiggle") {
    const wiggle = new RegExp(
      `^seedRandom\\((0|[1-9][0-9]*)\\);\\nwiggle\\(${NUMERO_CANONICO}` +
        `, ${NUMERO_CANONICO}, (0|[1-9][0-9]*), ${NUMERO_CANONICO}\\);$`
    );
    if (!wiggle.test(body)) return null;

    const partes = /^seedRandom\((.+?)\);\nwiggle\((.+?), (.+?), (.+?), (.+?)\);$/.exec(body);
    if (!partes) return null;

    try {
      return renderExpression({
        id,
        tokens: {
          seed: Number(partes[1]),
          frequency: Number(partes[2]),
          amplitude: Number(partes[3]),
          octaves: Number(partes[4]),
          amplitudeMultiplier: Number(partes[5])
        }
      });
    } catch {
      return null;
    }
  }

  if (id === "ae.expression.loopout") {
    if (body === 'loopOut("continue");') {
      return renderExpression({
        id,
        tokens: { type: "continue", numKeyframes: 0, duration: 0, useDuration: false }
      });
    }
    const keys = /^loopOut\("(cycle|pingpong|offset)", (0|[1-9][0-9]*)\);$/.exec(body);
    if (keys) {
      const count = Number(keys[2]);
      try {
        return renderExpression({
          id,
          tokens: { type: keys[1], numKeyframes: count, duration: 0, useDuration: false }
        });
      } catch {
        return null;
      }
    }
    const duration = /^loopOutDuration\("(cycle|pingpong|offset)", ((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (duration) {
      try {
        return renderExpression({
          id,
          tokens: {
            type: duration[1],
            numKeyframes: 0,
            duration: Number(duration[2]),
            useDuration: true
          }
        });
      } catch {
        return null;
      }
    }
    return null;
  }

  if (id === "ae.expression.smooth") {
    const smooth = /^smooth\(((?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?), (0|[1-9][0-9]*), (time|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\);$/.exec(body);
    if (!smooth) return null;
    try {
      return renderExpression({
        id,
        tokens: {
          widthSeconds: Number(smooth[1]),
          samples: Number(smooth[2]),
          referenceTime: smooth[3] === "time" ? "current" : Number(smooth[3])
        }
      });
    } catch {
      return null;
    }
  }
  return null;
}

export function identifyManagedExpression(source: unknown): ManagedExpressionIdentity {
  if (typeof source !== "string" || !source.startsWith("// MOTION_EXPRESSION")) {
    return deepFreeze({ kind: "unmanaged" as const });
  }
  const normalized = source.replace(/\r\n/g, "\n");
  const header = /^\/\/ MOTION_EXPRESSION v([0-9]+) \| ([^\n\r]+)\n/.exec(normalized);
  if (!header) return deepFreeze({ kind: "invalid-managed" as const, reason: "malformed-header" as const });
  const version = Number(header[1]);
  if (version !== 1) {
    return deepFreeze({ kind: "unsupported-version" as const, version });
  }
  const id = header[2] ?? "";
  if (!TEMPLATES.some((template) => template.id === id)) {
    return deepFreeze({ kind: "invalid-managed" as const, reason: "unknown-template" as const });
  }
  const body = normalized.slice(header[0].length);
  const parsed = parseCanonicalBody(id, body);
  if (!parsed || parsed.source !== normalized) {
    return deepFreeze({ kind: "invalid-managed" as const, reason: "invalid-body" as const });
  }
  return deepFreeze({ kind: "managed" as const, expression: parsed });
}

export function isManagedExpression(source: unknown): boolean {
  return identifyManagedExpression(source).kind === "managed";
}

export function parseManagedExpression(source: unknown): RenderedExpression | null {
  const identity = identifyManagedExpression(source);
  if (identity.kind === "unmanaged") return null;
  if (identity.kind === "unsupported-version") {
    fail("UNSUPPORTED_EXPRESSION_VERSION", "Unsupported managed expression version.", {
      version: identity.version
    });
  }
  if (identity.kind === "invalid-managed") {
    fail("MALFORMED_MANAGED_EXPRESSION", "Malformed managed expression.", {
      reason: identity.reason
    });
  }
  return identity.expression;
}

export interface ExpressionPropertyState {
  readonly expression: string;
  readonly expressionEnabled: boolean;
}

export interface ManagedExpressionState {
  readonly templateId: ExpressionTemplate["id"];
  readonly version: 1;
  readonly source: string;
  readonly backup: ExpressionPropertyState;
}

export type ExpressionPlanAction = "apply" | "adjust" | "restore" | "skip" | "none";

export interface ExpressionMutationPlan {
  readonly operation: "apply" | "adjust" | "restore";
  readonly action: ExpressionPlanAction;
  readonly changed: boolean;
  readonly reason?: string;
  readonly before: ExpressionPropertyState;
  readonly after: ExpressionPropertyState;
  readonly backup: ExpressionPropertyState | null;
  readonly managed: ManagedExpressionState | null;
}

function readPropertyState(value: unknown): ExpressionPropertyState {
  const record = readDataRecord(value, "INVALID_PROPERTY_STATE", "Invalid expression property state.");
  assertKeys(
    record,
    ["expression", "expressionEnabled"],
    [],
    "INVALID_PROPERTY_STATE",
    "Invalid expression property state."
  );
  if (typeof record.expression !== "string" || typeof record.expressionEnabled !== "boolean") {
    fail("INVALID_PROPERTY_STATE", "Invalid expression property state.");
  }
  return deepFreeze({ expression: record.expression, expressionEnabled: record.expressionEnabled });
}

function samePropertyState(left: ExpressionPropertyState, right: ExpressionPropertyState): boolean {
  return left.expression === right.expression && left.expressionEnabled === right.expressionEnabled;
}

function readManagedState(value: unknown): ManagedExpressionState {
  const record = readDataRecord(value, "INVALID_MANAGED_STATE", "Invalid managed expression state.");
  assertKeys(
    record,
    ["templateId", "version", "source", "backup"],
    [],
    "INVALID_MANAGED_STATE",
    "Invalid managed expression state."
  );
  if (record.version !== 1 || typeof record.templateId !== "string" || typeof record.source !== "string") {
    fail("INVALID_MANAGED_STATE", "Invalid managed expression state.");
  }
  const parsed = parseManagedExpression(record.source);
  if (!parsed || parsed.id !== record.templateId || parsed.source !== record.source) {
    fail("INVALID_MANAGED_STATE", "Invalid managed expression state.");
  }
  const backup = readPropertyState(record.backup);
  return deepFreeze({
    templateId: parsed.id,
    version: 1 as const,
    source: parsed.source,
    backup
  });
}

function makeManaged(rendered: RenderedExpression, backup: ExpressionPropertyState): ManagedExpressionState {
  return deepFreeze({
    templateId: rendered.id,
    version: 1 as const,
    source: rendered.source,
    backup
  });
}

function makePlan(input: {
  operation: ExpressionMutationPlan["operation"];
  action: ExpressionPlanAction;
  changed: boolean;
  reason?: string;
  before: ExpressionPropertyState;
  after: ExpressionPropertyState;
  backup: ExpressionPropertyState | null;
  managed: ManagedExpressionState | null;
}): ExpressionMutationPlan {
  return deepFreeze(input);
}

function readConflictMode(value: unknown): ExpressionConflictMode {
  if (value !== "skip" && value !== "replace-with-backup") {
    fail("INVALID_CONFLICT_MODE", "Invalid expression conflict mode.");
  }
  return value;
}

export function planExpressionApply(inputValue: unknown): ExpressionMutationPlan {
  const input = readDataRecord(inputValue, "INVALID_PLAN_REQUEST", "Invalid Apply request.");
  assertKeys(input, ["request", "current", "conflictMode"], ["managed"], "INVALID_PLAN_REQUEST", "Invalid Apply request.");
  const rendered = renderExpression(input.request as RenderExpressionRequest);
  const current = readPropertyState(input.current);
  const conflictMode = readConflictMode(input.conflictMode);

  if (Object.hasOwn(input, "managed") && input.managed !== null) {
    const managed = readManagedState(input.managed);
    if (managed.templateId !== rendered.id) {
      fail("MANAGED_TEMPLATE_MISMATCH", "Managed expression belongs to another template.");
    }
    if (current.expression !== managed.source || current.expressionEnabled !== true) {
      fail("INVALID_MANAGED_STATE", "Current property no longer matches its managed record.");
    }
    const after = deepFreeze({ expression: rendered.source, expressionEnabled: true });
    const nextManaged = makeManaged(rendered, managed.backup);
    if (samePropertyState(current, after)) {
      return makePlan({
        operation: "apply",
        action: "none",
        changed: false,
        reason: "already-current",
        before: current,
        after: current,
        backup: managed.backup,
        managed: nextManaged
      });
    }
    return makePlan({
      operation: "apply",
      action: "adjust",
      changed: true,
      before: current,
      after,
      backup: managed.backup,
      managed: nextManaged
    });
  }

  if (current.expression !== "" && conflictMode === "skip") {
    return makePlan({
      operation: "apply",
      action: "skip",
      changed: false,
      reason: "expression-conflict",
      before: current,
      after: current,
      backup: null,
      managed: null
    });
  }

  const after = deepFreeze({ expression: rendered.source, expressionEnabled: true });
  const managed = makeManaged(rendered, current);
  return makePlan({
    operation: "apply",
    action: "apply",
    changed: true,
    before: current,
    after,
    backup: current,
    managed
  });
}

export function planExpressionAdjust(inputValue: unknown): ExpressionMutationPlan {
  const input = readDataRecord(inputValue, "INVALID_PLAN_REQUEST", "Invalid Adjust request.");
  assertKeys(input, ["request", "current", "managed"], [], "INVALID_PLAN_REQUEST", "Invalid Adjust request.");
  if (input.managed === null || typeof input.managed === "undefined") {
    fail("ADJUST_REQUIRES_MANAGED_STATE", "Adjust requires trusted managed state.");
  }
  const rendered = renderExpression(input.request as RenderExpressionRequest);
  const current = readPropertyState(input.current);
  const managed = readManagedState(input.managed);
  if (managed.templateId !== rendered.id) {
    fail("MANAGED_TEMPLATE_MISMATCH", "Managed expression belongs to another template.");
  }
  if (current.expression !== managed.source || current.expressionEnabled !== true) {
    fail("INVALID_MANAGED_STATE", "Current property no longer matches its managed record.");
  }
  const after = deepFreeze({ expression: rendered.source, expressionEnabled: true });
  const nextManaged = makeManaged(rendered, managed.backup);
  if (samePropertyState(current, after)) {
    return makePlan({
      operation: "adjust",
      action: "none",
      changed: false,
      reason: "already-current",
      before: current,
      after: current,
      backup: managed.backup,
      managed: nextManaged
    });
  }
  return makePlan({
    operation: "adjust",
    action: "adjust",
    changed: true,
    before: current,
    after,
    backup: managed.backup,
    managed: nextManaged
  });
}

export function planExpressionRestore(inputValue: unknown): ExpressionMutationPlan {
  const input = readDataRecord(inputValue, "INVALID_PLAN_REQUEST", "Invalid Restore request.");
  assertKeys(input, ["current", "managed"], [], "INVALID_PLAN_REQUEST", "Invalid Restore request.");
  const current = readPropertyState(input.current);
  const managed = readManagedState(input.managed);

  if (samePropertyState(current, managed.backup)) {
    return makePlan({
      operation: "restore",
      action: "none",
      changed: false,
      reason: "already-restored",
      before: current,
      after: current,
      backup: managed.backup,
      managed: null
    });
  }
  if (current.expression !== managed.source || current.expressionEnabled !== true) {
    return makePlan({
      operation: "restore",
      action: "skip",
      changed: false,
      reason: "managed-source-mismatch",
      before: current,
      after: current,
      backup: managed.backup,
      managed
    });
  }
  return makePlan({
    operation: "restore",
    action: "restore",
    changed: true,
    before: current,
    after: managed.backup,
    backup: managed.backup,
    managed: null
  });
}
