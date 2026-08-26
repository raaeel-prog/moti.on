import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/commands/layer-flip.jsx",
  "src/dispatch.jsx"
];

const MN = {
  transform: "ADBE Transform Group",
  anchorPoint: "ADBE Anchor Point",
  position: "ADBE Position",
  scale: "ADBE Scale",
  rotation: "ADBE Rotate Z"
};

class FakeProperty {
  constructor(valor) {
    this.value = valor;
  }

  setValue(valor) {
    this.value = valor;
  }
}

class FakeTransform {
  constructor({ anchor, position, scale, rotation }) {
    this.props = {
      [MN.anchorPoint]: new FakeProperty(anchor),
      [MN.position]: new FakeProperty(position),
      [MN.scale]: new FakeProperty(scale),
      [MN.rotation]: new FakeProperty(rotation)
    };
  }

  property(matchName) {
    return this.props[matchName] ?? null;
  }
}

class FakeLayer {
  constructor(comp, nome, opcoes = {}) {
    this.comp = comp;
    this.name = nome;
    this.selected = false;
    this.parent = null;
    this.threeDLayer = opcoes.threeD ?? false;
    this.rect = opcoes.rect ?? { top: -20, left: -40, width: 80, height: 40 };
    this.transform = new FakeTransform({
      anchor: opcoes.anchor ?? [0, 0],
      position: opcoes.position ?? [100, 100],
      scale: opcoes.scale ?? [100, 100],
      rotation: opcoes.rotation ?? 0
    });
  }

  get index() {
    return this.comp.camadas.indexOf(this) + 1;
  }

  property(matchName) {
    return matchName === MN.transform ? this.transform : null;
  }

  sourceRectAtTime() {
    return this.rect;
  }

  /** Atalhos de leitura, para os testes não repetirem a travessia. */
  get posicao() {
    return this.transform.property(MN.position).value;
  }

  get escala() {
    return this.transform.property(MN.scale).value;
  }

  get rotacao() {
    return this.transform.property(MN.rotation).value;
  }
}

class FakeTextLayer extends FakeLayer {}

class FakeCompItem {
  constructor() {
    this.camadas = [];
    this.width = 640;
    this.height = 360;
    this.time = 0;
  }

  get numLayers() {
    return this.camadas.length;
  }

  layer(indice) {
    return this.camadas[indice - 1] ?? null;
  }

  get selectedLayers() {
    return this.camadas.filter((camada) => camada.selected === true);
  }
}

function args(overrides = {}) {
  return {
    axis: "horizontal",
    pivot: "anchor",
    groupMode: "each",
    preserveTextReadability: false,
    ...overrides
  };
}

function request(commandArgs) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "flip-1",
    command: "ae.layer.flip",
    args: commandArgs,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { preserveSelection: true }
  });
}

async function fixture({ semComp = false } = {}) {
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: semComp ? null : comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    TextLayer: FakeTextLayer
  });
  return { scope, comp };
}

function camada(comp, nome, opcoes = {}, Classe = FakeLayer) {
  const nova = new Classe(comp, nome, opcoes);
  nova.selected = opcoes.selected ?? true;
  comp.camadas.push(nova);
  return nova;
}

function flip(scope, extras = {}) {
  return JSON.parse(scope.MotionAE.dispatch(request(args(extras))));
}

/** Comparação com tolerância: a matemática passa por seno e cosseno. */
function perto(recebido, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(recebido - esperado) <= tolerancia,
    `esperado ${esperado}, recebido ${recebido}`
  );
}

test("descriptor: espelhar de novo não é no-op, é a volta", async () => {
  const { scope } = await fixture();
  const descriptor = scope.MotionDescriptors["ae.layer.flip"];

  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.allowsNoopSuccess, false);
  assert.equal(descriptor.undoLabelKey, "undo.ae.layer.flip");
  // Transform puro: não lê nem escreve expressão.
  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp"]);
});

test("a ROTAÇÃO troca de sinal — o erro que passaria despercebido", async () => {
  // Uma reflexão não é só negar a escala. `M·T(p)·R(t)·S = T(Mp)·R(-t)·S'`.
  // Sem negar a rotação, uma camada rotacionada termina no lugar errado, e o
  // erro cresce com o ângulo — invisível em qualquer teste com rotação zero.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { position: [100, 50], rotation: 30, scale: [120, 80] });

  flip(scope, { axis: "horizontal", pivot: "compCenter" });

  perto(c.posicao[0], 2 * 320 - 100);
  perto(c.posicao[1], 50);
  assert.deepEqual(c.escala, [-120, 80]);
  assert.equal(c.rotacao, -30, "a rotação precisa trocar de sinal");
});

test("flip duplo devolve o estado inicial — o critério de aceite", async () => {
  for (const eixo of ["horizontal", "vertical"]) {
    for (const pivot of ["anchor", "compCenter", "selectionBounds"]) {
      const { scope, comp } = await fixture();
      const c = camada(comp, "A", {
        position: [137.5, 92.25],
        rotation: 37,
        scale: [140, 65],
        anchor: [11, -7]
      });
      const antes = {
        posicao: [...c.posicao],
        escala: [...c.escala],
        rotacao: c.rotacao
      };

      flip(scope, { axis: eixo, pivot });
      flip(scope, { axis: eixo, pivot });

      const rotulo = `${eixo}/${pivot}`;
      perto(c.posicao[0], antes.posicao[0], 1e-9);
      perto(c.posicao[1], antes.posicao[1], 1e-9);
      assert.deepEqual(c.escala, antes.escala, rotulo);
      assert.equal(c.rotacao, antes.rotacao, rotulo);
    }
  }
});

