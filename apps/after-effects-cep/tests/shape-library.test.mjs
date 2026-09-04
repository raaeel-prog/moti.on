/**
 * CHMS-021 — biblioteca de formas.
 *
 * O critério de aceite é "cada shape é editável e mantém controles". Em teste
 * isso vira: a forma sai como **operador nativo** com as propriedades que o
 * timeline mostra, e não como caminho assado — porque um caminho assado abriria
 * mão exatamente desses controles.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
const PropertyValueType = { NO_VALUE: 0, OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, COLOR: 9 };

class FakeShape {
  constructor() {
    this.vertices = [];
    this.inTangents = [];
    this.outTangents = [];
    this.closed = false;
  }
}

class FakeProperty {
  constructor(matchName) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.value = null;
    this.escritas = 0;
  }
  setValue(valor) {
    this.value = valor;
    this.escritas += 1;
  }
}

/** Propriedades que cada operador nativo expõe, para o fake recusar o que não existe. */
const PROPRIEDADES = {
  "ADBE Vector Shape - Rect": ["ADBE Vector Rect Size", "ADBE Vector Rect Roundness"],
  "ADBE Vector Shape - Ellipse": ["ADBE Vector Ellipse Size"],
  "ADBE Vector Shape - Star": [
    "ADBE Vector Star Type",
    "ADBE Vector Star Points",
    "ADBE Vector Star Outer Radius",
    "ADBE Vector Star Inner Radius",
    "ADBE Vector Star Outer Roundess"
  ],
  "ADBE Vector Shape - Group": ["ADBE Vector Shape"],
  "ADBE Vector Graphic - Fill": ["ADBE Vector Fill Color"],
  "ADBE Vector Graphic - Stroke": ["ADBE Vector Stroke Color", "ADBE Vector Stroke Width"],
  "ADBE Vector Group": [],
  "ADBE Vectors Group": []
};

class FakePropertyGroup {
  constructor(matchName) {
    this.matchName = matchName;
    this.name = matchName;
    this.propertyType = PropertyType.INDEXED_GROUP;
    this.filhos = [];
    for (const nome of PROPRIEDADES[matchName] ?? []) this.filhos.push(new FakeProperty(nome));
    if (matchName === "ADBE Vector Group") this.filhos.push(new FakePropertyGroup("ADBE Vectors Group"));
  }
  get numProperties() {
    return this.filhos.length;
  }
  property(chave) {
    if (typeof chave === "number") return this.filhos[chave - 1] ?? null;
    return this.filhos.find((filho) => filho.matchName === chave) ?? null;
  }
  addProperty(matchName) {
    if (!Object.prototype.hasOwnProperty.call(PROPRIEDADES, matchName)) {
      throw new Error(`matchName desconhecido: ${matchName}`);
    }
    const filho = new FakePropertyGroup(matchName);
    this.filhos.push(filho);
    return filho;
  }
}

class FakeShapeLayer {
  constructor() {
    this.name = "Shape Layer 1";
    this.contents = new FakePropertyGroup("ADBE Root Vectors Group");
    this.posicao = new FakeProperty("ADBE Position");
    this.transform = { property: (n) => (n === "ADBE Position" ? this.posicao : null) };
    this.removido = false;
  }
  property(matchName) {
    if (matchName === "ADBE Root Vectors Group") return this.contents;
    if (matchName === "ADBE Transform Group") return this.transform;
    return null;
  }
  remove() {
    this.removido = true;
  }
}

class FakeCompItem {
  constructor() {
    this.criadas = [];
    this.selectedLayers = [];
    this.selectedProperties = [];
    this.frameDuration = 1 / 25;
    this.time = 0;
    this.numLayers = 0;
    this.layers = {
      addShape: () => {
        const layer = new FakeShapeLayer();
        this.criadas.push(layer);
        return layer;
      }
    };
  }
}

async function fixture(comp = new FakeCompItem()) {
  const calls = [];
  const app = {
    project: { activeItem: comp, expressionEngine: "javascript-1.0" },
    beginUndoGroup(label) {
      calls.push(["begin", label]);
    },
    endUndoGroup() {
      calls.push(["end"]);
    }
  };
  const scope = await loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/commands/shape-library.jsx",
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      ShapeLayer: FakeShapeLayer,
      Property: FakeProperty,
      PropertyGroup: FakePropertyGroup,
      PropertyType,
      PropertyValueType,
      Shape: FakeShape
    }
  );
  return { scope, app, comp, calls };
}

function request(args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: "shape-1",
    command: "ae.shape.library",
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

const baseArgs = {
  shapeType: "rectangle",
  size: 200,
  fillColor: [1, 0.5, 0],
  strokeColor: [0, 0, 0],
  strokeWidth: 0,
  roundness: 20,
  points: 5,
  position: [960, 540]
};

/** Conteúdo do primeiro grupo da camada criada. */
function conteudoDe(layer) {
  return layer.contents.property(1).property("ADBE Vectors Group");
}

test("o retangulo sai como operador nativo, com Tamanho editavel no timeline", async () => {
  const { scope, comp, calls } = await fixture();

  const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));

  assert.equal(resposta.ok, true);
  assert.equal(comp.criadas.length, 1);
  const inner = conteudoDe(comp.criadas[0]);
  const rect = inner.property("ADBE Vector Shape - Rect");
  assert.ok(rect, "esperava operador de retangulo, e nao caminho assado");
  assert.deepEqual(rect.property("ADBE Vector Rect Size").value, [200, 200]);
  assert.deepEqual(calls, [["begin", "Moti.on: criar forma"], ["end"]]);
});

