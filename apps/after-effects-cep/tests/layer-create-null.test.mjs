import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/expression-templates.jsx",
  "src/commands/layer-create-null.jsx",
  "src/dispatch.jsx"
];

const MN = { transform: "ADBE Transform Group", position: "ADBE Position" };

/**
 * Propriedade de posição.
 *
 * Modela o que o comando depende: escrever uma expressão, ler o valor que o
 * host avaliou, e a expressão sumir depois. `avaliador` faz o papel do motor de
 * expressões — o double não interpreta a fonte, mas registra qual fonte foi
 * escrita, que é o que os testes precisam verificar.
 */
class FakePosition {
  constructor() {
    this.value = null;
    this.expressionError = "";
    this._expression = "";
    this.fontesEscritas = [];
    this.avaliador = () => [0, 0, 0];
    this.recusaFonte = false;
  }

  get expression() {
    return this._expression;
  }

  set expression(valor) {
    this._expression = valor;
    if (valor !== "") {
      this.fontesEscritas.push(valor);
      this.expressionError = this.recusaFonte ? "synthetic expression error" : "";
    }
  }

  valueAtTime() {
    return this.avaliador();
  }

  setValue(valor) {
    this.value = valor;
  }
}

class FakeTransform {
  constructor() {
    this.posicao = new FakePosition();
  }

  property(matchName) {
    return matchName === MN.position ? this.posicao : null;
  }
}

class FakeLayer {
  constructor(comp, nome) {
    this.comp = comp;
    this.name = nome;
    this.selected = false;
    this.nullLayer = false;
    this.label = 0;
    this.threeDLayer = false;
    this.source = { width: 100, height: 100 };
    this.transform = new FakeTransform();
    this._parent = null;
    this.metodos = [];
    this.removed = false;
  }

  get index() {
    return this.comp.camadas.indexOf(this) + 1;
  }

  get parent() {
    return this._parent;
  }

  set parent(valor) {
    this.metodos.push({ metodo: "parent=", alvo: valor ? valor.name : null });
    this._parent = valor;
  }

  setParentWithJump(valor) {
    this.metodos.push({ metodo: "withJump", alvo: valor ? valor.name : null });
    this._parent = valor;
  }

  property(matchName) {
    return matchName === MN.transform ? this.transform : null;
  }

  remove() {
    this.removed = true;
    const at = this.comp.camadas.indexOf(this);
    if (at >= 0) this.comp.camadas.splice(at, 1);
  }
}

class FakeCompItem {
  constructor() {
    this.camadas = [];
    this.width = 640;
    this.height = 360;
    this.aoCriarNull = null;
    this.layers = {
      addNull: () => {
        const nulo = new FakeLayer(this, "Null 1");
        nulo.nullLayer = true;
        // O After Effects insere no topo e seleciona a camada nova — medido.
        nulo.selected = true;
        this.camadas.unshift(nulo);
        if (this.aoCriarNull) this.aoCriarNull(nulo);
        return nulo;
      }
    };
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
    placement: "compCenter",
    dimension: "2d",
    parentSelected: false,
    preserveWorldTransform: true,
    size: 100,
    label: 0,
    ...overrides
  };
}

function request(commandArgs) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "null-1",
    command: "ae.layer.create-null",
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
    CompItem: FakeCompItem
  });
  return { scope, comp };
}

function empilha(comp, ...nomes) {
  return nomes.map((nome) => {
    const camada = new FakeLayer(comp, nome);
    camada.selected = true;
    comp.camadas.push(camada);
    return camada;
  });
}

function criar(scope, extras = {}) {
  return JSON.parse(scope.MotionAE.dispatch(request(args(extras))));
}

/** O null criado é sempre o do topo. */
function nullDe(comp) {
  return comp.camadas.find((camada) => camada.nullLayer === true) ?? null;
}

test("descriptor não permite no-op: cada aplicação cria um null novo", async () => {
  const { scope } = await fixture();
  const descriptor = scope.MotionDescriptors["ae.layer.create-null"];

  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.allowsNoopSuccess, false);
  assert.equal(descriptor.undoLabelKey, "undo.ae.layer.createNull");
  // O posicionamento usa o motor de expressões como calculadora.
  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
});

test("compCenter não mede nada e funciona sem seleção", async () => {
  // A §7 diz "zero ou mais layers". Exigir seleção aqui quebraria o caso mais
  // simples do comando.
  const { scope, comp } = await fixture();

  const resposta = criar(scope, { placement: "compCenter", size: 150, label: 9 });

  assert.equal(resposta.ok, true);
  const nulo = nullDe(comp);
  assert.deepEqual(nulo.transform.posicao.value, [320, 180]);
  assert.deepEqual(nulo.transform.posicao.fontesEscritas, [], "nenhuma sonda para o centro da comp");
  assert.equal(nulo.source.width, 150);
  assert.equal(nulo.source.height, 150);
  assert.equal(nulo.label, 9);
  assert.equal(nulo.threeDLayer, false);
});

