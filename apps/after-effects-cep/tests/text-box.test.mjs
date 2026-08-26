import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";
import { renderExpression } from "../../../packages/expression-library/dist/index.js";

const MODULES = [
  "generated/motion-contracts.jsx",
  "generated/motion-descriptors.jsx",
  "src/json.jsx",
  "src/undo.jsx",
  "src/registry.jsx",
  "src/expression-templates.jsx",
  "src/commands/text-box.jsx",
  "src/dispatch.jsx"
];

const MN = {
  contents: "ADBE Root Vectors Group",
  group: "ADBE Vector Group",
  groupContents: "ADBE Vectors Group",
  rect: "ADBE Vector Shape - Rect",
  rectSize: "ADBE Vector Rect Size",
  rectPosition: "ADBE Vector Rect Position",
  rectRoundness: "ADBE Vector Rect Roundness",
  fill: "ADBE Vector Graphic - Fill",
  fillColor: "ADBE Vector Fill Color",
  fillOpacity: "ADBE Vector Fill Opacity",
  transform: "ADBE Transform Group",
  anchorPoint: "ADBE Anchor Point",
  position: "ADBE Position"
};

/** Filhos que cada `matchName` de contêiner traz consigo no host real. */
const FILHOS = {
  [MN.group]: [MN.groupContents],
  [MN.rect]: [MN.rectSize, MN.rectPosition, MN.rectRoundness],
  [MN.fill]: [MN.fillColor, MN.fillOpacity],
  [MN.transform]: [MN.anchorPoint, MN.position]
};

class FakeProperty {
  /** `dono` e a camada de forma, para modelar a avaliacao real da expressao. */
  constructor(matchName, dono = null) {
    this.matchName = matchName;
    this.dono = dono;
    this.filhos = (FILHOS[matchName] ?? []).map((nome) => new FakeProperty(nome, dono));
    this.value = null;
    this.rejectSource = null;
    this._expression = "";
    this.expressionError = "";
  }

  get numProperties() {
    return this.filhos.length;
  }

  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    for (const filho of this.filhos) if (filho.matchName === chave) return filho;
    return null;
  }

  addProperty(matchName) {
    const criado = new FakeProperty(matchName, this.dono);
    this.filhos.push(criado);
    return criado;
  }

  setValue(valor) {
    this.value = valor;
  }

  get expression() {
    return this._expression;
  }

  set expression(valor) {
    this._expression = valor;
    if (valor === this.rejectSource) {
      this.expressionError = "synthetic expression error";
      return;
    }
    // Modela a avaliacao do host: o template dereferencia `thisLayer.parent`,
    // entao escrever a expressao antes de parentear falha de verdade no After
    // Effects. Sem isto o double aceitaria uma ordem que o host recusa.
    const precisaDeParent = typeof valor === "string" && valor.indexOf("thisLayer.parent") >= 0;
    this.expressionError =
      precisaDeParent && this.dono && !this.dono.parent
        ? "expression error: null is not an object"
        : "";
  }
}

class FakeLayer {
  constructor(comp, nome) {
    this.comp = comp;
    this.name = nome;
    this.parent = null;
    this.removed = false;
    this.moves = [];
  }

  moveAfter(outra) {
    this.moves.push(outra.name);
    const de = this.comp.camadas.indexOf(this);
    this.comp.camadas.splice(de, 1);
    this.comp.camadas.splice(this.comp.camadas.indexOf(outra) + 1, 0, this);
  }

  remove() {
    this.removed = true;
    const at = this.comp.camadas.indexOf(this);
    if (at >= 0) this.comp.camadas.splice(at, 1);
  }
}

class FakeTextLayer extends FakeLayer {}

class FakeShapeLayer extends FakeLayer {
  constructor(comp, nome) {
    super(comp, nome);
    this.raiz = new FakeProperty(MN.contents, this);
    this.transformGroup = new FakeProperty(MN.transform, this);
  }

  property(matchName) {
    if (matchName === MN.contents) return this.raiz;
    if (matchName === MN.transform) return this.transformGroup;
    return null;
  }