test("so o retangulo arredondado recebe arredondamento", async () => {
  const comum = await fixture();
  comum.scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "rectangle", roundness: 40 }));
  const rectComum = conteudoDe(comum.comp.criadas[0]).property("ADBE Vector Shape - Rect");
  assert.equal(rectComum.property("ADBE Vector Rect Roundness").value, 0, "canto redondo mudaria a forma pedida");

  const arredondado = await fixture();
  arredondado.scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "roundedRectangle", roundness: 40 }));
  const rectRedondo = conteudoDe(arredondado.comp.criadas[0]).property("ADBE Vector Shape - Rect");
  assert.equal(rectRedondo.property("ADBE Vector Rect Roundness").value, 40);
});

test("circulo usa o operador de elipse", async () => {
  const { scope, comp } = await fixture();
  scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "circle", size: 120 }));

  const elipse = conteudoDe(comp.criadas[0]).property("ADBE Vector Shape - Ellipse");
  assert.ok(elipse);
  assert.deepEqual(elipse.property("ADBE Vector Ellipse Size").value, [120, 120]);
});

test("poligono e estrela usam o mesmo operador e diferem so no tipo", async () => {
  const poligono = await fixture();
  poligono.scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "polygon", points: 6 }));
  const opPoligono = conteudoDe(poligono.comp.criadas[0]).property("ADBE Vector Shape - Star");
  assert.equal(opPoligono.property("ADBE Vector Star Type").value, 2);
  assert.equal(opPoligono.property("ADBE Vector Star Points").value, 6);
  assert.equal(opPoligono.property("ADBE Vector Star Inner Radius").value, null, "poligono nao tem raio interno");

  const estrela = await fixture();
  estrela.scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "star", size: 200, points: 5 }));
  const opEstrela = conteudoDe(estrela.comp.criadas[0]).property("ADBE Vector Shape - Star");
  assert.equal(opEstrela.property("ADBE Vector Star Type").value, 1);
  assert.equal(opEstrela.property("ADBE Vector Star Outer Radius").value, 100);
  assert.equal(opEstrela.property("ADBE Vector Star Inner Radius").value, 50);
});

test("linha, seta e balao viram caminho nativo, sem importar asset", async () => {
  for (const [tipo, fechado, vertices] of [
    ["line", false, 2],
    ["arrow", true, 7],
    ["callout", true, 7]
  ]) {
    const { scope, comp } = await fixture();
    const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: tipo })));

    assert.equal(resposta.ok, true, `${tipo} deveria criar`);
    const grupo = conteudoDe(comp.criadas[0]).property("ADBE Vector Shape - Group");
    assert.ok(grupo, `${tipo} deveria usar caminho nativo`);
    const forma = grupo.property("ADBE Vector Shape").value;
    assert.equal(forma.closed, fechado, `${tipo}: fechamento errado`);
    assert.equal(forma.vertices.length, vertices, `${tipo}: contagem de vertices`);
  }
});

test("o traco so entra quando tem espessura", async () => {
  const semTraco = await fixture();
  semTraco.scope.MotionAE.dispatch(request({ ...baseArgs, strokeWidth: 0 }));
  assert.equal(
    conteudoDe(semTraco.comp.criadas[0]).property("ADBE Vector Graphic - Stroke"),
    null,
    "espessura zero nao justifica um operador de traco no timeline"
  );

  const comTraco = await fixture();
  comTraco.scope.MotionAE.dispatch(request({ ...baseArgs, strokeWidth: 6, strokeColor: [0, 0, 1] }));
  const traco = conteudoDe(comTraco.comp.criadas[0]).property("ADBE Vector Graphic - Stroke");
  assert.ok(traco);
  assert.equal(traco.property("ADBE Vector Stroke Width").value, 6);
  assert.deepEqual(traco.property("ADBE Vector Stroke Color").value, [0, 0, 1]);
});

test("a camada nasce na posicao pedida e com o prefixo do plugin no nome", async () => {
  const { scope, comp } = await fixture();
  scope.MotionAE.dispatch(request({ ...baseArgs, position: [300, 400] }));

  const layer = comp.criadas[0];
  assert.deepEqual(layer.posicao.value, [300, 400]);
  assert.equal(layer.name, "MOTION | RECTANGLE");
});

test("cor fora de 0..1 e recusada antes de criar camada", async () => {
  const { scope, comp, calls } = await fixture();

  // O After Effects usa RGB normalizado; 255 aqui viraria branco estourado sem
  // aviso nenhum.
  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, fillColor: [255, 128, 0] })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(resposta.error.details.field, "fillColor");
  assert.equal(comp.criadas.length, 0, "nenhuma camada foi criada");
  assert.deepEqual(calls, []);
});

test("tipo de forma desconhecido e recusado", async () => {
  const { scope, comp } = await fixture();

  const resposta = JSON.parse(scope.MotionAE.dispatch(request({ ...baseArgs, shapeType: "hexagono" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "INVALID_PRESET");
  assert.equal(comp.criadas.length, 0);
});

test("falha no meio da montagem remove a camada recem-criada", async () => {
  const comp = new FakeCompItem();
  const { scope } = await fixture(comp);

  // Faz o preenchimento faltar: a montagem lanca depois da camada existir.
  const original = FakePropertyGroup.prototype.property;
  FakePropertyGroup.prototype.property = function (chave) {
    if (chave === "ADBE Vector Graphic - Fill") return null;
    return original.call(this, chave);
  };

  try {
    const resposta = JSON.parse(scope.MotionAE.dispatch(request(baseArgs)));
    assert.equal(resposta.ok, false);
    assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
    assert.equal(comp.criadas.length, 1, "a camada chegou a ser criada");
    assert.equal(comp.criadas[0].removido, true, "e foi removida no rollback");
  } finally {
    FakePropertyGroup.prototype.property = original;
  }
});
