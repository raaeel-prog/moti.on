/**
 * `ae.style.neon` — MASTER_BUILD_SPEC §13.
 *
 * O caso que dá nome a estes testes é o quarto: **parâmetro de Glow ausente**.
 * `docs/research/after-effects-neon-glow-and-text-stroke.md` registra que a
 * Adobe documenta o matchName do efeito e nenhum parâmetro dele, então
 * `ADBE Glo2-0003` é palpite. O comando existe com uma guarda por causa disso, e
 * o teste prova que a guarda pega — sem ele, uma instalação com outro matchName
 * produziria neon sem brilho, em silêncio.
 *
 * O dublê de efeito aqui expõe os filhos **por índice**, e não só por chave,
 * porque é assim que o comando varre. Um dublê que só respondesse por chave
 * concordaria com uma implementação que escreve às cegas.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };

/** Parâmetros que cada efeito expõe nesta instalação simulada. */
const PARAMS = {
  "ADBE Glo2": ["ADBE Glo2-0003", "ADBE Glo2-0004", "ADBE Glo2-0007", "ADBE Glo2-0012"]
};

class FakeProperty {
  constructor(matchName, valor) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.value = valor;
    this.numKeys = 0;
    this.escritas = 0;
  }
  removeKey() {}
  setValue(v) {
    this.value = v;
    this.escritas += 1;
  }
}

class FakeEffect {
  constructor(matchName, lista, parametros) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.lista = lista ?? null;
    this.filhos = (parametros ?? PARAMS[matchName] ?? []).map((mn) => new FakeProperty(mn, 0));
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  remove() {
    if (this.lista) {
      const i = this.lista.filhos.indexOf(this);
      if (i >= 0) this.lista.filhos.splice(i, 1);
    }
  }
}

class FakeParade {
  /**
   * @param {string[]} indisponiveis efeitos que esta instalação não tem
   * @param {string[]|null} parametros sobrescreve os parâmetros do Glow criado
   */
  constructor(indisponiveis = [], parametros = null) {
    this.filhos = [];
    this.indisponiveis = indisponiveis;
    this.parametros = parametros;
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.matchName === chave) ?? null;
  }
  canAddProperty(matchName) {
    return (
      !this.indisponiveis.includes(matchName) &&
      Object.prototype.hasOwnProperty.call(PARAMS, matchName)
    );
  }
  addProperty(matchName) {
    if (!this.canAddProperty(matchName)) throw new Error(`efeito indisponivel: ${matchName}`);
    const efeito = new FakeEffect(matchName, this, this.parametros);
    this.filhos.push(efeito);
    return efeito;
  }
}

/** `sourceText`: guarda um TextDocument e conta reatribuições. */
class FakeSourceText {
  constructor() {
    this.propertyType = PropertyType.PROPERTY;
    this.matchName = "ADBE Text Document";
    this.documento = {
      fillColor: [1, 1, 1],
      applyFill: true,
      strokeColor: [0, 0, 0],
      strokeWidth: 0,
      applyStroke: false,
      strokeOverFill: true
    };
    this.escritas = 0;
    /** Quando > 0, decrementa e lança: simula recusa do host no meio da escrita. */
    this.falhaEm = 0;
  }
  get value() {
    // Cópia: mutar o que sai daqui não pode alterar a camada, que é justamente
    // a regra que obriga o comando a reatribuir.
    return { ...this.documento };
  }
  setValue(v) {
    if (this.falhaEm > 0) {
      this.falhaEm -= 1;
      if (this.falhaEm === 0) throw new Error("o host recusou o texto");
    }
    this.documento = { ...v };
    this.escritas += 1;
  }
}

class FakeLayer {
  constructor(opcoes = {}) {
    this.name = opcoes.name ?? "Camada";
    this.index = opcoes.index ?? 1;
    this.efeitos = new FakeParade(opcoes.indisponiveis ?? [], opcoes.parametros ?? null);
    this.sourceText = opcoes.comTexto === false ? null : new FakeSourceText();
    this.textoGrupo = this.sourceText
      ? { property: (n) => (n === "ADBE Text Document" ? this.sourceText : null) }
      : null;
  }
  property(matchName) {
    if (matchName === "ADBE Effect Parade") return this.efeitos;
    if (matchName === "ADBE Text Properties") return this.textoGrupo;
    return null;
  }
}

