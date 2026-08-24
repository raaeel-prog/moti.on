/**
 * Scanner do subconjunto de sintaxe que o ExtendScript aceita.
 *
 * Por que este arquivo existe: nenhuma ferramenta de compilacao pode mais fazer
 * esse trabalho. O target ES3 do tsc foi removido na 5.5, o esbuild nao emite
 * ES3, e no TypeScript 6.0 ate 'target: ES5' passou a ser reportado como
 * descontinuado. `lib: ["ES5"]` no tsconfig.host.json cobre as APIs ausentes,
 * mas nao cobre SINTAXE: arrow function, let, const, template literal e spread
 * sao aceitos pelo parser do TypeScript sob qualquer target moderno, e so
 * quebram quando o After Effects tenta ler o arquivo. Este scanner cobre essa
 * lacuna.
 *
 * O scanner e deliberadamente textual e conservador. Ele nao e um parser: um
 * parser completo de ES5 seria mais preciso e muito mais codigo para manter, e o
 * conjunto de construtos que importa aqui e pequeno e estavel. Para nao acusar
 * ocorrencias dentro de comentario ou de string, o conteudo e normalizado antes
 * da varredura por um scanner de estados que remove comentarios e literais de
 * string, preservando as posicoes de linha.
 *
 * Uso: `node scripts/check-extendscript.mjs` (parte de `npm run lint`).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");

/** Diretorios varridos. */
export const SCANNED_DIRECTORIES = [
  path.join("apps", "after-effects-cep", "host", "src")
];

/**
 * Construtos proibidos.
 *
 * Cada entrada traz a mensagem que o desenvolvedor vai ler quando falhar, e ela
 * precisa dizer o que usar no lugar. Um erro que so diz "proibido" obriga a
 * pessoa a ir procurar a regra em outro lugar.
 */
