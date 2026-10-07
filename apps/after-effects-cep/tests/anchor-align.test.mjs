import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/transform-math.jsx",
  "src/commands/anchor-align.jsx",
  "src/dispatch.jsx"
];

const MN = {
  transform: "ADBE Transform Group",
  anchorPoint: "ADBE Anchor Point",
  position: "ADBE Position",
  scale: "ADBE Scale",
  rotation: "ADBE Rotate Z",
  orientation: "ADBE Orientation",
  rotateX: "ADBE Rotate X",
  rotateY: "ADBE Rotate Y"
};

/**
 * Propriedade de transform.
 *
 * Modela a regra do After Effects que derrubou o comando em host: `setValue`
 * levanta erro quando a propriedade tem keyframes. Uma propriedade animada só
 * aceita `setValueAtKey`. Sem isso o double aceitava um caminho que o host
 * recusa, e a falha aparecia como ROLLBACK_FAILED na tela.
 */
class FakeProperty {
  constructor(valor, chaves = []) {
    this.value = valor;
    this.chaves = chaves.map((v) => [...v]);
  }

  get numKeys() {
    return this.chaves.length;
  }

  setValue(valor) {
    if (this.chaves.length > 0) {
      throw new Error("Nao e possivel definir um valor em propriedade animada.");
    }
    this.value = valor;
  }

  keyValue(indice) {
    return this.chaves[indice - 1];
  }

  setValueAtKey(indice, valor) {
    this.chaves[indice - 1] = [...valor];
  }
}

class FakeTransform {
  constructor(opcoes) {
    const { anchor, position, scale, rotation, positionKeys, scaleKeys, rotationKeys } = opcoes;
    this.props = {
      [MN.anchorPoint]: new FakeProperty(anchor),
      [MN.position]: new FakeProperty(position, positionKeys),
      [MN.scale]: new FakeProperty(scale, scaleKeys),
      [MN.rotation]: new FakeProperty(rotation, rotationKeys)
    };
    // Camada 2D nao tem orientation nem rotacao em X e Y. A ausencia e o que a
    // matriz compartilhada trata como zero, e o double precisa reproduzi-la.
    if (opcoes.threeD) {
      this.props[MN.orientation] = new FakeProperty(opcoes.orientation ?? [0, 0, 0]);
      this.props[MN.rotateX] = new FakeProperty(opcoes.rotationX ?? 0);
      this.props[MN.rotateY] = new FakeProperty(opcoes.rotationY ?? 0);
    }
  }

  property(matchName) {
    return this.props[matchName] ?? null;
  }
}

class FakeLayer {
  constructor(comp, nome, opcoes = {}) {
    this.comp = comp;
    this.name = nome;
    this.selected = opcoes.selected ?? true;
    this.threeDLayer = opcoes.threeD ?? false;
    this.rect = opcoes.rect ?? { top: 0, left: 0, width: 100, height: 60 };
    this.semRect = opcoes.semRect ?? false;
    this.transform = new FakeTransform({
      anchor: opcoes.anchor ?? [0, 0],
      position: opcoes.position ?? [200, 150],
      scale: opcoes.scale ?? [100, 100],
      rotation: opcoes.rotation ?? 0,
      positionKeys: opcoes.positionKeys ?? [],
      scaleKeys: opcoes.scaleKeys ?? [],
      rotationKeys: opcoes.rotationKeys ?? [],
      threeD: this.threeDLayer,
      orientation: opcoes.orientation,
      rotationX: opcoes.rotationX,
      rotationY: opcoes.rotationY
    });
  }

  get index() {
    return this.comp.camadas.indexOf(this) + 1;
  }

  property(matchName) {
    return matchName === MN.transform ? this.transform : null;
  }

  sourceRectAtTime(tempo, includeExtents) {
    if (this.semRect) throw new Error("sem retangulo");
    this.ultimaLeitura = { tempo, includeExtents };
    return this.rect;
  }

  get ancora() {
    return this.transform.property(MN.anchorPoint).value;
  }