  /** Atalho de leitura para os testes: o retângulo da primeira caixa gerenciada. */
  get retangulo() {
    return this.raiz.property(1)?.property(MN.groupContents)?.property(MN.rect) ?? null;
  }

  get preenchimento() {
    return this.raiz.property(1)?.property(MN.groupContents)?.property(MN.fill) ?? null;
  }
}

class FakeCompItem {
  constructor(camadas = []) {
    this.camadas = camadas;
    this.aoCriar = null;
    this.layers = {
      addShape: () => {
        const forma = new FakeShapeLayer(this, "Shape Layer 1");
        this.camadas.unshift(forma);
        if (this.aoCriar) this.aoCriar(forma);
        return forma;
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
    return this.camadas.filter((camada) => camada.selecionada === true);
  }
}

function args(overrides = {}) {
  return {
    paddingX: 20,
    paddingY: 12,
    roundness: 8,
    fillColor: [0, 0, 0],
    fillOpacity: 100,
    createPerLayer: true,
    conflictMode: "skip",
    ...overrides
  };
}

function request(commandArgs = args()) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "textbox-1",
    command: "ae.text.box",
    args: commandArgs,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: { preserveSelection: true }
  });
}

async function fixture({ camadas, semComp = false } = {}) {
  const comp = new FakeCompItem(camadas ?? []);
  const app = {
    version: "26.3x87",
    project: { activeItem: semComp ? null : comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup() {},
    endUndoGroup() {}
  };
  const scope = await loadHostModules(MODULES, {
    app,
    CompItem: FakeCompItem,
    TextLayer: FakeTextLayer,
    ShapeLayer: FakeShapeLayer
  });
  return { scope, comp };
}

function texto(comp, nome, selecionada = true) {
  const camada = new FakeTextLayer(comp, nome);
  camada.selecionada = selecionada;
  comp.camadas.push(camada);
  return camada;
}

function responder(scope, payload = request()) {
  return JSON.parse(scope.MotionAE.dispatch(payload));
}

/** Comp com N camadas de texto selecionadas, já pronta para despachar. */
async function comTextos(...nomes) {
  const montado = await fixture({ camadas: [] });
  const textos = nomes.map((nome) => texto(montado.comp, nome));
  return { ...montado, textos };
}

test("descriptor declara mutação e no-op idempotente", async () => {
  const { scope } = await comTextos("Titulo");
  const descriptor = scope.MotionDescriptors["ae.text.box"];

  assert.deepEqual(descriptor.requirements, ["hasProject", "hasActiveComp", "expressionEngine"]);
  assert.equal(descriptor.mutates, true);
  assert.equal(descriptor.allowsNoopSuccess, true);
  assert.equal(descriptor.undoLabelKey, "undo.ae.text.box");
});

test("cria a caixa com expressões gerenciadas, parentesco e ordem abaixo do texto", async () => {
  const { scope, comp, textos } = await comTextos("Titulo");

  const resposta = responder(scope);

  assert.equal(resposta.ok, true);
  assert.equal(resposta.data.createdCount, 1);
  assert.equal(resposta.data.unchangedCount, 0);

  const forma = comp.camadas.find((camada) => camada instanceof FakeShapeLayer);
  const retangulo = forma.retangulo;

  assert.equal(
    retangulo.property(MN.rectSize).expression,
    scope.MotionExpressions.renderTextBoxSize({ paddingX: 20, paddingY: 12 })
  );
  assert.equal(
    retangulo.property(MN.rectPosition).expression,
    scope.MotionExpressions.renderTextBoxPosition()
  );
  assert.equal(retangulo.property(MN.rectRoundness).value, 8);
  assert.deepEqual(forma.preenchimento.property(MN.fillColor).value, [0, 0, 0, 1]);
  assert.equal(forma.preenchimento.property(MN.fillOpacity).value, 100);

  assert.equal(forma.parent, textos[0], "a caixa precisa ser filha do texto");
  assert.deepEqual(forma.transformGroup.property(MN.anchorPoint).value, [0, 0]);
  assert.deepEqual(forma.transformGroup.property(MN.position).value, [0, 0]);
  assert.deepEqual(forma.moves, ["Titulo"], "a §7 pede a caixa logo abaixo do texto");
  assert.equal(comp.camadas.indexOf(forma), comp.camadas.indexOf(textos[0]) + 1);
});

test("a expressão aponta pelo parent, nunca pelo nome da camada", async () => {
  // thisComp.layer("nome") quebraria em rename e escolheria a errada quando há
  // duas camadas homônimas. Este teste falha se alguém trocar a abordagem.
  const { scope } = await comTextos("Titulo");
  const fonte = scope.MotionExpressions.renderTextBoxSize({ paddingX: 0, paddingY: 0 });

  assert.ok(fonte.includes("thisLayer.parent"));
  assert.ok(!fonte.includes("thisComp.layer"));
});

test("texto vazio colapsa a caixa para [0, 0] em vez de deixar um bloco órfão", async () => {
  const { scope } = await comTextos("Titulo");
  const fonte = scope.MotionExpressions.renderTextBoxSize({ paddingX: 20, paddingY: 12 });

  assert.ok(fonte.includes("r.width === 0 && r.height === 0 ? [0, 0]"));
});

test("o host e a biblioteca TypeScript emitem exatamente a mesma fonte", async () => {
  const { scope } = await comTextos("Titulo");

  for (const tokens of [
    { paddingX: 0, paddingY: 0 },
    { paddingX: 20, paddingY: 12 },
    { paddingX: 0.5, paddingY: 10000 }
  ]) {
    assert.equal(
      scope.MotionExpressions.renderTextBoxSize(tokens),
      renderExpression({ id: "ae.textbox.size", tokens }).source
    );
  }

  // A posição não depende de padding dos dois lados; os tokens existem só porque
  // o schema da biblioteca é comum aos dois templates.
  assert.equal(
    scope.MotionExpressions.renderTextBoxPosition(),
    renderExpression({ id: "ae.textbox.position", tokens: { paddingX: 0, paddingY: 0 } }).source
  );
});

test("reaplicar sobre um texto que já tem caixa é no-op, não duplicata", async () => {
  const { scope, comp } = await comTextos("Titulo");

  assert.equal(responder(scope).data.createdCount, 1);
  const segunda = responder(scope);

  assert.equal(segunda.ok, true);
  assert.equal(segunda.data.createdCount, 0);
  assert.equal(segunda.data.unchangedCount, 1);
  assert.equal(comp.camadas.filter((c) => c instanceof FakeShapeLayer).length, 1);
});

test("a caixa gerenciada é reconhecida por estrutura, e renomeá-la não a esconde", async () => {
  const { scope, comp } = await comTextos("Titulo");
  responder(scope);

  const forma = comp.camadas.find((camada) => camada instanceof FakeShapeLayer);
  forma.name = "qualquer outro nome que o usuario quiser";

  assert.equal(responder(scope).data.unchangedCount, 1);
});

test("uma forma parenteada sem a expressão gerenciada não conta como caixa", async () => {
  // Só o parentesco não basta: uma forma que o usuário parenteou à mão seria
  // confundida com rig nosso, e o comando se recusaria a criar a caixa real.
  const { scope, comp, textos } = await comTextos("Titulo");
  const intrusa = comp.layers.addShape();
  intrusa.parent = textos[0];

  const resposta = responder(scope);

  assert.equal(resposta.data.createdCount, 1);
  assert.equal(resposta.data.unchangedCount, 0);
});

test("cria uma caixa por camada quando há várias selecionadas", async () => {
  const { scope, comp } = await comTextos("Titulo", "Subtitulo", "Rodape");

  const resposta = responder(scope);

  assert.equal(resposta.data.createdCount, 3);
  assert.equal(comp.camadas.filter((c) => c instanceof FakeShapeLayer).length, 3);
});

test("uma falha no meio remove tudo o que já tinha sido criado", async () => {
  const { scope, comp } = await comTextos("Titulo", "Subtitulo");
  let criadas = 0;
  comp.aoCriar = (forma) => {
    criadas += 1;
    // A segunda caixa falha ao montar o conteúdo — a primeira já existe nesse
    // ponto, que é exatamente o estado parcial que o rollback precisa desfazer.
    if (criadas === 2) {
      forma.raiz.addProperty = () => {
        throw new Error("falha sintetica do host");
      };
    }
  };

  const resposta = responder(scope);

  assert.equal(resposta.ok, false);
  assert.equal(
    comp.camadas.filter((c) => c instanceof FakeShapeLayer).length,
    0,
    "nenhuma caixa pode sobreviver a um rollback"
  );
  assert.equal(criadas, 2, "a falha precisa ocorrer com uma caixa já criada");
});

test("selecionar algo que não é texto falha com o código próprio", async () => {
  const { scope, comp } = await comTextos("Titulo");
  const forma = comp.layers.addShape();
  forma.selecionada = true;

  const resposta = responder(scope);

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_SELECTION_TYPE");
});

test("sem seleção e sem composição falham com códigos distintos", async () => {
  const semSelecao = await fixture({ camadas: [] });
  assert.equal(responder(semSelecao.scope).error.code, "NO_SELECTION");

  const semComp = await fixture({ camadas: [], semComp: true });
  assert.equal(responder(semComp.scope).error.code, "NO_ACTIVE_COMP");
});

test("argumentos fora do contrato são recusados antes de qualquer criação", async () => {
  const casos = [
    ["paddingX", args({ paddingX: -1 })],
    ["paddingY", args({ paddingY: 10001 })],
    ["roundness", args({ roundness: -0.5 })],
    ["fillOpacity", args({ fillOpacity: 101 })],
    ["fillColor", args({ fillColor: [0, 0, 2] })],
    ["fillColor", args({ fillColor: [0, 0] })],
    ["createPerLayer", args({ createPerLayer: false })],
    ["conflictMode", args({ conflictMode: "replace-with-backup" })]
  ];

  for (const [campo, invalidos] of casos) {
    const { scope, comp } = await comTextos("Titulo");
    const resposta = responder(scope, request(invalidos));

    assert.equal(resposta.ok, false, `${campo} deveria ser recusado`);
    assert.equal(resposta.error.code, "INVALID_PRESET");
    assert.equal(resposta.error.details.field, campo);
    assert.equal(comp.camadas.filter((c) => c instanceof FakeShapeLayer).length, 0);
  }
});

test("argumento desconhecido é recusado em vez de ignorado", async () => {
  const { scope } = await comTextos("Titulo");
  const resposta = responder(scope, request(args({ stroke: 4 })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "stroke");
});

test("o parser rejeita cabeçalho editado, id trocado e corpo adulterado", async () => {
  const { scope } = await comTextos("Titulo");
  const valida = scope.MotionExpressions.renderTextBoxSize({ paddingX: 20, paddingY: 12 });

  assert.equal(scope.MotionExpressions.isManagedTextBoxSize(valida), true);
  assert.equal(
    scope.MotionExpressions.isManagedTextBoxSize(valida.replace("v1", "v2")),
    false,
    "versão futura precisa falhar fechado"
  );
  assert.equal(
    scope.MotionExpressions.isManagedTextBoxSize(valida.replace("ae.textbox.size", "ae.textbox.zzz")),
    false
  );
  assert.equal(
    scope.MotionExpressions.isManagedTextBoxSize(`${valida}\nalert("oi");`),
    false,
    "código anexado ao fim precisa falhar fechado"
  );
  assert.equal(
    scope.MotionExpressions.isManagedTextBoxSize(valida.replace("20 * 2", "20 * 3")),
    false
  );
  assert.equal(scope.MotionExpressions.isManagedTextBoxSize(""), false);
  assert.equal(scope.MotionExpressions.isManagedTextBoxSize(null), false);
});
