/**
 * Rollback dos comandos de keyframe.
 *
 * Uma auditoria dos 34 arquivos de comando mostrou três mutantes sem rollback:
 * `keys-reverse`, `keys-clone` e `keys-ease`. Os três reescrevem propriedades
 * por `MotionKeyframes.restoreProperty`, que **remove todas as keys antes de
 * recriar** — se algo falhar no meio, ou se a segunda propriedade falhar depois
 * de a primeira já ter sido reescrita, a §8 é violada: um comando que falha tem
 * de deixar o projeto como estava.
 *
 * Estes testes fazem a escrita falhar de propósito e conferem que o estado
 * anterior volta. Sem eles, o rollback seria código que ninguém nunca executou.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

const PropertyType = { PROPERTY: 1 };
const PropertyValueType = {
  NO_VALUE: 0,
  OneD: 1,
  TwoD: 2,
  TwoD_SPATIAL: 3,
  ThreeD: 4,
  ThreeD_SPATIAL: 5,
  COLOR: 6,
  CUSTOM_VALUE: 7,
  MARKER: 8,
  TEXT_DOCUMENT: 12
};

class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

const clone = (v) => (Array.isArray(v) ? [...v] : v);

function makeKey(time, value) {
  return {
    time,
    value: clone(value),
    inInterpolation: 2,
    outInterpolation: 2,
    inEase: [new FakeKeyframeEase(0, 16.67)],
    outEase: [new FakeKeyframeEase(0, 16.67)],
    temporalContinuous: false,
    temporalAutoBezier: false,
    roving: false,
    selected: true,
    label: 0
  };
}

class FakeProperty {
  constructor(nome, keys) {
    this.name = nome;
    this.matchName = "ADBE " + nome;
    this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = PropertyValueType.OneD;
    this.canVaryOverTime = true;
    this.canSetExpression = true;
    this.expression = "";
    this.expressionEnabled = false;
    this.expressionError = "";
    this.parentProperty = null;
    this.keys = keys.map((k) => ({ ...k }));
    this.selectedKeys = keys.map((_, i) => i + 1);
    /** Quando > 0, decrementa e lança: simula falha do host no meio da escrita. */
    this.falhaEm = 0;
  }
  get numKeys() {
    return this.keys.length;
  }
  key(i) {
    const k = this.keys[i - 1];
    if (!k) throw new Error(`key ${i} ausente`);
    return k;
  }
  keyTime(i) {
    return this.key(i).time;
  }
  keyValue(i) {
    return clone(this.key(i).value);
  }
  keyInInterpolationType(i) {
    return this.key(i).inInterpolation;
  }
  keyOutInterpolationType(i) {
    return this.key(i).outInterpolation;
  }
  keyInTemporalEase(i) {
    return this.key(i).inEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  keyOutTemporalEase(i) {
    return this.key(i).outEase.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  keyTemporalContinuous(i) {
    return this.key(i).temporalContinuous;
  }
  keyTemporalAutoBezier(i) {
    return this.key(i).temporalAutoBezier;
  }
  keyRoving(i) {
    return this.key(i).roving;
  }
  keySelected(i) {
    return this.key(i).selected;
  }
  keyLabel(i) {
    return this.key(i).label;
  }
  removeKey(i) {
    this.keys.splice(i - 1, 1);
  }
  setValueAtTime(time, value) {
    if (this.falhaEm > 0) {
      this.falhaEm -= 1;
      if (this.falhaEm === 0) throw new Error("o host recusou a escrita");
    }
    this.keys.push(makeKey(time, value));
    this.keys.sort((a, b) => a.time - b.time);
  }
  setInterpolationTypeAtKey(i, entrada, saida) {
    this.key(i).inInterpolation = entrada;
    this.key(i).outInterpolation = saida;
  }
  setTemporalEaseAtKey(i, entrada, saida) {
    if (this.falhaEm > 0) {
      this.falhaEm -= 1;
      if (this.falhaEm === 0) throw new Error("o host recusou o ease");
    }
    this.key(i).inEase = entrada.map((e) => new FakeKeyframeEase(e.speed, e.influence));
    this.key(i).outEase = saida.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  setTemporalContinuousAtKey(i, v) {
    this.key(i).temporalContinuous = v;
  }
  setTemporalAutoBezierAtKey(i, v) {
    this.key(i).temporalAutoBezier = v;
  }
  setRovingAtKey(i, v) {
    this.key(i).roving = v;
  }
  setSelectedAtKey(i, v) {
    this.key(i).selected = v;
  }
  setLabelAtKey(i, v) {
    this.key(i).label = v;
  }
}

class FakeCompItem {
  constructor(propriedades) {
    this.selectedLayers = [];
    this.selectedProperties = propriedades;
    this.frameDuration = 1 / 25;
    this.numLayers = 0;
    this.time = 0;
  }
}

async function fixture(comp, files) {
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
      "src/keyframe-operations.jsx",
      ...files,
      "src/dispatch.jsx"
    ],
    {
      app,
      CompItem: FakeCompItem,
      Property: FakeProperty,
      PropertyType,
      PropertyValueType,
      KeyframeEase: FakeKeyframeEase,
      KeyframeInterpolationType: { LINEAR: 1, BEZIER: 2, HOLD: 3 }
    }
  );
  return { scope, calls };
}