class FakeCompItem {
  constructor(camadas) {
    this.selectedLayers = camadas;
    this.selectedProperties = [];
    this.numLayers = camadas.length;
    this.duration = 10;
    this.frameDuration = 1 / 25;
    this.time = 0;
  }
}

async function fixture(comp) {
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  return loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx",
      "src/effect-operations.jsx",
      "src/commands/style-neon.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType: { OneD: 1, COLOR: 6 },
      KeyframeEase: class {},
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 }
    }
  );
}

const BASE = {
  mode: "editable",
  coreColor: [1, 1, 1],
  glowColor: [0.2, 0.6, 1],
  strokeWidth: 4,
  glowRadius: 40,
  intensity: 2
};

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "neon-1",
    command: "ae.style.neon",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

async function aplica(comp, args = BASE) {
  const scope = await fixture(comp);
  return JSON.parse(scope.MotionAE.dispatch(request(args)));
}

test("nucleo e stroke sao escritos reatribuindo sourceText, e nao mutando o documento", async () => {
  const camada = new FakeLayer();
  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.sourceText.escritas, 1, "o comando precisa reatribuir sourceText");
  assert.deepEqual(camada.sourceText.documento.fillColor, [1, 1, 1]);
  assert.deepEqual(camada.sourceText.documento.strokeColor, [0.2, 0.6, 1]);
  assert.equal(camada.sourceText.documento.strokeWidth, 4);
  assert.equal(camada.sourceText.documento.applyStroke, true);
  assert.equal(
    camada.sourceText.documento.strokeOverFill,
    false,
    "no neon o nucleo fica por cima do contorno"
  );
});

test("o glow nativo entra como efeito gerenciado, com raio e intensidade escritos", async () => {
  const camada = new FakeLayer();
  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(camada.efeitos.numProperties, 1);
  const glow = camada.efeitos.property(1);
  assert.equal(glow.matchName, "ADBE Glo2");
  assert.equal(glow.property("ADBE Glo2-0003").value, 40, "raio");
  assert.equal(glow.property("ADBE Glo2-0004").value, 2, "intensidade");
  assert.deepEqual(glow.property("ADBE Glo2-0012").value, [0.2, 0.6, 1], "Color A");
});

test("parametro de glow ausente falha nomeando o parametro, e nao vira neon sem brilho", async () => {
  // O caso que a pesquisa tornou obrigatorio: os matchNames de parametro nao
  // tem fonte primaria, entao uma instalacao pode expor outros.
  const camada = new FakeLayer({ parametros: ["ADBE Glo2-9999"] });
  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  // O dispatcher descarta a mensagem de qualquer excecao e colapsa o codigo em
  // HOST_OPERATION_FAILED; o diagnostico util viaja pelos warnings, que ele
  // preserva. Este teste fixa esse caminho — se alguem voltar a lancar com
  // codigo proprio, o nome do parametro some da resposta.
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  const nomeado = resposta.warnings.find((w) => w.code === "NEON_GLOW_PARAM_MISSING");
  assert.ok(nomeado, "a resposta precisa dizer qual parametro faltou: " + JSON.stringify(resposta.warnings));
  assert.equal(nomeado.details.parameter, "ADBE Glo2-0003");
  assert.equal(
    camada.efeitos.numProperties,
    0,
    "o efeito criado precisa sumir no rollback, sem deixar um Glow inerte"
  );
});

