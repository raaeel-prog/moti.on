/**
 * `ae.audio.beat` — sincroniza a propriedade com a batida da música.
 *
 * O caso que dá nome a estes testes é o terceiro: **nome traduzido**. A
 * referência que circula na internet crava `thisComp.layer("Audio Amplitude")`
 * e `.effect("Both Channels")` — os nomes em inglês. Num After Effects
 * traduzido a expressão apontaria para uma camada que não existe, e falharia
 * sem dizer por quê. Este comando acha a camada por **estrutura** e lê o nome
 * real, então o teste com nomes em português tem que passar igual.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./grouped-host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/effect-operations.jsx",
  "src/keyframe-operations.jsx",
  "src/expression-templates.jsx",
  "src/live-controls.jsx",
  "src/live-preset.jsx",
  "src/quick-effects.jsx",
  "src/menu-command.jsx",
  "src/commands/audio-beat.jsx",
  "src/dispatch.jsx"
];

const PropertyType = { PROPERTY: 1, GROUP: 2, INDEXED_GROUP: 3 };
const PropertyValueType = { OneD: 5, TwoD: 4, ThreeD: 2, COLOR: 6 };

class FakeParam {
  constructor(matchName = "") {
    this.matchName = matchName;
    this.value = 0;
    this.numKeys = 0;
    this.keys = [];
    this.canSetExpression = false;
  }
  setValue(v) {
    this.value = v;
  }
  keyValue(k) {
    return this.keys[k - 1] ?? this.value;
  }
  removeKey() {}
  get isDropdownEffect() {
    return this.matchName === "ADBE Dropdown Control";
  }
  setPropertyParameters(items) {
    this.items = items;
    return this;
  }
}

class FakeEffect {
  constructor(matchName, parade, nome) {
    this.matchName = matchName;
    this.name = nome ?? matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.parade = parade;
    this.param = new FakeParam(matchName);
  }
  get propertyIndex() {
    return this.parade.filhos.indexOf(this) + 1;
  }
  get numProperties() {
    return 1;
  }
  property(chave) {
    return chave === 1 || chave === "ADBE Slider Control-0001" ? this.param : null;
  }
  remove() {
    const i = this.parade.filhos.indexOf(this);
    if (i >= 0) this.parade.filhos.splice(i, 1);
  }
}

class FakeParade {
  constructor(nomesIniciais = []) {
    this.filhos = [];
    for (const nome of nomesIniciais) {
      const effect=new FakeEffect("ADBE Slider Control", this, nome);
      effect.param.keys=[0,100];effect.param.numKeys=2;
      this.filhos.push(effect);
    }
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((f) => f.name === chave) ?? null;
  }
  canAddProperty() {
    return true;
  }
  addProperty(matchName) {
    const efeito = new FakeEffect(matchName, this);
    this.filhos.push(efeito);
    return efeito;
  }
}

class FakeLayer {
  constructor(nome, opcoes = {}) {
    this.name = nome;
    this.parentProperty = null;
    this.efeitos = new FakeParade(opcoes.sliders ?? []);
    // `hasAudio` é como o host distingue a música das demais camadas. Sólidos,
    // nulos e a própria camada de amplitude respondem false.
    this.hasAudio = opcoes.hasAudio === true;
    this.selected = opcoes.selected === true;
    this.comp = null;
    this.removida = false;
    // Uma camada não-amplitude pode ter efeitos que não são slider.
    if (opcoes.efeitoAlheio) {
      const alheio = new FakeEffect("ADBE Gaussian Blur 2", this.efeitos, "Desfoque");
      this.efeitos.filhos.push(alheio);
    }
  }
  property(matchName) {
    return matchName === "ADBE Effect Parade" ? this.efeitos : null;
  }
  get controles() {
    return this.efeitos.filhos.map((f) => f.name);
  }
  remove() {
    this.removida = true;
    if (this.comp) {
      const i = this.comp.camadas.indexOf(this);
      if (i >= 0) this.comp.camadas.splice(i, 1);
    }
  }
}

class FakeProperty {
  constructor(camada, nome = "Opacidade", matchName = "ADBE Opacity") {
    this.name = nome;
    this.matchName = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canSetExpression = true;
    this.numKeys = 0;
    this.selected = true;
    this.expressionError = "";
    this._expression = "";
    this._expressionEnabled = false;
    this.parentProperty = { name: "Transform", parentProperty: camada };
  }
  get expression() {
    return this._expression;
  }
  set expression(value) {
    this._expression = value;
  }
  get expressionEnabled() {
    return this._expressionEnabled;
  }
  set expressionEnabled(value) {
    this._expressionEnabled = value;
  }
}

class FakeCompItem {
  constructor(camadas, selecionadas) {
    this.camadas = camadas;
    for (const camada of camadas) camada.comp = this;
    this.selectedProperties = selecionadas;
    this.time = 0;
  }
  get numLayers() {
    return this.camadas.length;
  }
  layer(i) {
    return this.camadas[i - 1] ?? null;
  }
  get selectedLayers() {
    return this.camadas.filter((c) => c.selected === true);
  }
}

/**
 * Ambiente com o menu do After Effects.
 *
 * `menu` descreve qual instalação estamos simulando:
 * - `nomesConhecidos`: quais textos de menu resolvem (o resto devolve 0, como o
 *   AE faz de verdade);
 * - `aoExecutar`: o que o assistente produz. `null` simula o comando que roda e
 *   não cria nada, que é o caso perigoso — sem verificação, o host reportaria
 *   sucesso sobre uma composição intacta.
 */
