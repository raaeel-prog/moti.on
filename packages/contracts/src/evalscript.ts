/**
 * Serialização segura para o canal `evalScript` do CEP.
 *
 * Este é o ponto mais perigoso da ponte painel↔host. `evalScript` recebe **uma
 * string de código** que o ExtendScript avalia. Montar essa string por
 * concatenação com dado do usuário — nome de projeto, caminho de arquivo, texto
 * de camada — é injeção de código na definição literal: basta o dado conter uma
 * aspa para o resto virar código executável dentro do After Effects, com acesso
 * total ao projeto e ao sistema de arquivos.
 *
 * O starter fazia exatamente isso, ainda que com dado fixo:
 *
 *     csInterface.evalScript("MotionAE.getContext()", callback);
 *
 * Funcionava porque não havia argumento. No momento em que o primeiro comando
 * receber parâmetro, a concatenação ingênua vira vulnerabilidade.
 *
 * A regra deste módulo: **a saída é sempre ASCII imprimível**, e as únicas
 * funções autorizadas a produzir string de código são `buildDispatchCall` e
 * `buildHostBootstrapCall`. As duas passam pelo mesmo encoder; nada mais neste
 * repositório monta código para o `evalScript`.
 */

/**
 * Acima disto, o adapter recusa o pedido antes de chamar `evalScript`. O futuro
 * transporte alternativo deverá usar arquivo temporário e checksum SHA-256,
 * mas esse caminho ainda não está implementado neste build.
 *
 * O limite não é o de uma especificação — não existe número documentado para o
 * tamanho máximo de um `evalScript`. É um teto conservador escolhido porque o
 * comportamento real na fronteira é truncamento ou falha silenciosa, e as duas
 * coisas são piores do que um caminho alternativo explícito. Transcrições e
 * documentos de legenda passam disto com facilidade.
 */
export const MAX_INLINE_EVALSCRIPT_CHARS = 60_000;

/**
 * Alias mantido para consumidores anteriores ao nome canônico explícito.
 *
 * Novos adapters devem usar `MAX_INLINE_EVALSCRIPT_CHARS`: o nome curto podia
 * ser confundido com o tamanho do JSON antes do escaping.
 */
export const MAX_INLINE_CHARS = MAX_INLINE_EVALSCRIPT_CHARS;

/** Só caracteres ASCII imprimíveis, de U+0020 a U+007E. */
const PRINTABLE_ASCII = /^[\x20-\x7E]*$/;

function toUnicodeEscape(codeUnit: number): string {
  return "\\u" + codeUnit.toString(16).padStart(4, "0");
}

/**
 * Escapa uma string JSON para ser embutida num literal de string do
 * ExtendScript.
 *
 * As regras, e por que cada uma existe:
 *
 * - `\` → `\\` e `"` → `\"`: sem isso o literal termina no meio do dado, e o que
 *   vem depois é interpretado como código.
 *
 * - **Todo** caractere abaixo de U+0020 vira `\uXXXX`, não só `\n`, `\r` e `\t`.
 *   O serializador do starter tratava apenas esses três; os demais caracteres de
 *   controle saíam crus, o que produz JSON sintaticamente inválido pela
 *   especificação do formato.
 *
 * - **Todo** caractere acima de U+007E vira `\uXXXX`, incluindo acentos comuns.
 *   Este é o ponto menos óbvio e o mais importante: o canal de retorno do
 *   `evalScript` não tem codificação garantida, e no Windows o ExtendScript
 *   decodifica conforme a codepage do sistema. Um caminho `C:\Users\joão\` ou um
 *   rótulo `"Composição"` atravessa corrompido em máquinas com codepage
 *   diferente — e corrompido de forma que só aparece no computador do usuário,
 *   nunca no de quem desenvolve.
 *
 * - U+2028 e U+2029 estão cobertos pela regra acima. São separadores de linha
 *   Unicode que o JSON aceita cru mas que terminam um literal de string em
 *   JavaScript; são a causa clássica de `SyntaxError` em código gerado.
 *
 * - Pares substitutos saem como dois `\uXXXX`, que é a representação correta em
 *   UTF-16 e sobrevive ao round-trip. Substituto solitário também é escapado em
 *   vez de rejeitado: dado malformado deve atravessar como dado, nunca virar
 *   erro de sintaxe do lado de lá.
 */