test("camada sem texto recebe o glow e um aviso, em vez de derrubar a operacao", async () => {
  const comTexto = new FakeLayer({ name: "Texto" });
  const semTexto = new FakeLayer({ name: "Shape", comTexto: false });

  const resposta = await aplica(new FakeCompItem([comTexto, semTexto]));

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.applied, 2);
  assert.equal(resposta.data.withoutText, 1);
  assert.equal(resposta.warnings.length, 1);
  assert.equal(resposta.warnings[0].code, "NEON_CORE_SKIPPED");
  assert.equal(semTexto.efeitos.numProperties, 1, "a camada sem texto ainda ganha o glow");
});

test("um Glow do usuario na camada bloqueia em vez de ser sobrescrito", async () => {
  const camada = new FakeLayer();
  camada.efeitos.addProperty("ADBE Glo2"); // nome padrao, sem o prefixo de rig

  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "TRACK_CONFLICT");
  assert.equal(camada.efeitos.numProperties, 1, "nem empilhou nem apagou o do usuario");
});

test("instalacao sem o efeito Glow e recusada no preflight", async () => {
  const camada = new FakeLayer({ indisponiveis: ["ADBE Glo2"] });

  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
  assert.equal(camada.sourceText.escritas, 0, "o preflight nao pode ter tocado no texto");
});

test("reaplicar reusa o glow gerenciado em vez de empilhar um segundo", async () => {
  const camada = new FakeLayer();
  const comp = new FakeCompItem([camada]);

  await aplica(comp);
  const segunda = await aplica(comp, { ...BASE, glowRadius: 90 });

  assert.equal(segunda.ok, true, JSON.stringify(segunda));
  assert.equal(camada.efeitos.numProperties, 1, "um Glow, nao dois");
  assert.equal(camada.efeitos.property(1).property("ADBE Glo2-0003").value, 90);
});

test("falha depois da escrita do texto devolve o documento original", async () => {
  const camada = new FakeLayer({ parametros: ["ADBE Glo2-9999"] });
  const antes = { ...camada.sourceText.documento };

  const resposta = await aplica(new FakeCompItem([camada]));

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.ok(
    resposta.warnings.some((w) => w.code === "NEON_GLOW_PARAM_MISSING"),
    "o teste precisa falhar pelo motivo certo, e nao por o comando nao existir"
  );
  assert.deepEqual(
    camada.sourceText.documento,
    antes,
    "o rollback precisa devolver o TextDocument inteiro"
  );
});

test("argumentos invalidos sao recusados no preflight, sem tocar no projeto", async () => {
  const camada = new FakeLayer();
  const comp = new FakeCompItem([camada]);

  for (const args of [
    { ...BASE, mode: "brilhoso" },
    { ...BASE, strokeWidth: -1 },
    { ...BASE, strokeWidth: 1001 },
    { ...BASE, coreColor: [1, 1] },
    { ...BASE, glowColor: [1, 1, 2] },
    { ...BASE, intensity: 101 },
    { ...BASE, extra: 1 },
    { mode: "editable" }
  ]) {
    const resposta = await aplica(comp, args);
    assert.equal(resposta.ok, false, JSON.stringify(args));
    assert.equal(resposta.error.code, "INVALID_PRESET", JSON.stringify(args));
  }
  assert.equal(camada.sourceText.escritas, 0);
  assert.equal(camada.efeitos.numProperties, 0);
});

test("selecao vazia e recusada com NO_SELECTION", async () => {
  const resposta = await aplica(new FakeCompItem([]));

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "NO_SELECTION");
});

test("os padroes do painel sao aceitos pelo host", async () => {
  // `padroes-aceitos.test.mjs` prova isso para todas as telas cujos argumentos
  // ele consegue avaliar estaticamente, e declara esta como excecao porque as
  // cores passam por `hexToChannels()`. A garantia perdida la e reposta aqui,
  // com os mesmos valores de DEFAULT_NEON convertidos a mao.
  const camada = new FakeLayer();
  const resposta = await aplica(new FakeCompItem([camada]), {
    mode: "editable",
    coreColor: [1, 1, 1], // #ffffff
    glowColor: [0x33 / 255, 0xcc / 255, 1], // #33ccff
    strokeWidth: 4,
    glowRadius: 40,
    intensity: 2
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
});