  get posicao() {
    return this.transform.property(MN.position).value;
  }
}

class FakeCompItem {
  constructor() {
    this.camadas = [];
    this.width = 640;
    this.height = 360;
    this.time = 1.5;
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
    gridPoint: "center",
    mode: "normal",
    boundsSource: "visual",
    timeMode: "currentTime",
    fixedTime: 0,
    includeExtents: false,
    preserveVisualPosition: true,
    randomSeed: 0,
    preview: false,
    ...overrides
  };
}

async function fixture({ semComp = false } = {}) {
  const comp = new FakeCompItem();
  const app = {
    version: "26.3x87",
    project: { activeItem: semComp ? null : comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(MODULES, { app, CompItem: FakeCompItem });
  return { scope, comp };
}

function camada(comp, nome, opcoes = {}) {
  const nova = new FakeLayer(comp, nome, opcoes);
  comp.camadas.push(nova);
  return nova;
}

function despacha(scope, command, commandArgs) {
  return JSON.parse(
    scope.MotionAE.dispatch(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "t-anchor",
        command,
        args: commandArgs,
        context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
        options: { preserveSelection: true }
      })
    )
  );
}

const alinha = (scope, extras = {}) => despacha(scope, "ae.anchor.align", args(extras));
const preve = (scope, extras = {}) =>
  despacha(scope, "ae.anchor.align.preview", args({ preview: true, ...extras }));

function perto(recebido, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(recebido - esperado) <= tolerancia,
    `esperado ${esperado}, recebido ${recebido}`
  );
}

test("os nove pontos caem onde a grade manda", async () => {
  const esperados = {
    topLeft: [10, 20],
    topCenter: [60, 20],
    topRight: [110, 20],
    midLeft: [10, 50],
    center: [60, 50],
    midRight: [110, 50],
    bottomLeft: [10, 80],
    bottomCenter: [60, 80],
    bottomRight: [110, 80]
  };

  for (const [ponto, esperado] of Object.entries(esperados)) {
    const { scope, comp } = await fixture();
    const c = camada(comp, "A", { rect: { top: 20, left: 10, width: 100, height: 60 } });

    assert.equal(alinha(scope, { gridPoint: ponto }).ok, true, ponto);
    assert.deepEqual(c.ancora, esperado, ponto);
  }
});

test("a compensação mantém a aparência com rotação e escala", async () => {
  // Este é o teste que importa. `posição' = posição + R·S·(A' − A)`; errar o
  // seno ou esquecer a escala move a camada, e nada levanta erro.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [0, 0],
    position: [200, 150],
    scale: [150, 80],
    rotation: 30
  });

  alinha(scope, { gridPoint: "bottomRight", preserveVisualPosition: true });

  // Δ âncora = [100, 60]; escala = [1.5, 0.8] → [150, 48]; rotação 30°.
  const cos = Math.cos((30 * Math.PI) / 180);
  const sin = Math.sin((30 * Math.PI) / 180);
  perto(c.posicao[0], 200 + 150 * cos - 48 * sin);
  perto(c.posicao[1], 150 + 150 * sin + 48 * cos);
  assert.deepEqual(c.ancora, [100, 60]);
});

test("sem preservação, a posição não é tocada", async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { position: [200, 150] });

  alinha(scope, { gridPoint: "bottomRight", preserveVisualPosition: false });

  assert.deepEqual(c.posicao, [200, 150]);
  assert.deepEqual(c.ancora, [100, 60]);
});

test("escala negativa entra na conta com o sinal", async () => {
  // Uma camada espelhada tem escala negativa. Tomar o módulo aqui empurraria a
  // camada para o lado errado, com o dobro do deslocamento.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [0, 0],
    position: [200, 150],
    scale: [-100, 100],
    rotation: 0
  });

  alinha(scope, { gridPoint: "topRight" });

  perto(c.posicao[0], 200 - 100);
  perto(c.posicao[1], 150);
});