async function aplica(comp, menu = {}, argsPersonalizados = null) {
  const nomesConhecidos = menu.nomesConhecidos ?? [];
  const registro = { buscados: [], executados: [], selecaoNoDisparo: null };

  const app = {
    version: "26.3x87",
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {},
    findMenuCommandId(nome) {
      registro.buscados.push(nome);
      // O After Effects devolve 0 para menu inexistente — inclusive quando o
      // texto está no idioma errado. É esse zero que o host usa como guarda.
      return nomesConhecidos.indexOf(nome) >= 0 ? 4821 : 0;
    },
    executeCommand(id) {
      registro.executados.push(id);
      registro.selecaoNoDisparo = comp.selectedLayers.map((c) => c.name);
      if (menu.aoExecutar) menu.aoExecutar(comp);
    }
  };

  const scope = await loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    Property: FakeProperty,
    PropertyType,
    PropertyValueType
  });
  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "beat-1",
        command: "ae.audio.beat",
        args: argsPersonalizados ?? { mode: 1, shakeFreq: 10, shakeAmp: 30 },
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: {}
      })
    )
  );
  resposta.__menu = registro;
  return resposta;
}

/** Composição com camada de amplitude estéreo e uma camada alvo. */
function cena(nomesDosSliders = ["Left Channel", "Right Channel", "Both Channels"]) {
  const amplitude = new FakeLayer("Audio Amplitude", { sliders: nomesDosSliders });
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  return { comp: new FakeCompItem([amplitude, alvo], [propriedade]), amplitude, alvo, propriedade };
}

test("liga a propriedade na camada de amplitude e cria os sete controles do Beat", async () => {
  const { comp, alvo, propriedade } = cena();

  const resposta = await aplica(comp);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(alvo.controles, ["Moti.on · Beat"]);
  assert.deepEqual(alvo.efeitos.filhos[0].params.map(p => p.name),
    ["Beat Min", "Beat Max", "Modo", "Bump Min (%)", "Bump Max (%)", "Shake Freq (fps)", "Shake Amp"]);
  assert.match(propriedade.expression, /thisComp\.layer\("Audio Amplitude"\)/);
  assert.equal(propriedade.expressionEnabled, true);
});

test("estereo usa o terceiro slider, que e o de ambos os canais", async () => {
  const { comp, propriedade } = cena();

  await aplica(comp);

  assert.match(propriedade.expression, /effect\("Both Channels"\)\(1\)/);
  assert.ok(
    propriedade.expression.indexOf("Left Channel") < 0,
    "não pode ligar num canal só quando existe o de ambos"
  );
});

test("nome traduzido funciona igual: nada e cravado em ingles", async () => {
  // O defeito que este teste existe para impedir. Num After Effects em
  // português a camada e os sliders nascem com outros nomes, e a referência
  // canônica da internet apontaria para uma camada inexistente.
  const { comp, propriedade } = cena(["Canal esquerdo", "Canal direito", "Ambos os canais"]);
  comp.camadas[0].name = "Amplitude do áudio";

  const resposta = await aplica(comp);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));

  // O acento sai escapado como `\u00e1`, e isso é correto: o bundle do host é
  // ASCII puro, e `expressionStringLiteral` garante que um nome acentuado
  // atravesse a ponte sem depender da codificação do arquivo. O motor de
  // expressão do After Effects resolve o escape na leitura.
  assert.match(propriedade.expression, /thisComp\.layer\("Amplitude do \\u00e1udio"\)/);
  assert.match(propriedade.expression, /effect\("Ambos os canais"\)\(1\)/);
  assert.ok(
    propriedade.expression.indexOf("Audio Amplitude") < 0,
    "não pode ter sobrado nome em inglês cravado"
  );
});