test("3D acrescenta a terceira coordenada", async () => {
  const { scope, comp } = await fixture();

  criar(scope, { placement: "compCenter", dimension: "3d" });

  const nulo = nullDe(comp);
  assert.equal(nulo.threeDLayer, true);
  assert.deepEqual(nulo.transform.posicao.value, [320, 180, 0]);
});

test("a sonda é escrita, lida e APAGADA — nunca fica no projeto", async () => {
  // Uma expressão temporária sobrevivente seria pior que um null mal
  // posicionado: o usuário teria uma camada com código que ele não escreveu.
  const { scope, comp } = await fixture();
  empilha(comp, "A", "B");

  const capturado = [];
  comp.aoCriarNull = (nulo) => {
    nulo.transform.posicao.avaliador = () => [111, 222, 0];
    capturado.push(nulo.transform.posicao);
  };

  criar(scope, { placement: "averageAnchor" });

  const posicao = capturado[0];
  assert.equal(posicao.fontesEscritas.length, 1);
  // A âncora, e não a origem do espaço da camada. `toComp([0,0,0])` mapearia o
  // canto superior esquerdo da fonte: num sólido a âncora nasce no centro, e a
  // média sairia deslocada com toda a aparência de estar certa.
  assert.match(posicao.fontesEscritas[0], /l\.toComp\(l\.anchorPoint\)/);
  assert.doesNotMatch(posicao.fontesEscritas[0], /toComp\(\[0, 0, 0\]\)/);
  assert.equal(posicao.expression, "", "a sonda precisa ser apagada");
  assert.deepEqual(posicao.value, [111, 222]);
});

test("os índices da sonda são lidos DEPOIS de o null existir", async () => {
  // Criar uma camada empurra todas as outras uma posição para baixo. Uma lista
  // capturada antes apontaria para as camadas erradas — e a sonda calcularia a
  // média das camadas que o usuário não escolheu.
  const { scope, comp } = await fixture();
  const [a, b] = empilha(comp, "A", "B");
  assert.equal(a.index, 1);
  assert.equal(b.index, 2);

  const capturado = [];
  comp.aoCriarNull = (nulo) => {
    nulo.transform.posicao.avaliador = () => [0, 0, 0];
    capturado.push(nulo.transform.posicao);
  };

  criar(scope, { placement: "averageAnchor" });

  // Com o null no topo, A e B passaram para 2 e 3.
  assert.match(capturado[0].fontesEscritas[0], /var idx = \[2, 3\];/);
});

