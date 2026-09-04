/**
 * Os argumentos padrão do painel passam no preflight do host?
 *
 * Este teste existe por um defeito real e silencioso: a ferramenta Kinetic
 * mandava `overshoot: true` para um host que exige número entre 0 e 10, e
 * `splitMode: "word"` para um host que só aceita `"none" | "chars" | "words" |
 * "lines"`. O host recusava com `INVALID_PRESET` **em toda execução** — e, como
 * a tela dela não expunha controle nenhum, não havia como corrigir os valores
 * pelo painel. A ferramenta aparecia no navegador, com ícone e descrição, e
 * nunca pôde funcionar.
 *
 * Nada disso aparecia: o TypeScript concordava (o draft declarava `boolean`), o
 * host estava certo, e nenhum teste ligava um lado ao outro.
 *
 * ## O que é medido
 *
 * Os padrões são lidos do próprio `main.ts` e a expressão de argumentos é
 * extraída da chamada real de `client.execute`. Copiar os valores para cá faria
 * o teste concordar com o painel mesmo depois de o painel divergir.
 *
 * O critério é estreito de propósito: **nenhum padrão pode ser recusado por ser
 * inválido**. Falha de contexto — sem seleção, sem composição — é esperada num
 * ambiente falso e não reprova.
 *
 * ## Sem ponto cego
 *
 * Toda chamada é avaliada ou está declarada em `NAO_AVALIAVEL` com motivo. Uma
 * versão anterior deste teste pulava em silêncio o que não conseguia avaliar, e
 * com isso deixava de ver justamente as ferramentas cujos argumentos vêm de um
 * helper — que são as mais fáceis de errar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { loadHostModules } from "./host-harness.mjs";

const MAIN = new URL("../client/src/main.ts", import.meta.url);

/**
 * Chamadas cujos argumentos dependem de valor calculado em tempo de execução —
 * helper que resolve intervalo, medida lida do host, sonda gerada na hora.
 * Avaliá-las exigiria reimplementar o cálculo aqui, e aí o teste mediria a si
 * mesmo.
 *
 * Entrar nesta lista exige motivo escrito, como nas outras allowlists do
 * repositório.
 */
const NAO_AVALIAVEL = new Map([
  [
    "ae.style.neon",
    "as cores passam por hexToChannels(); avaliar aqui exigiria reimplementar a conversão, " +
      "então a checagem equivalente vive em style-neon.test.mjs, que despacha os padrões do painel"
  ],
  ["ae.anchor.align", "os argumentos saem de anchorArgs(), que resolve modo de tempo e extensão"],
  ["ae.anchor.align.preview", "mesma função anchorArgs(), no modo de prévia"],
  ["ae.keys.cut", "os argumentos saem de cutKeysArgs(), que resolve o intervalo pedido"],
  ["ae.keys.cut.preview", "mesma função cutKeysArgs(), no modo de prévia"],
  ["ae.keys.delay", "os argumentos saem de delayArgs(), que resolve a ordem e a origem"],
  ["ae.keys.delay.preview", "mesma função delayArgs(), no modo de prévia"],
  ["ae.comp.fast-edit", "os argumentos saem de fastEditArgs(), que dependem da operação escolhida"],
  ["ae.comp.fast-edit.preview", "mesma função fastEditArgs(), no modo de prévia"],
  ["ae.text.box", "a caixa de texto lê medidas do host antes de montar os argumentos"],
  ["ae.diagnostics.echo", "o payload é uma sonda gerada em tempo de execução"],
  ["ae.layer.list", "leitura sem argumentos: não há padrão do painel para verificar"],
  ["ae.keys.reverse", "inverter keys não tem opção: não há padrão do painel para verificar"],
  ["ae.keys.copy", "copiar não tem opção; as opções são da tela de colar, que é verificada"],
  [
    "ae.expression.loopout",
    "numKeyframes/duration/useDuration são derivados do modo de intervalo antes da chamada"
  ],
  ["ae.expression.smooth", "referenceTime é resolvido a partir do modo de referência escolhido"],
  ["ae.shape.library", "a posição da forma é o centro da composição, lido do contexto do host"]
]);

/**
 * Comandos cujo padrão é deliberadamente incompleto: o usuário precisa digitar
 * alguma coisa antes. São aceitos **apenas** se a tela recusar o botão pelo
 * mesmo campo — senão o usuário clicaria e receberia o erro do host.
 *
 * O par é (comando, [função de motivo, campo]).
 */
const PADRAO_EXIGE_ENTRADA = new Map([
  ["ae.3d.look-at", ["lookAtDisabledReason", "targetLayerName"]],
  ["ae.parallax.auto-focus", ["parallaxFullDisabledReason", "targetLayerName"]],
  ["ae.layer.parent", ["parentDisabledReason", "targetLayerIndex"]]
]);