test("mono usa o unico slider disponivel", async () => {
  const { comp, propriedade } = cena(["Both Channels"]);

  const resposta = await aplica(comp);

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.match(propriedade.expression, /effect\("Both Channels"\)\(1\)/);
});

test("sem camada de audio nenhuma, recusa pedindo a musica", async () => {
  // Não cai para uma oscilação por BPM: trocar batida real por senoide sem
  // avisar seria entregar outra coisa com o mesmo nome. E a frase mudou de
  // assunto: não adianta mandar rodar o assistente numa composição que não tem
  // áudio para converter.
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  const comp = new FakeCompItem([alvo], [propriedade]);

  const resposta = await aplica(comp, { nomesConhecidos: ["Convert Audio to Keyframes"] });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
  assert.match(resposta.error.message, /camada de audio/);
  assert.equal(propriedade.expression, "");
  assert.deepEqual(alvo.controles, [], "nada pode ter sido criado");
  assert.deepEqual(resposta.__menu.executados, [], "sem áudio, nem se tenta o assistente");
});

test("camada com efeito alheio nao e confundida com amplitude", async () => {
  // O critério é "todos os efeitos são slider". Uma camada com desfoque mais
  // três sliders não é a camada que o assistente gerou.
  const falsa = new FakeLayer("Fundo", {
    sliders: ["A", "B", "C"],
    efeitoAlheio: true
  });
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  const comp = new FakeCompItem([falsa, alvo], [propriedade]);

  const resposta = await aplica(comp);

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
});

test("os limiares entram clampados na expressao, para nao dividir por zero", async () => {
  const { comp, propriedade } = cena();

  await aplica(comp);

  assert.match(
    propriedade.expression,
    /bMin = Math\.min\(beatMin, beatMax - 0\.001\)/,
    "bMin protegido para não superar bMax"
  );
  assert.match(
    propriedade.expression,
    /linear\(beat, bMin, bMax, bumpMin, bumpMax\) \/ 100/
  );
});

test("selecao sem propriedade que aceite expressao e recusada", async () => {
  const amplitude = new FakeLayer("Audio Amplitude", {
    sliders: ["Left Channel", "Right Channel", "Both Channels"]
  });
  const comp = new FakeCompItem([amplitude], []);

  const resposta = await aplica(comp);

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "NO_SELECTION");
});

/**
 * ## Conversão automática do áudio
 *
 * O comando passou a rodar `Convert Audio to Keyframes` sozinho quando não há
 * camada de amplitude. Os testes abaixo cobrem o que essa automação pode
 * quebrar — e cada um corresponde a uma forma concreta de estragar o projeto
 * de alguém.
 */

/** Simula o assistente: cria a camada de amplitude estéreo na composição. */
function assistenteCria(comp) {
  const amplitude = new FakeLayer("Audio Amplitude", {
    sliders: ["Left Channel", "Right Channel", "Both Channels"]
  });
  amplitude.comp = comp;
  comp.camadas.unshift(amplitude);
  return amplitude;
}

function cenaSemAmplitude(opcoesDoAudio = { hasAudio: true }) {
  const musica = new FakeLayer("trilha.mp3", opcoesDoAudio);
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  return { comp: new FakeCompItem([musica, alvo], [propriedade]), musica, alvo, propriedade };
}

/** Faz o After Effects recusar a expressão — o caminho de falha real do comando. */
function recusaExpressao(propriedade) {
  Object.defineProperty(propriedade, "expression", {
    get() {
      return this._expression;
    },
    set(value) {
      this._expression = value;
      this.expressionError = "expression is bad";
    }
  });
}

test("sem camada de amplitude, o comando roda o assistente e liga a expressao", async () => {
  const { comp, propriedade, alvo } = cenaSemAmplitude();

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.createdAmplitudeLayer, true);
  assert.match(propriedade.expression, /thisComp\.layer\("Audio Amplitude"\)/);
  assert.match(propriedade.expression, /effect\("Both Channels"\)\(1\)/);
  assert.deepEqual(alvo.controles, ["Moti.on · Beat"]);
  assert.deepEqual(alvo.efeitos.filhos[0].params.map(p => p.name),
    ["Beat Min", "Beat Max", "Modo", "Bump Min (%)", "Bump Max (%)", "Shake Freq (fps)", "Shake Amp"]);
});