export const BANNED_CONSTRUCTS = [
  {
    id: "arrow-function",
    pattern: /=>/,
    message: "arrow function. Use `function (args) { ... }`."
  },
  {
    id: "let",
    pattern: /(^|[^\w$.])let\s+[A-Za-z_$]/,
    message: "declaração `let`. Use `var`, declarado no topo da função."
  },
  {
    id: "const",
    pattern: /(^|[^\w$.])const\s+[A-Za-z_$]/,
    message: "declaração `const`. Use `var`."
  },
  {
    id: "class",
    pattern: /(^|[^\w$.])class\s+[A-Za-z_$]/,
    message: "declaração `class`. Use função construtora com prototype."
  },
  {
    id: "template-literal",
    pattern: /`/,
    message: "template literal. Use concatenação com `+`."
  },
  {
    id: "spread-or-rest",
    pattern: /\.\.\./,
    message: "spread/rest. Use `arguments` ou passe um array explicitamente."
  },
  {
    id: "optional-chaining",
    pattern: /\?\./,
    message: "optional chaining. Teste o valor antes de acessá-lo."
  },
  {
    id: "nullish-coalescing",
    pattern: /\?\?/,
    message: "nullish coalescing. Use `typeof x === \"undefined\" ? fallback : x`."
  },
  {
    id: "promise",
    pattern: /(^|[^\w$.])Promise(\b|$)/,
    message: "Promise. O ExtendScript é síncrono; retorne o valor diretamente."
  },
  {
    id: "async-await",
    pattern: /(^|[^\w$.])(async|await)\s/,
    message: "async/await. O ExtendScript é síncrono."
  },
  {
    id: "json-global",
    pattern: /(^|[^\w$.])JSON\./,
    message: "objeto `JSON`, que não existe no ExtendScript. Use MotionJson (CHMS-004) ou o serializador local."
  },
  {
    id: "es5-object-statics",
    pattern: /(^|[^\w$.])Object\.(keys|assign|values|entries|freeze|create|defineProperty)\b/,
    message: "método estático de Object indisponível. Use `for (key in obj)` com `hasOwnProperty`."
  },
  {
    id: "array-statics",
    pattern: /(^|[^\w$.])Array\.(isArray|from|of)\b/,
    message: "método estático de Array indisponível. Use `value instanceof Array`."
  },
  {
    id: "array-iteration-methods",
    pattern: /\.(forEach|map|filter|reduce|some|every|find|findIndex|includes)\s*\(/,
    message: "método de iteração de Array indisponível. Use `for (i = 0; i < n; i += 1)`."
  },
  {
    id: "string-trim",
    pattern: /\.trim\s*\(/,
    message: "String.prototype.trim indisponível. Use `.replace(/^\\s+|\\s+$/g, \"\")`."
  },
  {
    id: "function-bind",
    pattern: /\.bind\s*\(/,
    message: "Function.prototype.bind indisponível. Capture `this` numa variável (`var self = this`)."
  },
  {
    id: "target-directive",
    pattern: /^#target\b/,
    message: "diretiva `#target` no fonte. Ela é emitida por scripts/build-extendscript.mjs; deixá-la aqui impede a checagem de sintaxe."
  }
];

/**
 * Remove comentarios e conteudo de literais de string, preservando quebras de
 * linha e o comprimento aproximado, para que a varredura nao acuse ocorrencias
 * que sao texto e nao codigo.
 *
 * Trata: string simples e dupla com escape, comentario de linha, comentario de
 * bloco e literal de expressao regular. Template literal nao e tratado como
 * literal justamente porque a crase e um dos construtos proibidos.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripCommentsAndStrings(source) {
  var out = "";
  var i = 0;
  var n = source.length;

  while (i < n) {
    var ch = source[i];
    var next = i + 1 < n ? source[i + 1] : "";

    // Comentario de linha
    if (ch === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    // Comentario de bloco
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        // Preserva as quebras de linha para o numero da linha continuar certo.
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      i += 2;
      continue;
    }

    // Literal de string
    if (ch === '"' || ch === "'") {
      var quote = ch;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      out += '""';
      continue;
    }

    // Literal de expressao regular. Distinguir de divisao exige olhar para tras:
    // uma barra que segue um token de valor e divisao, e nao inicio de regex.
    if (ch === "/") {
      var previous = out.replace(/\s+$/, "").slice(-1);
      var isDivision = previous !== "" && /[\w$)\]]/.test(previous);
      if (!isDivision) {
        i += 1;
        var inClass = false;
        while (i < n) {
          if (source[i] === "\\") {
            i += 2;
            continue;
          }
          if (source[i] === "[") inClass = true;
          else if (source[i] === "]") inClass = false;
          else if (source[i] === "/" && !inClass) break;
          else if (source[i] === "\n") break;
          i += 1;
        }
        i += 1;
        // Consome as flags.
        while (i < n && /[a-z]/.test(source[i])) i += 1;
        out += "/RE/";
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * @param {string} source
 * @returns {{ line: number, construct: string, message: string }[]}
 */
export function findBannedConstructs(source) {
  const scannable = stripCommentsAndStrings(source);
  const lines = scannable.split("\n");
  /** @type {{ line: number, construct: string, message: string }[]} */
  const findings = [];

  lines.forEach((lineText, index) => {
    for (const banned of BANNED_CONSTRUCTS) {
      if (banned.pattern.test(lineText)) {
        findings.push({
          line: index + 1,
          construct: banned.id,
          message: banned.message
        });
      }
    }
  });

  return findings;
}

async function collectJsxFiles(directory) {
  /** @type {string[]} */
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectJsxFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".jsx")) {
      found.push(full);
    }
  }
  return found;
}

export async function scanRepository() {
  /** @type {string[]} */
  const problems = [];
  let scannedFiles = 0;

  for (const relativeDirectory of SCANNED_DIRECTORIES) {
    const files = await collectJsxFiles(path.join(root, relativeDirectory));
    for (const file of files) {
      scannedFiles += 1;
      const source = await readFile(file, "utf8");
      const relative = path.relative(root, file).split(path.sep).join("/");
      for (const finding of findBannedConstructs(source)) {
        problems.push(`${relative}:${finding.line} — ${finding.message}`);
      }
    }
  }

  return { scannedFiles, problems };
}

// Executa apenas quando chamado direto, para que os testes possam importar as
// funcoes acima sem disparar process.exit.
if (import.meta.url === `file://${process.argv[1]?.split(path.sep).join("/")}` ||
    process.argv[1]?.endsWith("check-extendscript.mjs")) {
  const { scannedFiles, problems } = await scanRepository();

  if (scannedFiles === 0) {
    console.error("Nenhum arquivo .jsx foi encontrado. O scanner não verificou nada.");
    process.exit(1);
  }

  if (problems.length > 0) {
    console.error("Construtos fora do subconjunto ExtendScript:\n");
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    console.error(
      `\n${problems.length} problema(s) em ${scannedFiles} arquivo(s). ` +
        "O After Effects rejeita esses construtos em tempo de carregamento."
    );
    process.exit(1);
  }

  console.log(`Subconjunto ExtendScript verificado em ${scannedFiles} arquivo(s).`);
}