/** `animateKinetic` -> `DEFAULT_ANIMATE_KINETIC` */
function nomeDoPadrao(chaveDeEstado) {
  return "DEFAULT_" + chaveDeEstado.replace(/([A-Z])/g, "_$1").toUpperCase();
}

/** Recorta um bloco equilibrando `{}` a partir da primeira chave. */
function recortarBloco(fonte, aPartirDe) {
  let profundidade = 0;
  for (let i = aPartirDe; i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    else if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(aPartirDe, i + 1);
    }
  }
  return null;
}

/**
 * Lê os `const DEFAULT_X: TDraft = { ... };` como objetos de verdade.
 *
 * O corpo é recortado equilibrando chaves, e não por expressão regular: há
 * padrões numa linha só (`= {};`) e padrões de várias, e uma regex que assume
 * uma das formas engole o bloco seguinte inteiro.
 */
function lerPadroes(fonte) {
  const padroes = new Map();
  const re = /^const (DEFAULT_[A-Z_0-9]+): [A-Za-z]+ = (?=\{)/gm;
  let m;
  while ((m = re.exec(fonte)) !== null) {
    const bruto = recortarBloco(fonte, re.lastIndex);
    if (bruto === null) continue;
    const corpo = bruto.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*\})/g, "$1");
    padroes.set(m[1], Function(`"use strict"; return (${corpo});`)());
  }
  return padroes;
}

/** Recorta o segundo argumento de `execute`, equilibrando chaves e parênteses. */
function recortarArgumento(fonte, aPartirDe) {
  let profundidade = 0;
  for (let i = aPartirDe; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === "{" || c === "(") profundidade += 1;
    else if (c === "}" || c === ")") {
      if (profundidade === 0) return fonte.slice(aPartirDe, i);
      profundidade -= 1;
    } else if (c === "," && profundidade === 0) return fonte.slice(aPartirDe, i);
  }
  return null;
}

/** `state.<chave>: <Tipo>Draft;` -> chave de estado por nome de tipo. */
function estadoPorTipo(fonte) {
  const mapa = new Map();
  for (const m of fonte.matchAll(/^ {2}(\w+): (\w+Draft);$/gm)) mapa.set(m[2], m[1]);
  return mapa;
}

/**
 * Apelidos locais que apontam para um draft, dentro da função que contém a
 * chamada. Cobre as duas formas usadas no painel: `const t = state.wave;` e o
 * parâmetro tipado `(client: Client, t: ParallaxFullDraft)`.
 */
function aliasesAntesDe(fonte, posicao, porTipo) {
  const trecho = fonte.slice(0, posicao);
  const inicio = Math.max(trecho.lastIndexOf("\nasync function "), trecho.lastIndexOf("\nfunction "));
  const corpo = trecho.slice(inicio < 0 ? 0 : inicio);

  const mapa = new Map();
  for (const m of corpo.matchAll(/const (\w+) = state\.(\w+);/g)) mapa.set(m[1], m[2]);
  for (const m of corpo.matchAll(/(\w+): (\w+Draft)\s*[,)]/g)) {
    const chave = porTipo.get(m[2]);
    if (chave) mapa.set(m[1], chave);
  }
  return mapa;
}

/* ------------------------------------------------------- ambiente falso */

class FakeProperty {
  constructor() {
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.value = [0, 0];
    this.keys = [];
    this.numKeys = 0;
  }
}

class FakeCompItem {
  constructor() {
    this.selectedLayers = [];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.duration = 5;
    this.workAreaStart = 0;
    this.workAreaDuration = 2;
    this.width = 1920;
    this.height = 1080;
    this.time = 0;
    this.numLayers = 0;
    this.activeCamera = null;
  }
  layer() {
    return null;
  }
}

const MODULOS = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/expression-templates.jsx",
  "src/keyframe-operations.jsx",
  "src/transform-math.jsx",
  "src/effect-operations.jsx",
  "src/rig-meta.jsx"
];

async function carregarHost() {
  const comp = new FakeCompItem();
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0", numItems: 0 },
    beginUndoGroup() {},
    endUndoGroup() {}
  };

  // A ordem de montagem vem do próprio build, e não de uma lista copiada: uma
  // lista à parte divergiria no primeiro comando novo.
  const ordem = await readFile(new URL("../../../scripts/build-extendscript.mjs", import.meta.url), "utf8");
  const comandos = ordem
    .split("\n")
    .map((l) => /"(commands\/[\w-]+\.jsx)"/.exec(l))
    .filter(Boolean)
    .map((m) => "src/" + m[1]);

  return loadHostModules([...MODULOS, ...comandos, "src/dispatch.jsx"], {
    app,
    CompItem: FakeCompItem,
    Property: FakeProperty,
    CameraLayer: class {},
    KeyframeEase: class {},
    PropertyType: { PROPERTY: 1, INDEXED_GROUP: 2 },
    PropertyValueType: { NO_VALUE: 0, OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, ThreeD: 4 },
    KeyframeInterpolationType: { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 },
    ParagraphJustification: { LEFT_JUSTIFY: 7415, CENTER_JUSTIFY: 7416, RIGHT_JUSTIFY: 7417 }
  });
}