test("o assistente e disparado com a camada de audio sozinha na selecao", async () => {
  // O comando de menu opera sobre a seleção. Disparar com a seleção errada
  // converteria a camada errada — ou nada.
  const { comp, musica, alvo } = cenaSemAmplitude();
  alvo.selected = true;

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(resposta.__menu.selecaoNoDisparo, [musica.name]);
});

test("a selecao original volta depois do assistente", async () => {
  // Não é cortesia: o Beat escreve nas propriedades que o usuário selecionou.
  // Sem devolver a seleção, o comando destruiria a própria entrada — e a
  // ferramenta seguinte acharia a camada errada.
  const { comp, alvo } = cenaSemAmplitude();
  alvo.selected = true;

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(
    comp.selectedLayers.map((c) => c.name),
    [alvo.name]
  );
});

test("o nome em portugues resolve num After Effects traduzido", async () => {
  // `findMenuCommandId` casa pelo texto TRADUZIDO. Uma lista só em inglês
  // deixaria o produto quebrado justamente para o público dele.
  const { comp, propriedade } = cenaSemAmplitude();

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Converter Áudio em Quadros-chave"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.match(propriedade.expression, /Audio Amplitude/);
});

test("nenhum nome resolvendo bloqueia ANTES de tocar no projeto", async () => {
  // After Effects num idioma que a lista não cobre. A regra da §872 é bloquear,
  // e não cravar um id numérico: um id que mudou de versão executa outro
  // comando de menu qualquer, dentro do projeto do usuário.
  const { comp, propriedade, alvo } = cenaSemAmplitude();

  const resposta = await aplica(comp, { nomesConhecidos: [] });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "CAPABILITY_UNAVAILABLE");
  assert.match(resposta.error.message, /Convert Audio to Keyframes/, "ensina o caminho manual");
  assert.deepEqual(resposta.__menu.executados, [], "nenhum id pode ter sido disparado");
  assert.equal(propriedade.expression, "");
  assert.deepEqual(alvo.controles, []);
  assert.equal(comp.numLayers, 2, "a composição continua intacta");
});

test("assistente que roda e nao cria nada nao vira sucesso", async () => {
  // `executeCommand` não devolve nada: só a observação prova que funcionou.
  // Sem a segunda varredura, o host reportaria sucesso sobre uma composição
  // inalterada, e o usuário procuraria uma animação que não existe.
  const { comp, propriedade } = cenaSemAmplitude();

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: () => {}
  });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.deepEqual(resposta.__menu.executados, [4821], "o comando chegou a ser disparado");
  assert.equal(propriedade.expression, "");

  // O dispatcher achata todo `motionCode` lançado em HOST_OPERATION_FAILED e
  // descarta a mensagem, então a frase acionável viaja pelo canal de warnings —
  // que sobrevive à falha. Sem isso o usuário veria só um código opaco.
  assert.equal(resposta.warnings[0].code, "BEAT_ASSISTANT_NO_OUTPUT");
  assert.match(resposta.warnings[0].message, /Convert Audio to Keyframes/);
});

test("com amplitude ja na comp, o assistente nao roda de novo", async () => {
  // Reaplicar o Beat não pode encher a composição de camadas de amplitude.
  const { comp, propriedade } = cena();

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.createdAmplitudeLayer, false);
  assert.deepEqual(resposta.__menu.executados, []);
  assert.match(propriedade.expression, /Audio Amplitude/);
});

test("duas camadas de audio sem selecao: recusa em vez de adivinhar", async () => {
  // Escolher sozinho custaria uma camada nova e uma animação ligada no som
  // errado. A frase diz quantas há e o que fazer.
  const a = new FakeLayer("trilha.mp3", { hasAudio: true });
  const b = new FakeLayer("narracao.wav", { hasAudio: true });
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  const comp = new FakeCompItem([a, b, alvo], [propriedade]);

  const resposta = await aplica(comp, { nomesConhecidos: ["Convert Audio to Keyframes"] });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.match(resposta.error.message, /2 camadas de audio/);
  assert.deepEqual(resposta.__menu.executados, []);
});