function request(command, args) {
  return JSON.stringify({
    protocolVersion: 1,
    requestId: `${command}-1`,
    command,
    args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" },
    options: {}
  });
}

/** Retrato do que interessa comparar antes e depois. */
function retrato(property) {
  return property.keys.map((k) => [k.time, k.value]);
}

test("Reverse: falha na escrita devolve os keyframes que existiam", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 0), makeKey(1, 50), makeKey(2, 100)]);
  const antes = retrato(property);
  // A terceira recriação falha: a propriedade já foi esvaziada a essa altura.
  property.falhaEm = 3;

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse", {})));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED", "falha do host, nao de rollback");
  assert.deepEqual(retrato(property), antes, "os keyframes originais voltaram");
});

test("Clone: falha na escrita devolve os keyframes que existiam", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 0), makeKey(1, 100)]);
  const antes = retrato(property);
  property.falhaEm = 2;

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-clone.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.clone", { mode: "repeat" })));

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(retrato(property), antes);
});

test("Ease: falha no segundo keyframe nao deixa metade na curva nova", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 0), makeKey(1, 100)]);
  const easeAntes = property.keys.map((k) => k.outEase[0].influence);
  // A segunda escrita de ease falha, depois de a primeira já ter passado.
  property.falhaEm = 2;

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-ease.jsx"]);
  const resposta = JSON.parse(
    scope.MotionAE.dispatch(
      request("ae.keys.ease.apply", { x1: 0.5, y1: 1, x2: 0.5, y2: 0, applyIn: true, applyOut: true })
    )
  );

  assert.equal(resposta.ok, false);
  assert.equal(resposta.error.code, "HOST_OPERATION_FAILED");
  assert.deepEqual(
    property.keys.map((k) => k.outEase[0].influence),
    easeAntes,
    "nenhum keyframe ficou com a curva nova"
  );
});

test("a segunda propriedade falhar nao deixa a primeira reescrita", async () => {
  const primeira = new FakeProperty("Opacity", [makeKey(0, 0), makeKey(1, 100)]);
  const segunda = new FakeProperty("Rotation", [makeKey(0, 0), makeKey(1, 90)]);
  const antesPrimeira = retrato(primeira);
  segunda.falhaEm = 1;

  const { scope } = await fixture(new FakeCompItem([primeira, segunda]), ["src/commands/keys-reverse.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse", {})));

  assert.equal(resposta.ok, false);
  // É o caso que motivou a auditoria: a primeira propriedade já tinha sido
  // reescrita com sucesso quando a segunda falhou.
  assert.deepEqual(retrato(primeira), antesPrimeira, "a primeira propriedade voltou ao que era");
});

test("quando o proprio rollback falha, o codigo distingue os dois casos", async () => {
  const property = new FakeProperty("Opacity", [makeKey(0, 0), makeKey(1, 100)]);
  // Toda escrita falha: a aplicação falha e a restauração também.
  property.setValueAtTime = () => {
    throw new Error("o host esta recusando tudo");
  };

  const { scope } = await fixture(new FakeCompItem([property]), ["src/commands/keys-reverse.jsx"]);
  const resposta = JSON.parse(scope.MotionAE.dispatch(request("ae.keys.reverse", {})));

  assert.equal(resposta.ok, false);
  // ROLLBACK_FAILED e HOST_OPERATION_FAILED levam o painel a agir diferente: um
  // pede Ctrl+Z do usuário, o outro diz que nada mudou.
  assert.equal(resposta.error.code, "ROLLBACK_FAILED");
});