test("o eixo vertical mexe só na coordenada Y", async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { position: [100, 50], rotation: 15 });

  flip(scope, { axis: "vertical", pivot: "compCenter" });

  perto(c.posicao[0], 100, 0);
  perto(c.posicao[1], 2 * 180 - 50);
  assert.deepEqual(c.escala, [100, -100]);
  assert.equal(c.rotacao, -15);
});

test("pivô âncora deixa a camada parada e só espelha o conteúdo", async () => {
  // Sem pai, a âncora em espaço de composição É a própria posição, então
  // refletir em torno dela não move a camada.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { position: [123, 45], rotation: 20 });

  flip(scope, { pivot: "anchor" });

  assert.deepEqual(c.posicao, [123, 45]);
  assert.deepEqual(c.escala, [-100, 100]);
  assert.equal(c.rotacao, -20);
});

test("groupMode group usa um pivô só para toda a seleção", async () => {
  const { scope, comp } = await fixture();
  const a = camada(comp, "A", { position: [100, 100] });
  const b = camada(comp, "B", { position: [300, 100] });

  flip(scope, { pivot: "anchor", groupMode: "group" });

  // Pivô comum = média das posições = 200. A e B trocam de lado.
  perto(a.posicao[0], 300);
  perto(b.posicao[0], 100);
});

test("groupMode each espelha cada camada em torno da própria âncora", async () => {
  const { scope, comp } = await fixture();
  const a = camada(comp, "A", { position: [100, 100] });
  const b = camada(comp, "B", { position: [300, 100] });

  flip(scope, { pivot: "anchor", groupMode: "each" });

  assert.deepEqual(a.posicao, [100, 100], "cada uma fica no lugar");
  assert.deepEqual(b.posicao, [300, 100]);
  assert.deepEqual(a.escala, [-100, 100]);
});

test("selectionBounds projeta os quatro cantos, e não a diagonal", async () => {
  // Uma camada rotacionada tem bounding box alinhado ao eixo no espaço dela;
  // usar só dois cantos daria um centro errado depois da rotação.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    position: [200, 200],
    rotation: 90,
    anchor: [0, 0],
    rect: { top: 0, left: 0, width: 100, height: 40 }
  });

  flip(scope, { pivot: "selectionBounds" });

  // Rotacionada 90°, os cantos vão de (200,200) a (160,300): centro em x = 180.
  perto(c.posicao[0], 2 * 180 - 200);
});

test("texto com legibilidade preservada move mas não inverte os glifos", async () => {
  const { scope, comp } = await fixture();
  const t = camada(comp, "Titulo", { position: [100, 50], rotation: 12 }, FakeTextLayer);

  flip(scope, { pivot: "compCenter", preserveTextReadability: true });

  perto(t.posicao[0], 2 * 320 - 100);
  assert.deepEqual(t.escala, [100, 100], "a escala não pode inverter");
  assert.equal(t.rotacao, 12, "sem espelhar o conteúdo, a rotação fica");
});

test("texto com legibilidade preservada também volta ao aplicar duas vezes", async () => {
  const { scope, comp } = await fixture();
  const t = camada(comp, "Titulo", { position: [100, 50] }, FakeTextLayer);

  flip(scope, { pivot: "compCenter", preserveTextReadability: true });
  flip(scope, { pivot: "compCenter", preserveTextReadability: true });

  perto(t.posicao[0], 100);
});

test("camada com pai é recusada, não espelhada errado", async () => {
  // Com um pai rotacionado o eixo de espelhamento deixa de ser alinhado no
  // espaço do pai, e a fórmula não vale. Recusar é melhor que um resultado
  // silenciosamente errado.
  const { scope, comp } = await fixture();
  const pai = camada(comp, "PAI", { selected: false });
  const filha = camada(comp, "FILHA", { position: [100, 100] });
  filha.parent = pai;

  const resposta = flip(scope);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(filha.posicao, [100, 100], "nada pode ser escrito");
});

test("camada 3D é recusada", async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { threeD: true, position: [100, 100] });

  const resposta = flip(scope);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(c.posicao, [100, 100]);
});

test("uma falha no meio restaura posição, escala e rotação", async () => {
  const { scope, comp } = await fixture();
  const a = camada(comp, "A", { position: [100, 100], rotation: 10 });
  const b = camada(comp, "B", { position: [300, 100], rotation: 20 });

  b.transform.property(MN.position).setValue = () => {
    throw new Error("falha sintetica do host");
  };

  const resposta = flip(scope, { pivot: "compCenter" });

  assert.equal(resposta.ok, false);
  assert.deepEqual(a.posicao, [100, 100]);
  assert.deepEqual(a.escala, [100, 100]);
  assert.equal(a.rotacao, 10);
});

test("sem seleção e sem composição falham com códigos distintos", async () => {
  const semSelecao = await fixture();
  camada(semSelecao.comp, "A", { selected: false });
  assert.equal(flip(semSelecao.scope).error.code, "NO_SELECTION");

  const semComp = await fixture({ semComp: true });
  assert.equal(flip(semComp.scope).error.code, "NO_ACTIVE_COMP");
});

test("argumentos fora do contrato são recusados", async () => {
  const casos = [
    ["axis", { axis: "diagonal" }],
    ["pivot", { pivot: "centro" }],
    ["groupMode", { groupMode: "todos" }],
    ["preserveTextReadability", { preserveTextReadability: "sim" }],
    ["scaleMode", { scaleMode: "uniform" }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    const c = camada(comp, "A", { position: [100, 100] });

    const resposta = flip(scope, extras);
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.deepEqual(c.posicao, [100, 100]);
  }
});