test("duas camadas de audio com uma selecionada: usa a selecionada", async () => {
  const a = new FakeLayer("trilha.mp3", { hasAudio: true });
  const b = new FakeLayer("narracao.wav", { hasAudio: true, selected: true });
  const alvo = new FakeLayer("Logo");
  const propriedade = new FakeProperty(alvo);
  const comp = new FakeCompItem([a, b, alvo], [propriedade]);

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.deepEqual(resposta.__menu.selecaoNoDisparo, [b.name]);
});

test("falha depois de converter remove a camada que este comando criou", async () => {
  // Rollback completo: se a expressão não puder ser escrita, a composição volta
  // ao que era — inclusive sem a camada de amplitude que acabou de nascer.
  const { comp, propriedade } = cenaSemAmplitude();
  recusaExpressao(propriedade);

  const resposta = await aplica(comp, {
    nomesConhecidos: ["Convert Audio to Keyframes"],
    aoExecutar: assistenteCria
  });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(
    comp.camadas.filter((c) => c.name === "Audio Amplitude").length,
    0,
    "a camada criada por este comando precisa sair no rollback"
  );
});

test("falha com amplitude preexistente NAO apaga a camada do usuario", async () => {
  // O outro lado da regra: uma amplitude que já estava lá é trabalho do
  // usuário, e não pode ser destruída por causa de uma falha nossa.
  const { comp, amplitude, propriedade } = cena();
  recusaExpressao(propriedade);

  const resposta = await aplica(comp, { nomesConhecidos: ["Convert Audio to Keyframes"] });

  assert.equal(resposta.ok, false, JSON.stringify(resposta));
  assert.equal(amplitude.removida, false, "essa camada nao e nossa para remover");
  assert.ok(comp.camadas.indexOf(amplitude) >= 0);
});

test("calcula beatMin e beatMax a partir da media e maximo dos keyframes de audio", async () => {
  const { comp, amplitude } = cena();
  // Simula keyframes reais no canal estéreo (Both Channels)
  const canalAmbos = amplitude.efeitos.property("Both Channels");
  assert.ok(canalAmbos);
  const slider = canalAmbos.property(1);
  slider.keys = [10, 20, 30, 40, 50, 100]; // media = 250 / 6 = 41.67, maximo = 100
  slider.numKeys = slider.keys.length;

  const resposta = await aplica(comp);
  assert.equal(resposta.ok, true, JSON.stringify(resposta));
  assert.equal(resposta.data.beatMin, 41.67);
  assert.equal(resposta.data.beatMax, 100);
});

test("aplica defaults inteligentes: opacidade pisca (0 a 110) e escala pulsa (100 a 120)", async () => {
  // Opacidade
  const amplitudeOp = new FakeLayer("Audio Amplitude", { sliders: ["Both Channels"] });
  const alvoOp = new FakeLayer("Texto");
  const propOpacidade = new FakeProperty(alvoOp, "Opacidade", "ADBE Opacity");
  const compOpacidade = new FakeCompItem([amplitudeOp, alvoOp], [propOpacidade]);
  const respOpacidade = await aplica(compOpacidade);
  assert.equal(respOpacidade.ok, true, JSON.stringify(respOpacidade));
  assert.equal(respOpacidade.data.bumpMin, 0);
  assert.equal(respOpacidade.data.bumpMax, 110);

  // Escala
  const amplitudeEsc = new FakeLayer("Audio Amplitude", { sliders: ["Both Channels"] });
  const alvoEsc = new FakeLayer("Texto2");
  const propEscala = new FakeProperty(alvoEsc, "Escala", "ADBE Scale");
  const compEscala = new FakeCompItem([amplitudeEsc, alvoEsc], [propEscala]);
  const respEscala = await aplica(compEscala);
  assert.equal(respEscala.ok, true, JSON.stringify(respEscala));
  assert.equal(respEscala.data.bumpMin, 100);
  assert.equal(respEscala.data.bumpMax, 120);
});

test("expressao gerada suporta tanto Bump (value*bump) quanto Shake (wiggle)", async () => {
  const { comp, propriedade } = cena();
  await aplica(comp);

  assert.match(
    propriedade.expression,
    /\(mod == 1\) \? \(base \* bump\) : wiggle\(freq, shake\);/
  );
  assert.match(
    propriedade.expression,
    /var shake = linear\(beat, bMin, bMax, 0, amp\);/
  );
  assert.match(
    propriedade.expression,
    /var src = thisComp\.layer\("Audio Amplitude"\);/
  );
});

