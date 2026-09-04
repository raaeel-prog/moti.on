/**
 * Dublês de keyframe do After Effects para os testes de host.
 *
 * O harness carrega os fontes ExtendScript de verdade; o que falta é o lado do
 * host. Estes dublês implementam a superfície de `Property` que
 * `keyframe-operations.jsx` toca — captura, remoção e recriação — com a
 * fidelidade que os testes precisam: `setValueAtTime` reinsere em ordem de
 * tempo, como o host faz, e `falhaEm` deixa cada teste escolher em que
 * escrita o host desiste, que é como o rollback é exercitado.
 *
 * Vive num módulo próprio porque mais de um comando de keyframe é testado
 * contra exatamente a mesma superfície, e uma cópia por arquivo de teste
 * significaria que uma correção de fidelidade num dublê não alcança os outros.
 */

export const PropertyType = { PROPERTY: 1 };
export const PropertyValueType = {
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

export class FakeKeyframeEase {
  constructor(speed, influence) {
    this.speed = speed;
    this.influence = influence;
  }
}

export const clone = (v) => (Array.isArray(v) ? [...v] : v);

/** @param {number} time @param {unknown} value @param {number} influenceOut @param {number} influenceIn */
export function makeKey(time, value, influenceOut, influenceIn) {
  return {
    time,
    value: clone(value),
    inInterpolation: 2,
    outInterpolation: 2,
    // influenceOut/influenceIn são propositalmente distintos por keyframe,
    // para o teste conseguir provar de qual keyframe cada ease veio depois
    // da troca.
    inEase: [new FakeKeyframeEase(0, influenceIn)],
    outEase: [new FakeKeyframeEase(0, influenceOut)],
    temporalContinuous: false,
    temporalAutoBezier: false,
    roving: false,
    selected: true,
    label: 0
  };
}

export class FakeProperty {
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
    this.keys.push(makeKey(time, value, 16.67, 16.67));
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

export class FakeCompItem {
  constructor(propriedades) {
    this.selectedLayers = [];
    this.selectedProperties = propriedades;
    this.frameDuration = 1 / 25;
    // Bordas que `ae.keys.send-to-edge` mede. Sobrescreva no teste quando a
    // borda for o ponto do exercicio.
    this.duration = 10;
    this.workAreaStart = 0;
    this.workAreaDuration = 10;
    this.numLayers = 0;
    this.time = 0;
  }
}
