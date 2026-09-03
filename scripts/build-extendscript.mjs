/**
 * Monta a camada de host em ExtendScript a partir dos fontes em
 * apps/after-effects-cep/host/src/.
 *
 * Por que existe um passo de montagem em vez de uma copia:
 *
 * 1. A diretiva `#target aftereffects` nao e JavaScript valido. Enquanto ela
 *    estava dentro do arquivo-fonte, nem o `tsc --checkJs` nem o `node --check`
 *    conseguiam parsear o host, e a unica verificacao possivel era ler o codigo.
 *    Mantendo a diretiva aqui, o fonte volta a ser JavaScript ES5 legitimo e
 *    passa a ser verificavel por ferramenta.
 *
 * 2. O ExtendScript nao tem sistema de modulos. Conforme o host cresce
 *    (CHMS-004 traz JSON, sha256, redaction, registry e dispatch), a unica forma
 *    de dividir o codigo em arquivos e concatena-los numa ordem conhecida. Cada
 *    fonte e um IIFE proprio que se pendura em `$.global`, entao a concatenacao
 *    e segura desde que a ordem seja explicita.
 *
 * A ordem e uma lista literal, nunca um glob: um glob resolve em ordem de
 * sistema de arquivos, que varia entre plataformas, e isso quebraria tanto o
 * carregamento quanto a comparacao de bytes do build.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const hostSrc = path.join(root, "apps", "after-effects-cep", "host", "src");

/**
 * Ordem de concatenacao. Dependencias primeiro.
 *
 * Lista literal, nunca glob. Um glob resolve em ordem de sistema de arquivos,
 * que difere entre Windows, macOS e o runner do CI — e como cada modulo depende
 * dos globais que os anteriores penduraram em `$.global`, uma ordem diferente
 * quebra o carregamento dentro do After Effects, onde o erro e mais caro de
 * diagnosticar.
 *
 * Os caminhos com `../generated/` sao codigo gerado a partir do TypeScript. Eles
 * vem antes de tudo porque o dispatcher e os comandos leem MotionContracts e
 * MotionDescriptors.
 */
export const HOST_SOURCE_ORDER = [
  "../generated/motion-contracts.jsx",
  "../generated/motion-descriptors.jsx",
  "json.jsx",
  "undo.jsx",
  "registry.jsx",
  "expression-templates.jsx",
  "transform-math.jsx",
  "keyframe-operations.jsx",
  "effect-operations.jsx",
  "rig-meta.jsx",
  "commands/context-read.jsx",
  "commands/capability-probe.jsx",
  "commands/diagnostics-echo.jsx",
  "commands/demo-create-composition.jsx",
  "commands/expression-loopout.jsx",
  "commands/expression-smooth.jsx",
  "commands/expression-wiggle.jsx",
  "commands/expression-flicker.jsx",
  "commands/text-box.jsx",
  "commands/layer-list.jsx",
  "commands/layer-parent.jsx",
  "commands/layer-create-null.jsx",
  "commands/layer-flip.jsx",
  "commands/anchor-align.jsx",
  "commands/layer-rename.jsx",
  "commands/layer-reverse-order.jsx",
  "commands/keys-cut.jsx",
  "commands/keys-delay.jsx",
  "commands/keys-ease.jsx",
  "commands/keys-reverse.jsx",
  "commands/keys-clone.jsx",
  "commands/time-controller.jsx",
  "commands/animate-kinetic.jsx",
  "commands/time-marker-loop.jsx",
  "commands/animate-inertial.jsx",
  "commands/animate-jump.jsx",
  "commands/keys-copy.jsx",
  "commands/shape-library.jsx",
  "commands/shape-trim-path.jsx",
  "commands/animate-parallax-quick.jsx",
  "commands/three-d-look-at.jsx",
  "commands/shape-break.jsx",
  "commands/rig-effector.jsx",
  "commands/camera-transition.jsx",
  "commands/three-d-cylinder.jsx",
  "commands/three-d-cube.jsx",
  "commands/three-d-orbit.jsx",
  "commands/effect-echo.jsx",
  "commands/effect-wave.jsx",
  "commands/effect-tile.jsx",
  "commands/effect-glitch.jsx",
  "commands/comp-fast-edit.jsx",
  "commands/ai-to-vector.jsx",
  "commands/text-to-vector.jsx",
  "commands/particles.jsx",
  "commands/texture.jsx",
  "commands/clean.jsx",
  "commands/parallax-advanced.jsx",
  // dispatch por ultimo: ele e o unico simbolo publico, e so faz sentido depois
  // que todos os comandos ja se registraram.
  "dispatch.jsx"
];