test("reverse usa o ponto oposto em relação ao centro", async () => {
  const pares = [
    ["topLeft", [100, 60]],
    ["topCenter", [50, 60]],
    ["midLeft", [100, 30]],
    ["center", [50, 30]]
  ];

  for (const [pedido, esperado] of pares) {
    const { scope, comp } = await fixture();
    const c = camada(comp, "A", { rect: { top: 0, left: 0, width: 100, height: 60 } });

    alinha(scope, { gridPoint: pedido, mode: "reverse" });

    assert.deepEqual(c.ancora, esperado, pedido);
  }
});

test("random é reprodutível e espalha as camadas", async () => {
  // Sem misturar o índice da camada na semente, "aleatório" mandaria todas para
  // o mesmo canto — o que não é aleatório, é uniforme.
  const primeira = await fixture();
  for (const nome of ["a", "b", "c", "d", "e"]) camada(primeira.comp, nome);
  alinha(primeira.scope, { mode: "random", randomSeed: 7 });
  const rodada1 = primeira.comp.camadas.map((c) => c.ancora.join(","));

  const segunda = await fixture();
  for (const nome of ["a", "b", "c", "d", "e"]) camada(segunda.comp, nome);
  alinha(segunda.scope, { mode: "random", randomSeed: 7 });
  const rodada2 = segunda.comp.camadas.map((c) => c.ancora.join(","));

  assert.deepEqual(rodada1, rodada2, "a mesma semente precisa dar o mesmo resultado");
  assert.ok(new Set(rodada1).size > 1, "cinco camadas não podem cair todas no mesmo ponto");

  const terceira = await fixture();
  for (const nome of ["a", "b", "c", "d", "e"]) camada(terceira.comp, nome);
  alinha(terceira.scope, { mode: "random", randomSeed: 8 });
  assert.notDeepEqual(
    terceira.comp.camadas.map((c) => c.ancora.join(",")),
    rodada1,
    "sementes diferentes precisam divergir"
  );
});

test("o preview não escreve e descreve o mesmo plano do apply", async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { rect: { top: 0, left: 0, width: 100, height: 60 } });

  const previsto = preve(scope, { gridPoint: "bottomRight" });

  assert.equal(previsto.ok, true);
  assert.equal(previsto.data.targetCount, 1);
  assert.equal(previsto.data.changedCount, 1);
  assert.deepEqual(previsto.data.targets[0].anchorAfter, [100, 60]);
  assert.deepEqual(c.ancora, [0, 0], "preview não pode escrever");

  alinha(scope, { gridPoint: "bottomRight" });
  assert.deepEqual(c.ancora, previsto.data.targets[0].anchorAfter);
});

test("o tempo fixo é o que chega ao sourceRectAtTime", async () => {
  const corrente = await fixture();
  const a = camada(corrente.comp, "A");
  alinha(corrente.scope, {});
  assert.equal(a.ultimaLeitura.tempo, 1.5, "sem tempo fixo, vale o CTI da composição");

  const fixo = await fixture();
  const b = camada(fixo.comp, "B");
  alinha(fixo.scope, { timeMode: "fixed", fixedTime: 3.25, includeExtents: true });
  assert.equal(b.ultimaLeitura.tempo, 3.25);
  assert.equal(b.ultimaLeitura.includeExtents, true);
});

test("tempo fixo inativo precisa ser zero, e não um valor ignorado", async () => {
  const { scope, comp } = await fixture();
  camada(comp, "A");

  const resposta = alinha(scope, { timeMode: "currentTime", fixedTime: 2 });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.details.field, "fixedTime");
});

test("a âncora já no ponto pedido é no-op contado", async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [50, 30],
    position: [200, 150]
  });

  const resposta = alinha(scope, { gridPoint: "center" });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.appliedCount, 0);
  assert.deepEqual(c.posicao, [200, 150], "no-op não pode mexer na posição");
});