export function encodeForEvalScript(json: string): string {
  let out = "";

  for (let index = 0; index < json.length; index += 1) {
    const code = json.charCodeAt(index);
    const char = json[index] as string;

    if (char === "\\") {
      out += "\\\\";
    } else if (char === '"') {
      out += '\\"';
    } else if (code < 0x20 || code > 0x7e) {
      out += toUnicodeEscape(code);
    } else {
      out += char;
    }
  }

  // Pós-condição, não comentário otimista. Se um caractere escapar da regra
  // acima, é melhor falhar aqui — onde o teste vê — do que emitir código que o
  // After Effects vai avaliar.
  if (!PRINTABLE_ASCII.test(out)) {
    throw new Error(
      "encodeForEvalScript produziu caractere fora de ASCII imprimível. " +
        "Isso é defeito do próprio encoder e não pode ser enviado ao host."
    );
  }

  return out;
}

/**
 * Desfaz `encodeForEvalScript`. Usado nos testes de round-trip e para ler o que
 * o host devolve pelo mesmo canal.
 */
export function decodeFromHost(encoded: string): string {
  return encoded.replace(/\\u([0-9a-fA-F]{4})|\\(["\\])/g, (_match, hex: string | undefined, literal: string | undefined) =>
    hex !== undefined ? String.fromCharCode(parseInt(hex, 16)) : (literal as string)
  );
}

/**
 * Monta a **única** forma de chamada aceita.
 *
 * O host expõe exatamente um ponto de entrada, `MotionAE.dispatch`. Não existe
 * caminho para o cliente pedir "avalie esta expressão": mesmo que alguém queira,
 * a única função que produz string para o `evalScript` é esta, e o que ela
 * embute já passou pelo encoder.
 */
export function buildDispatchCall(json: string): string {
  return `MotionAE.dispatch("${encodeForEvalScript(json)}")`;
}

/** Caminho do host montado, relativo à raiz da extensão instalada. */
export const HOST_SCRIPT_RELATIVE_PATH = "/host/index.jsx";

const HOST_DISPATCH_READY_EXPRESSION =
  'typeof $.global.MotionAE === "object" && ' +
  '$.global.MotionAE !== null && ' +
  'typeof $.global.MotionAE.dispatch === "function"';

/**
 * Valor que `buildHostBootstrapCall` devolve quando o host ficou carregado.
 *
 * É o resultado de `typeof`, e não um booleano, porque `typeof` nunca lança: se
 * `$.evalFile` rodar mas não registrar o global, a resposta diz `"undefined"` em
 * vez de mentir sucesso.
 */
export const HOST_BOOTSTRAP_OK = "function";

/**
 * Monta a chamada que carrega o host ExtendScript a partir do disco.
 *
 * **Por que isso existe.** O manifest CSXS deliberadamente não declara
 * `<ScriptPath>`. No After Effects 26.3 esse caminho abriu um modal bloqueante
 * de erro de sintaxe, enquanto `$.evalFile` carregou o mesmo arquivo. Cada nova
 * instância do adapter usa esta chamada antes do primeiro despacho; ela nunca
 * aceita como prova de versão um namespace `MotionAE` deixado por outra
 * instância. O registro do host real está em `docs/HOST_LIMITATIONS.md`.
 *
 * Carregar por `$.evalFile` também cobre um segundo caso, independente da
 * versão: o motor ExtendScript pode ser reiniciado no meio da sessão, e a partir
 * daí o painel continua aberto conversando com um host que não existe mais.
 *
 * O caminho é normalizado para barra normal antes de ser codificado. `File`
 * aceita os dois separadores, mas a barra invertida sobrevive ao encoder como
 * `\\` e deixa o literal ilegível na hora de depurar — e depurar isso dentro do
 * After Effects é caro.
 */
export function buildHostBootstrapCall(extensionPath: string): string {
  const normalized = extensionPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const encoded = encodeForEvalScript(normalized + HOST_SCRIPT_RELATIVE_PATH);

  return (
    `(function(){try{$.evalFile(new File("${encoded}"));` +
    `return (${HOST_DISPATCH_READY_EXPRESSION})?"function":"undefined";` +
    `}catch(e){return "bootstrap-failed:" + String(e.message || e) + ":L" + String(e.line || "?");}})()`
  );
}

/**
 * O pedido cabe inline, ou exige o transporte alternativo ainda não disponível?
 *
 * Mede a string **já codificada**, não a original: escapar acentos multiplica o
 * tamanho por seis, e um documento de legenda em português mede muito mais
 * depois de codificado do que antes.
 */
export function needsTempFileTransport(json: string): boolean {
  return encodeForEvalScript(json).length > MAX_INLINE_EVALSCRIPT_CHARS;
}