function despachar(scope, comando, args) {
  return JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "def-1",
        command: comando,
        args,
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: {}
      })
    )
  );
}

/** Toda chamada do painel, já com os argumentos resolvidos quando possível. */
async function chamadasDoPainel() {
  const fonte = await readFile(MAIN, "utf8");
  const padroes = lerPadroes(fonte);
  const porTipo = estadoPorTipo(fonte);

  const estado = {};
  for (const [tipo, chave] of porTipo) {
    void tipo;
    const padrao = padroes.get(nomeDoPadrao(chave));
    if (padrao) estado[chave] = padrao;
  }

  const avaliadas = [];
  const semAvaliar = [];
  const re = /client\.execute(?:<[^>]*>)?\(\s*"([^"]+)"\s*,\s*/g;
  let m;
  while ((m = re.exec(fonte)) !== null) {
    const comando = m[1];
    const bruta = recortarArgumento(fonte, re.lastIndex);
    if (bruta === null) {
      semAvaliar.push(comando);
      continue;
    }

    let texto = bruta.replace(/\/\/[^\n]*/g, "").trim();
    for (const [alias, chave] of aliasesAntesDe(fonte, m.index, porTipo)) {
      texto = texto.replace(new RegExp(`\\.\\.\\.${alias}\\b`, "g"), `...state.${chave}`);
      texto = texto.replace(new RegExp(`\\b${alias}\\.`, "g"), `state.${chave}.`);
    }

    try {
      avaliadas.push({ comando, args: Function("state", `"use strict"; return (${texto});`)(estado) });
    } catch {
      semAvaliar.push(comando);
    }
  }

  return { fonte, avaliadas, semAvaliar };
}

test("nenhum argumento padrao do painel e recusado por ser invalido", async () => {
  const { fonte, avaliadas } = await chamadasDoPainel();
  const scope = await carregarHost();

  const recusados = [];
  for (const { comando, args } of avaliadas) {
    const resposta = despachar(scope, comando, args);
    if (resposta.ok !== false || resposta.error.code !== "INVALID_PRESET") continue;

    const excecao = PADRAO_EXIGE_ENTRADA.get(comando);
    if (excecao) {
      // A exceção é verificada, não apenas declarada: a tela precisa mesmo
      // recusar o botão pelo campo que o host reclamou.
      const [nomeDaFuncao, campo] = excecao;
      const inicio = fonte.indexOf(`function ${nomeDaFuncao}(`);
      assert.ok(inicio >= 0, `${nomeDaFuncao} nao existe mais no painel`);
      const corpo = recortarBloco(fonte, fonte.indexOf("{", inicio));
      assert.ok(
        corpo !== null && corpo.includes(campo),
        `${comando}: o padrao e invalido e ${nomeDaFuncao} nao checa ${campo}`
      );
      assert.equal(
        resposta.error.details?.field,
        campo,
        `${comando}: o host reclamou de outro campo que nao ${campo}`
      );
      continue;
    }

    recusados.push(`${comando}: ${resposta.error.message} (${JSON.stringify(resposta.error.details)})`);
  }

  assert.deepEqual(recusados, [], "o painel manda argumentos que o host recusa");
});

test("toda chamada do painel e avaliada ou declarada como nao avaliavel", async () => {
  // Sem isto o teste teria ponto cego: uma chamada que o extrator nao consegue
  // resolver sairia da conta em silencio, e as mais dificeis de avaliar sao
  // justamente as mais faceis de errar.
  const { semAvaliar } = await chamadasDoPainel();

  const naoDeclaradas = [...new Set(semAvaliar)].filter((c) => !NAO_AVALIAVEL.has(c));

  assert.deepEqual(
    naoDeclaradas,
    [],
    "estas chamadas nao foram avaliadas nem declaradas em NAO_AVALIAVEL"
  );
});

test("as duas allowlists tem motivo escrito e continuam em uso", async () => {
  const { fonte } = await chamadasDoPainel();

  for (const [comando, motivo] of NAO_AVALIAVEL) {
    assert.ok(fonte.includes(`"${comando}"`), `${comando} esta na allowlist mas o painel nao o executa`);
    assert.ok(motivo.trim().length >= 20, `${comando} precisa de um motivo escrito`);
  }
  for (const [comando, [nomeDaFuncao]] of PADRAO_EXIGE_ENTRADA) {
    assert.ok(fonte.includes(`"${comando}"`), `${comando} esta na allowlist mas o painel nao o executa`);
    assert.ok(
      fonte.includes(`function ${nomeDaFuncao}(`),
      `${nomeDaFuncao} nao existe mais; a excecao de ${comando} ficou sem guarda`
    );
  }
});