test("posição animada é deslocada keyframe a keyframe, e não por setValue", async () => {
  // Foi assim que o comando caiu em host: `setValue` levanta erro numa
  // propriedade com keyframes, o rollback tentava o mesmo caminho e falhava
  // também, e a tela mostrava ROLLBACK_FAILED. Camada animada é o caso comum
  // no After Effects, não a exceção.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [0, 0],
    scale: [100, 100],
    rotation: 0,
    positionKeys: [
      [100, 100],
      [300, 200],
      [500, 100]
    ]
  });

  const resposta = alinha(scope, { gridPoint: "bottomRight" });

  assert.equal(resposta.ok, true);
  assert.deepEqual(c.ancora, [100, 60]);
  // Δ âncora = [100, 60], escala 100%, rotação 0 → cada keyframe soma o mesmo
  // vetor, e a animação inteira é preservada.
  assert.deepEqual(c.transform.property(MN.position).chaves, [
    [200, 160],
    [400, 260],
    [600, 160]
  ]);
});

test("escala ou rotação animada é recusada: a compensação não seria constante", async () => {
  // `R·S·(A' − A)` muda a cada quadro quando escala ou rotação animam. Um
  // deslocamento constante acertaria um instante e erraria todos os outros —
  // em silêncio, que é o pior modo de errar.
  for (const chaves of [{ scaleKeys: [[100, 100], [200, 200]] }, { rotationKeys: [[0], [45]] }]) {
    const { scope, comp } = await fixture();
    const c = camada(comp, "A", { anchor: [0, 0], ...chaves });

    const resposta = alinha(scope, { gridPoint: "bottomRight" });

    assert.equal(resposta.ok, false);
    assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
    assert.deepEqual(c.ancora, [0, 0], "nada pode ser escrito");
  }
});

test("escala animada é aceita quando não há o que compensar", async () => {
  // Sem preservar a aparência, a posição nem é tocada — então uma escala
  // animada não atrapalha nada e recusar seria zelo inútil.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { anchor: [0, 0], scaleKeys: [[100, 100], [200, 200]] });

  const resposta = alinha(scope, { gridPoint: "bottomRight", preserveVisualPosition: false });

  assert.equal(resposta.ok, true);
  assert.deepEqual(c.ancora, [100, 60]);
});

test("âncora animada é recusada", async () => {
  // Qual keyframe deveria ir para o canto? Não há resposta, e escolher um por
  // conta própria seria inventar requisito.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", { anchor: [0, 0] });
  c.transform.property(MN.anchorPoint).chaves = [
    [0, 0],
    [10, 10]
  ];

  const resposta = alinha(scope, { gridPoint: "bottomRight" });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "KEYFRAME_CONFLICT");
});

test("camada 3D preserva a terceira componente da âncora e da posição", async () => {
  // Escrever duas componentes numa camada 3D zeraria a profundidade em
  // silêncio. A matriz vem de MotionTransform, medida em host.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    threeD: true,
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [0, 0, 7],
    position: [200, 150, 40],
    scale: [100, 100, 100],
    rotation: 90
  });

  const resposta = alinha(scope, { gridPoint: "bottomRight" });

  assert.equal(resposta.ok, true);
  assert.deepEqual(c.ancora, [100, 60, 7], "o Z da âncora precisa sobreviver");
  // rotZ 90 leva o delta [100, 60, 0] para [-60, 100, 0].
  perto(c.posicao[0], 200 - 60, 1e-9);
  perto(c.posicao[1], 150 + 100, 1e-9);
  perto(c.posicao[2], 40, 1e-9);
});

test("camada 3D com orientation usa a composição medida", async () => {
  // orientation Z de 90 graus compõe igual a uma rotação Z de 90: medido em
  // host, e é o que distingue a matriz certa de um palpite.
  const { scope, comp } = await fixture();
  const c = camada(comp, "A", {
    threeD: true,
    rect: { top: 0, left: 0, width: 100, height: 60 },
    anchor: [0, 0, 0],
    position: [200, 150, 0],
    orientation: [0, 0, 90]
  });

  alinha(scope, { gridPoint: "bottomRight" });

  perto(c.posicao[0], 200 - 60, 1e-9);
  perto(c.posicao[1], 150 + 100, 1e-9);
});