test("reaplicar Beat em propriedade que ja tem Beat atualiza o mesmo grupo sem remover controles", async () => {
  const { comp, propriedade, alvo } = cena();

  // Primeira aplicacao
  const resp1 = await aplica(comp);
  assert.equal(resp1.ok, true, JSON.stringify(resp1));
  assert.equal(alvo.efeitos.filhos[0].numProperties, 7);

  // Segunda aplicacao na mesma propriedade
  const resp2 = await aplica(comp);
  assert.equal(resp2.ok, true, JSON.stringify(resp2));
  assert.equal(alvo.efeitos.filhos[0].numProperties, 7, "os sete parâmetros permanecem editáveis");
  assert.equal(alvo.controles.length, 1, "reaplicar não duplica o grupo");
  assert.match(propriedade.expression, /ae\.audio\.beat/);
});

test("reaplicar Beat sobre expressao legada de Beat atualiza sem conflito", async () => {
  const { comp, propriedade, alvo } = cena();

  // Expressao legada com cabecalho Beat
  propriedade.expression = "// Moti.on expression: ae.audio.beat\nvar ctl = thisLayer;\nvar intensidade = ctl.effect(\"Intensidade da Batida\")(1);\nrepouso + normalizado * pico * (intensidade / 100);";

  const resp = await aplica(comp);
  assert.equal(resp.ok, true, JSON.stringify(resp));
  assert.match(propriedade.expression, /beatMin/);
  assert.equal(alvo.efeitos.filhos[0].numProperties, 7);
});

test("sliders estáticos e contagens arbitrárias não são confundidos com áudio", async()=>{
  for(const count of [1,2,3,7]){
    const target=new FakeLayer("Logo"),property=new FakeProperty(target);
    const controller=new FakeLayer("Controller",{sliders:Array.from({length:count},(_,i)=>"Control "+i)});
    if(count===1||count===3)controller.efeitos.filhos.forEach(e=>{e.param.numKeys=0;e.param.keys=[];});
    const result=await aplica(new FakeCompItem([controller,target],[property]));
    assert.equal(result.ok,false);assert.equal(property.expression,"");assert.equal(target.controles.length,0);
  }
});
test("fontes ambíguas exigem seleção e nomes únicos",async()=>{
  const {comp,propriedade,amplitude}=cena();
  const second=new FakeLayer("Outra amplitude",{sliders:["Both Channels"]});comp.camadas.unshift(second);second.comp=comp;
  const denied=await aplica(comp);assert.equal(denied.error.code,"INVALID_SELECTION_TYPE");assert.equal(propriedade.expression,"");
  second.selected=true;
  const applied=await aplica(comp);assert.equal(applied.ok,true);assert.equal(applied.data.sourceLayer,"Outra amplitude");
  amplitude.name=second.name;
  const duplicate=await aplica(comp);assert.equal(duplicate.error.code,"INVALID_SELECTION_TYPE");
});
test("conflito é recusado antes da conversão de áudio",async()=>{
  const audio=new FakeLayer("Música",{hasAudio:true}),target=new FakeLayer("Logo"),property=new FakeProperty(target);
  property.expression="time*10";
  const result=await aplica(new FakeCompItem([audio,target],[property]),{nomesConhecidos:["Convert Audio to Keyframes"],aoExecutar:assistenteCria});
  assert.equal(result.error.code,"EXPRESSION_CONFLICT");assert.deepEqual(result.__menu.executados,[]);assert.equal(property.expression,"time*10");
});
test("falha na reaplicação restaura valores do mesmo grupo e preserva controles alheios",async()=>{
  const {comp,alvo,propriedade}=cena();assert.equal((await aplica(comp)).ok,true);
  const group=alvo.efeitos.filhos[0];group.property(1).setValue(17);
  const foreign=alvo.efeitos.addProperty("ADBE Slider Control");foreign.name="Intensidade da Batida pessoal";foreign.property(1).setValue(42);
  const before=propriedade.expression;propriedade.expressionError="forced failure";
  const result=await aplica(comp,{}, {mode:1,beatMin:2,beatMax:99});
  assert.equal(result.ok,false);assert.equal(alvo.efeitos.filhos[0],group);assert.equal(group.property(1).value,17);
  assert.equal(foreign.property(1).value,42);assert.equal(alvo.efeitos.numProperties,2);assert.equal(propriedade.expression,before);
});
test("fonte removida nunca redireciona silenciosamente para um índice diferente",async()=>{
  const {comp,propriedade}=cena();await aplica(comp);
  assert.doesNotMatch(propriedade.expression,/thisComp\.layer\(\d+\)|src\.effect\(\d+\)/);
});