test("o espaço da sonda segue a dimensão do null", async () => {
  // Numa camada 3D o `toComp` devolve a posição PROJETADA pela câmera. Medido
  // em host: com camadas em z=-400 e z=+600 as duas leituras divergem 787 px, e
  // o z da projeção não tem significado no espaço do transform.
  //
  // A regra segue o destino do valor: um null 2D vive no plano da composição e
  // quer onde as camadas aparecem; um null 3D vive no mundo.
  const doisD = await fixture();
  empilha(doisD.comp, "A");
  doisD.comp.aoCriarNull = (n) => { n.transform.posicao.avaliador = () => [0, 0, 0]; };
  criar(doisD.scope, { placement: "averageAnchor", dimension: "2d" });
  assert.match(nullDe(doisD.comp).transform.posicao.fontesEscritas[0], /l\.toComp\(/);

  const tresD = await fixture();
  empilha(tresD.comp, "A");
  tresD.comp.aoCriarNull = (n) => { n.transform.posicao.avaliador = () => [0, 0, 0]; };
  criar(tresD.scope, { placement: "averageAnchor", dimension: "3d" });
  const fonte3d = nullDe(tresD.comp).transform.posicao.fontesEscritas[0];
  assert.match(fonte3d, /l\.toWorld\(/);
  assert.doesNotMatch(fonte3d, /toComp/);
});

test("selectionBounds projeta os quatro cantos, não dois", async () => {
  // Uma camada rotacionada tem bounding box alinhado ao eixo no espaço DELA;
  // projetar só dois cantos daria um retângulo errado depois da rotação.
  const { scope, comp } = await fixture();
  empilha(comp, "A");
  comp.aoCriarNull = (nulo) => {
    nulo.transform.posicao.avaliador = () => [5, 6, 0];
  };

  criar(scope, { placement: "selectionBounds" });

  const fonte = nullDe(comp).transform.posicao.fontesEscritas[0];
  assert.match(fonte, /sourceRectAtTime\(time, false\)/);
  assert.match(fonte, /for \(var m = 0; m < 2; m\+\+\)/);
  assert.match(fonte, /for \(var n = 0; n < 2; n\+\+\)/);
});

test("parentSelected usa `parent =` quando preserva, e withJump quando não", async () => {
  const preserva = await fixture();
  const [a] = empilha(preserva.comp, "A");
  criar(preserva.scope, { parentSelected: true, preserveWorldTransform: true });
  assert.deepEqual(a.metodos, [{ metodo: "parent=", alvo: "Null 1" }]);

  const pula = await fixture();
  const [b] = empilha(pula.comp, "B");
  criar(pula.scope, { parentSelected: true, preserveWorldTransform: false });
  assert.deepEqual(b.metodos, [{ metodo: "withJump", alvo: "Null 1" }]);
});

test("o null criado não entra na própria lista de camadas a parentear", async () => {
  // Ele nasce selecionado, então apareceria em `selectedLayers` se a seleção
  // fosse lida depois da criação. É por isso que ela é lida no preflight.
  const { scope, comp } = await fixture();
  empilha(comp, "A");

  const resposta = criar(scope, { parentSelected: true });

  assert.equal(resposta.data.parentedCount, 1);
  const nulo = nullDe(comp);
  assert.equal(nulo.parent, null);
  assert.deepEqual(nulo.metodos, []);
});

test("placements que medem a seleção exigem seleção", async () => {
  for (const placement of ["averageAnchor", "selectionBounds"]) {
    const { scope } = await fixture();
    const resposta = criar(scope, { placement });
    assert.equal(resposta.ok, false, placement);
    assert.equal(resposta.error.code, "NO_SELECTION");
    assert.equal(resposta.error.details.field, "placement");
  }
});

test("parentear sem seleção falha em vez de criar um null solto", async () => {
  const { scope, comp } = await fixture();

  const resposta = criar(scope, { parentSelected: true });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "NO_SELECTION");
  assert.equal(comp.camadas.length, 0, "nada pode ser criado quando o preflight recusa");
});

test("uma falha no meio remove o null", async () => {
  const { scope, comp } = await fixture();
  empilha(comp, "A");
  comp.aoCriarNull = (nulo) => {
    nulo.transform.posicao.recusaFonte = true;
  };

  const resposta = criar(scope, { placement: "averageAnchor" });

  assert.equal(resposta.ok, false);
  assert.equal(nullDe(comp), null, "o null não pode sobreviver ao rollback");
});

test("argumentos fora do contrato são recusados", async () => {
  const casos = [
    ["placement", { placement: "cti" }],
    ["dimension", { dimension: "2.5d" }],
    ["parentSelected", { parentSelected: "sim" }],
    ["preserveWorldTransform", { preserveWorldTransform: 1 }],
    ["size", { size: 0 }],
    ["size", { size: 10.5 }],
    ["label", { label: 17 }],
    ["label", { label: -1 }]
  ];

  for (const [campo, extras] of casos) {
    const { scope, comp } = await fixture();
    const resposta = criar(scope, extras);
    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.equal(comp.camadas.length, 0);
  }
});

test("nenhuma sonda lê o terceiro componente sem guarda de tamanho", async () => {
  // Medido em AE 26.3x87: `toComp` devolve DOIS componentes numa camada 2D e
  // três numa 3D. Ler `p[2]` sem guarda numa camada 2D produz "Valor indefinido
  // usado na expressão" e o After Effects desabilita a expressão — foi
  // exatamente assim que `averageAnchor` falhou em host.
  //
  // O double não interpreta expressões, então este teste guarda a FONTE.
  const { scope } = await fixture();
  const fontes = [
    scope.MotionExpressions.renderAnchorAverageProbe([1, 2], false),
    scope.MotionExpressions.renderBoundsCenterProbe([1, 2], false)
  ];

  for (const fonte of fontes) {
    const semGuarda = fonte
      .split("\n")
      .filter((linha) => /\bp\[2\]/.test(linha) && !/p\.length > 2/.test(linha));
    assert.deepEqual(semGuarda, [], `leitura de p[2] sem guarda em:\n${fonte}`);
  }

  assert.match(
    scope.MotionExpressions.renderAnchorAverageProbe([1], false),
    /var z = p\.length > 2 \? p\[2\] : 0;/
  );
});

test("a sonda recusa índice que não é inteiro positivo", async () => {
  const { scope } = await fixture();
  const render = scope.MotionExpressions.renderAnchorAverageProbe;

  assert.match(render([1, 2, 3], false), /var idx = \[1, 2, 3\];/);
  assert.throws(() => render([], false), /Quantidade/);
  assert.throws(() => render([0], false), /Indice/);
  assert.throws(() => render([1.5], false), /Indice/);
  assert.throws(() => render(["1"], false), /Indice/);
  assert.throws(() => render("1,2", false), /Lista/);
  // O espaco e obrigatorio. Um default silencioso escolheria a projecao da
  // camera para um null 3D — o defeito de 787 px medido em host.
  assert.throws(() => render([1]), /Espaco/);
});

test("sem composição falha antes de qualquer criação", async () => {
  const { scope } = await fixture({ semComp: true });
  assert.equal(criar(scope).error.code, "NO_ACTIVE_COMP");
});