test("camada sem retângulo é recusada", async () => {
  const semRect = await fixture();
  const b = camada(semRect.comp, "B", { semRect: true, anchor: [0, 0] });
  const rr = alinha(semRect.scope, { gridPoint: "bottomRight" });
  assert.equal(rr.ok, false);
  assert.equal(rr.error.code, "INVALID_SELECTION_TYPE");
  assert.deepEqual(b.ancora, [0, 0]);
});

test("uma falha no meio restaura âncora e posição", async () => {
  const { scope, comp } = await fixture();
  const a = camada(comp, "A", { anchor: [0, 0], position: [200, 150] });
  const b = camada(comp, "B", { anchor: [0, 0], position: [300, 250] });

  b.transform.property(MN.anchorPoint).setValue = () => {
    throw new Error("falha sintetica do host");
  };

  const resposta = alinha(scope, { gridPoint: "bottomRight" });

  assert.equal(resposta.ok, false);
  assert.deepEqual(a.ancora, [0, 0]);
  assert.deepEqual(a.posicao, [200, 150]);
});

test("fonte de bounds não implementada é recusada, e não silenciosamente trocada", async () => {
  const { scope, comp } = await fixture();
  camada(comp, "A");

  for (const boundsSource of ["source", "mask", "shapePath", "selection"]) {
    const resposta = alinha(scope, { boundsSource });
    assert.equal(resposta.ok, false, boundsSource);
    assert.equal(resposta.error.details.field, "boundsSource");
  }
});