const TARGET_DIRECTIVE = "#target aftereffects\n";

const REGEX_PREFIX_KEYWORDS = new Set([
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "return",
  "throw",
  "typeof",
  "void"
]);

const CONTROL_PAREN_KEYWORDS = new Set(["catch", "for", "if", "switch", "while", "with"]);

function unicodeEscape(codeUnit, includeSlash = true) {
  const escaped = "u" + codeUnit.toString(16).padStart(4, "0");
  return includeSlash ? "\\" + escaped : escaped;
}

function sourceLocation(source, index) {
  const before = source.slice(0, index);
  const lines = before.split(/\r\n|\r|\n|\u2028|\u2029/);
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

function nonAsciiError(source, index, fileName, context) {
  const { line, column } = sourceLocation(source, index);
  const codePoint = source.codePointAt(index);
  const formatted = codePoint === undefined ? "desconhecido" : `U+${codePoint.toString(16).toUpperCase()}`;

  if (context === "regex") {
    return new Error(
      `Caractere ${formatted} não ASCII em expressão regular; use um escape \\uXXXX explícito ` +
        `no fonte (${fileName}:${line}:${column}).`
    );
  }

  return new Error(
    `Caractere ${formatted} não ASCII fora de string ou comentário; use um escape explícito ` +
      `no fonte (${fileName}:${line}:${column}).`
  );
}

/**
 * Converte texto de comentário e valores de string para uma representação
 * ASCII semanticamente equivalente.
 *
 * O scanner é lexical de propósito. Substituir caracteres globalmente parece
 * tentador, mas pode mudar um identificador ou o significado de uma expressão
 * regular. Strings recebem escapes Unicode, comentários recebem texto ASCII e
 * regex/identificadores com Unicode falham alto para que o autor escreva o
 * escape deliberadamente no fonte.
 *
 * @param {string} source
 * @param {string} [fileName]
 */
export function toAsciiExtendScript(source, fileName = "<fonte ExtendScript>") {
  let output = "";
  let index = 0;
  let canStartRegex = true;
  let pendingControlParen = false;
  const parenKinds = [];

  function appendQuotedString(quote) {
    output += quote;
    index += 1;

    while (index < source.length) {
      const character = source[index];
      const codeUnit = source.charCodeAt(index);

      if (character === quote) {
        output += character;
        index += 1;
        return;
      }

      if (character === "\\") {
        output += character;
        index += 1;
        if (index >= source.length) return;

        const escaped = source[index];
        const escapedCodeUnit = source.charCodeAt(index);
        output += escapedCodeUnit > 0x7f
          ? unicodeEscape(escapedCodeUnit, false)
          : escaped;
        index += 1;
        continue;
      }

      output += codeUnit > 0x7f ? unicodeEscape(codeUnit) : character;
      index += 1;
    }
  }

  function appendLineComment() {
    output += "//";
    index += 2;

    while (index < source.length) {
      const character = source[index];
      const codeUnit = source.charCodeAt(index);
      if (character === "\r" || character === "\n") return;
      if (codeUnit === 0x2028 || codeUnit === 0x2029) {
        output += "\n";
        index += 1;
        return;
      }
      output += codeUnit > 0x7f ? unicodeEscape(codeUnit) : character;
      index += 1;
    }
  }

  function appendBlockComment() {
    output += "/*";
    index += 2;

    while (index < source.length) {
      const character = source[index];
      const next = source[index + 1];
      const codeUnit = source.charCodeAt(index);

      if (character === "*" && next === "/") {
        output += "*/";
        index += 2;
        return;
      }

      if (codeUnit === 0x2028 || codeUnit === 0x2029) output += "\n";
      else output += codeUnit > 0x7f ? unicodeEscape(codeUnit) : character;
      index += 1;
    }
  }

  function appendRegexLiteral() {
    let inCharacterClass = false;
    output += "/";
    index += 1;

    while (index < source.length) {
      const character = source[index];
      const codeUnit = source.charCodeAt(index);

      if (codeUnit > 0x7f) throw nonAsciiError(source, index, fileName, "regex");
      if (character === "\r" || character === "\n") return;

      output += character;
      index += 1;

      if (character === "\\" && index < source.length) {
        const escapedCodeUnit = source.charCodeAt(index);
        if (escapedCodeUnit > 0x7f) throw nonAsciiError(source, index, fileName, "regex");
        output += source[index];
        index += 1;
        continue;
      }

      if (character === "[") inCharacterClass = true;
      else if (character === "]") inCharacterClass = false;
      else if (character === "/" && !inCharacterClass) {
        while (index < source.length && /[a-z]/i.test(source[index])) {
          output += source[index];
          index += 1;
        }
        return;
      }
    }
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    const codeUnit = source.charCodeAt(index);

    if (character === "/" && next === "/") {
      appendLineComment();
      continue;
    }
    if (character === "/" && next === "*") {
      appendBlockComment();
      continue;
    }
    if (character === '"' || character === "'") {
      appendQuotedString(character);
      canStartRegex = false;
      pendingControlParen = false;
      continue;
    }

    if (codeUnit === 0x2028 || codeUnit === 0x2029) {
      output += "\n";
      index += 1;
      continue;
    }
    if (codeUnit > 0x7f) throw nonAsciiError(source, index, fileName, "code");

    if (/\s/.test(character)) {
      output += character;
      index += 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      const word = source.slice(start, index);
      output += word;
      pendingControlParen = CONTROL_PAREN_KEYWORDS.has(word);
      canStartRegex = REGEX_PREFIX_KEYWORDS.has(word) || pendingControlParen;
      continue;
    }

    if (/[0-9]/.test(character)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) index += 1;
      output += source.slice(start, index);
      canStartRegex = false;
      pendingControlParen = false;
      continue;
    }

    if (character === "/" && canStartRegex) {
      appendRegexLiteral();
      canStartRegex = false;
      pendingControlParen = false;
      continue;
    }

    output += character;
    index += 1;

    if (character === "(") {
      parenKinds.push(pendingControlParen ? "control" : "expression");
      canStartRegex = true;
      pendingControlParen = false;
    } else if (character === ")") {
      canStartRegex = parenKinds.pop() === "control";
      pendingControlParen = false;
    } else if (character === "]") {
      canStartRegex = false;
      pendingControlParen = false;
    } else if (character === ".") {
      canStartRegex = false;
      pendingControlParen = false;
    } else if ((character === "+" || character === "-") && next === character) {
      output += next;
      index += 1;
      canStartRegex = false;
      pendingControlParen = false;
    } else if (/[({[,;:?=+\-*%&|^!~<>]/.test(character) || character === "/") {
      canStartRegex = true;
      pendingControlParen = false;
    } else {
      canStartRegex = character === "}";
      pendingControlParen = false;
    }
  }

  return output;
}

export async function buildExtendScript(outputPath) {
  const chunks = [];

  for (const fileName of HOST_SOURCE_ORDER) {
    const source = await readFile(path.join(hostSrc, fileName), "utf8");

    // A verificacao e por posicao, nao por ocorrencia textual: os fontes
    // documentam a propria diretiva em comentario, e uma busca por substring
    // acusaria a documentacao. O que importa e a diretiva em posicao de codigo,
    // ou seja, no inicio de uma linha.
    if (/^#target\b/m.test(source)) {
      throw new Error(
        `${fileName} contém a diretiva #target em posição de código. Ela é emitida ` +
          "uma única vez por este script; deixá-la no fonte impede a checagem de " +
          "sintaxe e produziria diretivas duplicadas no arquivo montado."
      );
    }

    chunks.push(toAsciiExtendScript(source, fileName));
  }

  // Um unico \n separa a diretiva do primeiro fonte, e os fontes ja terminam com
  // quebra de linha, entao a juncao usa \n para produzir exatamente uma linha em
  // branco entre blocos.
  const bundle = TARGET_DIRECTIVE + "\n" + chunks.join("\n");

  if ([...bundle].some((character) => character.codePointAt(0) > 0x7f)) {
    throw new Error("Falha interna: o bundle ExtendScript ainda contém caractere não ASCII.");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bundle, "utf8");

  return { files: HOST_SOURCE_ORDER.length, bytes: Buffer.byteLength(bundle, "utf8") };
}