test("argumentos fora do contrato são recusados antes de escrever", async () => {
  const casos = [
    ["gridPoint", { gridPoint: "meio" }],
    ["mode", { mode: "convex" }],
    ["timeMode", { timeMode: "sempre" }],
    ["fixedTime", { timeMode: "fixed", fixedTime: -1 }],
    ["includeExtents", { includeExtents: "sim" }],
    ["preserveVisualPosition", { preserveVisualPosition: 1 }],
    ["randomSeed", { randomSeed: 1.5 }],
    ["preview", { preview: true }],
    ["extra", { extra: 1 }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    const c = camada(comp, "A", { anchor: [0, 0] });
    const resposta = alinha(scope, extras);
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.deepEqual(c.ancora, [0, 0]);
  }
});

test("sem seleção e sem composição falham com códigos distintos", async () => {
  const semSelecao = await fixture();
  camada(semSelecao.comp, "A", { selected: false });
  assert.equal(alinha(semSelecao.scope).error.code, "NO_SELECTION");

  const semComp = await fixture({ semComp: true });
  assert.equal(alinha(semComp.scope).error.code, "NO_ACTIVE_COMP");
});

test('dimensões separadas recebem a compensação sem juntar e sem perder keys', async () => {
  const {scope, comp} = await fixture(); const c = camada(comp, 'A');
  const followers = [[200,300],[150,190]].map(values => ({
    value: values[0], numKeys: 2, values: [...values],
    keyValue(i) { return this.values[i-1]; },
    setValueAtKey(i,value) { this.values[i-1]=value; }
  }));
  const leader = c.transform.property(MN.position);
  leader.dimensionsSeparated = true; leader.getSeparationFollower = i => followers[i];
  assert.equal(alinha(scope).ok,true);
  assert.deepEqual(followers.map(p => p.values),[[250,350],[180,220]]);
  assert.equal(leader.dimensionsSeparated,true);
  assert.equal(alinha(scope).ok,true);
  assert.deepEqual(followers.map(p => p.values),[[250,350],[180,220]]);
});

test('falha no segundo keyframe restaura também os keys ainda não escritos', async () => {
  const {scope, comp} = await fixture(); const c = camada(comp, 'A', {positionKeys:[[200,150],[300,250],[400,350]]});
  const property = c.transform.property(MN.position); const original=JSON.stringify(property.chaves);
  const write=property.setValueAtKey.bind(property); let failed=false;
  property.setValueAtKey = (i,value) => { if(i===2&&!failed){failed=true;throw new Error('fault injection');}write(i,value); };
  assert.equal(alinha(scope).ok,false);
  assert.equal(JSON.stringify(property.chaves),original);
  assert.deepEqual(c.ancora,[0,0]);
});

test('camada bloqueada e expressão desativada são recusadas antes da mutação', async () => {
  const {scope,comp}=await fixture();const c=camada(comp,'A');c.locked=true;
  assert.equal(alinha(scope).ok,false);assert.deepEqual(c.ancora,[0,0]);c.locked=false;
  const position=c.transform.property(MN.position);position.expression='value';position.expressionEnabled=false;
  assert.equal(alinha(scope).error.code,'EXPRESSION_CONFLICT');assert.deepEqual(c.ancora,[0,0]);
});

test('várias pré-comps recolhidas centralizam individualmente, com preview e repetição', async () => {
  const { scope, comp } = await fixture();
  const layers = [[200, 80], [640, 360], [90, 300]].map(([width, height], i) => {
    const c = camada(comp, `Pré-comp ${i}`, { rect: {left: 0, top: 0, width, height}, position: [100 * i, 50 * i] });
    c.source = new FakeCompItem(); c.source.width = width; c.source.height = height;
    c.collapseTransformation = true;
    return c;
  });
  const preview = preve(scope);
  assert.equal(preview.ok, true);
  assert.equal(preview.data.targetCount, 3);
  assert.deepEqual(layers.map(c => c.ancora), [[0,0],[0,0],[0,0]]);
  const result = alinha(scope);
  assert.equal(result.ok, true);
  assert.equal(result.data.appliedCount, 3);
  assert.deepEqual(layers.map(c => c.ancora), [[100,40],[320,180],[45,150]]);
  assert.deepEqual(layers.map(c => c.posicao), [[100,40],[420,230],[245,250]]);
  assert.ok(layers.every(c => c.selected && c.collapseTransformation));
  assert.equal(comp.time, 1.5);
  assert.equal(alinha(scope).data.appliedCount, 0);
});

test('pré-comp sem sourceRectAtTime usa dimensões da própria fonte', async () => {
  const { scope, comp } = await fixture();
  const c = camada(comp, 'Pré-comp', {semRect: true});
  c.source = new FakeCompItem(); c.collapseTransformation = true;
  const result = alinha(scope);
  assert.equal(result.ok, true);
  assert.deepEqual(c.ancora, [320,180]);
  assert.deepEqual(c.posicao, [520,330]);
});

// Oráculo independente: rotações elementares, sem chamar MotionTransform.
function worldPoint(layer, point) {
  const p = layer.transform.props;
  const a = p[MN.anchorPoint].value, s = p[MN.scale].value;
  let v = [0,1,2].map(i => ((point[i] ?? 0) - (a[i] ?? 0)) * (s[i] ?? 100) / 100);
  const rotate = (axis, angle) => {
    const c = Math.cos(angle * Math.PI / 180), sn = Math.sin(angle * Math.PI / 180);
    const [x,y,z] = v;
    v = axis === 'x' ? [x,c*y-sn*z,sn*y+c*z] : axis === 'y' ? [c*x+sn*z,y,-sn*x+c*z] : [c*x-sn*y,sn*x+c*y,z];
  };
  rotate('z', p[MN.rotation].value);
  rotate('y', p[MN.rotateY]?.value ?? 0);
  rotate('x', p[MN.rotateX]?.value ?? 0);
  const o = p[MN.orientation]?.value ?? [0,0,0];
  rotate('z', o[2]); rotate('y', o[1]); rotate('x', o[0]);
  const pos = p[MN.position];
  v = v.map((n,i) => n + (pos.dimensionsSeparated ? pos.getSeparationFollower(i).value : (pos.value[i] ?? 0)));
  return layer.parent ? worldPoint(layer.parent, v) : v;
}

test('lote 3D recolhido e parentado conserva pontos no mundo com escala negativa e eixos separados', async () => {
  const { scope, comp } = await fixture();
  const parent = camada(comp, 'Pai', {threeD:true,anchor:[15,22,5],position:[20,40,60],scale:[140,70,90],orientation:[11,23,31],rotationX:13,rotationY:7,rotation:19,selected:false});
  const layers = [false,true].map(separated => {
    const c = camada(comp, 'Pré-comp 3D', {threeD:true,anchor:[10,20,37],position:[210,130,80],scale:[-130,75,90],orientation:[17,23,31],rotationX:11,rotationY:13,rotation:19});
    c.collapseTransformation = true; c.parent = parent;
    if (separated) {
      const followers = c.posicao.map(value => ({value,numKeys:0,setValue(v){this.value=v;}}));
      const leader = c.transform.property(MN.position);
      leader.dimensionsSeparated = true; leader.getSeparationFollower = i => followers[i];
    }
    return c;
  });
  const points = [[0,0,0],[100,0,0],[100,60,0],[0,60,50]];
  const before = layers.map(c => points.map(p => worldPoint(c,p)));
  const result = alinha(scope);
  assert.equal(result.ok,true);
  assert.equal(result.data.appliedCount,2);
  layers.forEach((c,i) => {
    assert.deepEqual(c.ancora,[50,30,37]);
    points.forEach((p,j) => worldPoint(c,p).forEach((n,k) => perto(n,before[i][j][k])));
    assert.equal(c.parent,parent);
    assert.equal(c.collapseTransformation,true);
  });
});

test('um alvo bloqueado no lote recolhido impede mutações em todas as camadas', async () => {
  const {scope,comp} = await fixture();
  const a = camada(comp,'A'); a.collapseTransformation=true;
  const b = camada(comp,'B'); b.locked=true;
  const result = alinha(scope);
  assert.equal(result.ok,false);
  assert.deepEqual(a.ancora,[0,0]);
  assert.deepEqual(a.posicao,[200,150]);
  assert.equal(result.error.details.layerName,'B');
});

function addMask(scope, layer, vertices, tangents = {}) {
  scope.MaskMode = {NONE:0, ADD:1};
  const zero = vertices.map(() => [0,0]);
  const shape = {closed:true,vertices,inTangents:tangents.in ?? zero,outTangents:tangents.out ?? zero};
  const props = {'ADBE Mask Shape':new FakeProperty(shape)};
  const mask = {maskMode:1,inverted:false,property:n=>props[n] ?? null};
  const original = layer.property.bind(layer);
  layer.property = n => n === 'ADBE Mask Parade' ? {numProperties:1,property:()=>mask} : original(n);
  return mask;
}

test('centro de cada pré-comp usa conteúdo e máscara do PSD em vez do quadro 1080x1920', async () => {
  const {scope,comp} = await fixture();
  const sources = [0,100].map(offset => {
    const source = new FakeCompItem(); source.width=1080;source.height=1920;
    camada(source,'Texto',{rect:{left:0,top:0,width:160,height:30},anchor:[0,0],position:[660,680+offset]});
    const box = camada(source,'PSD quadro inteiro',{rect:{left:0,top:0,width:1080,height:1920},anchor:[540,960],position:[540,960]});
    addMask(scope,box,[[570,660+offset],[645,660+offset],[645,735+offset],[570,735+offset]]);
    return source;
  });
  const layers = sources.map(source => {
    const l=camada(comp,'Pré-comp',{anchor:[540,960],position:[540,960]});l.source=source;l.collapseTransformation=true;return l;
  });
  const preview=preve(scope);
  assert.equal(preview.ok,true);
  assert.deepEqual(preview.data.targets.map(t=>t.anchorAfter),[[695,697.5],[695,797.5]]);
  assert.deepEqual(layers.map(l=>l.ancora),[[540,960],[540,960]]);
  assert.equal(alinha(scope).ok,true);
  assert.deepEqual(layers.map(l=>l.posicao),[[695,697.5],[695,797.5]]);
  assert.deepEqual(sources[0].layer(2).ancora,[540,960]);
});

test('extremos da curva da máscara incluem a parte além dos vértices', async () => {
  const {scope,comp}=await fixture();
  const l=camada(comp,'Curva',{rect:{left:-100,top:-100,width:400,height:400}});
  addMask(scope,l,[[0,0],[100,0],[100,100],[0,100]],{out:[[0,-100],[0,0],[0,0],[0,0]],in:[[0,0],[0,-100],[0,0],[0,0]]});
  assert.equal(alinha(scope,{gridPoint:'topCenter'}).ok,true);
  assert.deepEqual(l.ancora,[50,-75]);
});

test('conteúdo aninhado respeita tempo da fonte, pai, rotação e camadas ocultas', async () => {
  const {scope,comp}=await fixture();
  const source=new FakeCompItem();
  const parent=camada(source,'Pai',{anchor:[0,0],position:[100,80],rotation:90});parent.nullLayer=true;
  const child=camada(source,'Conteúdo',{rect:{left:0,top:0,width:80,height:20},anchor:[0,0],position:[10,20]});child.parent=parent;
  const position=child.transform.property(MN.position);
  position.valueAtTime=t=>[10+t*10,20];
  const hidden=camada(source,'Oculta',{rect:{left:0,top:0,width:10000,height:10000}});hidden.enabled=false;
  const l=camada(comp,'Pré-comp');l.source=source;l.collapseTransformation=true;l.startTime=1;l.stretch=50;
  // CTI 1.5 => tempo interno 1; conteúdo [20,20]..[100,40], pai gira 90.
  assert.equal(alinha(scope).ok,true);
  perto(l.ancora[0],70);perto(l.ancora[1],140);
  assert.equal(comp.time,1.5);assert.equal(source.time,1.5);
});

test('pré-comp 3D com conteúdo 2D centraliza conteúdo preservando profundidade', async () => {
  const {scope,comp}=await fixture();const source=new FakeCompItem();
  camada(source,'Conteúdo',{rect:{left:0,top:0,width:100,height:40},anchor:[0,0],position:[60,80]});
  const l=camada(comp,'Pré-comp 3D',{threeD:true,anchor:[0,0,32],position:[200,150,60],scale:[80,120,90],orientation:[30,15,20],rotationX:15,rotationY:20});l.source=source;l.collapseTransformation=true;
  const before=worldPoint(l,[20,50,0]);
  assert.equal(alinha(scope).ok,true);assert.deepEqual(l.ancora,[110,100,32]);
  worldPoint(l,[20,50,0]).forEach((v,i)=>perto(v,before[i]));
});

test('conteúdo 3D interno e máscaras não mensuráveis falham sem usar centro errado', async () => {
  const {scope,comp}=await fixture();const source=new FakeCompItem();
  const child=camada(source,'Conteúdo',{threeD:true});
  const l=camada(comp,'Pré-comp');l.source=source;
  assert.equal(alinha(scope).ok,false);assert.deepEqual(l.ancora,[0,0]);
  child.threeDLayer=false;
  const mask=addMask(scope,child,[[0,0],[100,0],[100,60]]);mask.inverted=true;
  assert.equal(alinha(scope).ok,false);assert.deepEqual(l.ancora,[0,0]);
});

test('arredondamento real do host não causa novas escritas ao repetir', async () => {
  const {scope,comp}=await fixture();
  const c=camada(comp,'AE float32',{rect:{left:0,top:0,width:1486.984985351562,height:1572.757995605468}});
  const anchor=c.transform.property(MN.anchorPoint),position=c.transform.property(MN.position);
  anchor.setValue=v=>{anchor.value=v.map(Math.fround);};
  position.setValue=v=>{position.value=v.map(Math.fround);};
  assert.equal(alinha(scope).data.appliedCount,1);
  const before=[...c.posicao];
  assert.equal(preve(scope).data.changedCount,0);
  assert.equal(alinha(scope).data.appliedCount,0);
  assert.deepEqual(c.posicao,before);
});

