/**
 * Dubles do After Effects para os testes de `ae.keys.ease.apply`.
 *
 * O harness carrega os fontes ExtendScript de verdade; o que falta e a
 * superficie de `Property`, `CompItem` e `Layer` que o comando toca. Estes
 * dubles reproduzem o que importa para os testes: `setValueAtTime` reinsere em
 * ordem de tempo, `nearestKeyIndex` procura pelo tempo, `selectedKeys` deriva
 * da flag de cada keyframe (como no host, onde remover um keyframe desloca os
 * indices selecionados), e `falhaEm` escolhe em qual escrita o host desiste.
 *
 * `parentProperty`, `propertyIndex`, `matchName`, `comp.id`, `numLayers` e
 * `layer(i)` existem para `describeProperty` e `MotionSelection.signature`
 * produzirem ids e assinaturas estaveis entre dois pedidos — e o que a sessao
 * do comando compara.
 */
import { loadHostModules } from "./host-harness.mjs";

export const PropertyType = { PROPERTY: 1 };
export const PropertyValueType = { NO_VALUE: 0, ThreeD_SPATIAL: 2, ThreeD: 3, TwoD_SPATIAL: 4, TwoD: 5, OneD: 6, COLOR: 7, SHAPE: 12 };
export const KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };
export const FD = 1 / 25;

export class FakeKeyframeEase {
  constructor(speed, influence) { this.speed = speed; this.influence = influence; }
}

export const clone = (v) => (Array.isArray(v) ? [...v] : v);

export function makeKey(time, value, eases) {
  return {
    time, value: clone(value),
    inInterpolation: KeyframeInterpolationType.BEZIER, outInterpolation: KeyframeInterpolationType.BEZIER,
    inEase: Array.from({ length: eases }, () => new FakeKeyframeEase(0, 16.67)),
    outEase: Array.from({ length: eases }, () => new FakeKeyframeEase(0, 16.67)),
    temporalContinuous: false, temporalAutoBezier: false, roving: false, selected: false, label: 0,
    spatialIn: [0, 0, 0], spatialOut: [0, 0, 0], spatialAuto: true
  };
}

export class FakeLayer {
  constructor({ index = 1, name = "Layer " + index } = {}) {
    this.index = index; this.name = name; this.parentProperty = null;
    this.locked = false; this.inPoint = 0; this.outPoint = 10; this.threeDLayer = false;
  }
}

export class FakeProperty {
  constructor({ name = "Opacity", valueType = PropertyValueType.OneD, eases = 1, keys, selected, layer = null, propertyIndex = 1 }) {
    this.name = name; this.matchName = "ADBE " + name;
    this.propertyType = PropertyType.PROPERTY; this.propertyValueType = valueType;
    this.canVaryOverTime = true; this.canSetExpression = true; this.expression = ""; this.expressionEnabled = false;
    this.parentProperty = layer; this.propertyIndex = propertyIndex; this.selected = true;
    this.eases = eases;
    this.keys = keys.map(([time, value]) => makeKey(time, value, eases));
    this.selectedKeys = selected ?? keys.map((_, i) => i + 1);
    /** Toda escrita, na ordem. */
    this.chamadas = [];
    this.falhaEm = 0;
  }
  get numKeys() { return this.keys.length; }
  /** Derivada das flags, como no host: remover um keyframe desloca os indices. */
  get selectedKeys() { return this.keys.map((k, i) => (k.selected ? i + 1 : 0)).filter((i) => i > 0); }
  set selectedKeys(indices) { this.keys.forEach((k, i) => { k.selected = indices.includes(i + 1); }); }
  key(i) { const k = this.keys[i - 1]; if (!k) throw new Error(`key ${i} ausente`); return k; }
  keyTime(i) { return this.key(i).time; }
  keyValue(i) { return clone(this.key(i).value); }
  nearestKeyIndex(time) {
    let best = 1;
    for (let i = 1; i <= this.numKeys; i += 1) if (Math.abs(this.keyTime(i) - time) < Math.abs(this.keyTime(best) - time)) best = i;
    return best;
  }
  keyInInterpolationType(i) { return this.key(i).inInterpolation; }
  keyOutInterpolationType(i) { return this.key(i).outInterpolation; }
  keyInTemporalEase(i) { return this.key(i).inEase.map((e) => new FakeKeyframeEase(e.speed, e.influence)); }
  keyOutTemporalEase(i) { return this.key(i).outEase.map((e) => new FakeKeyframeEase(e.speed, e.influence)); }
  keyTemporalContinuous(i) { return this.key(i).temporalContinuous; }
  keyTemporalAutoBezier(i) { return this.key(i).temporalAutoBezier; }
  keyRoving(i) { return this.key(i).roving; }
  keySelected(i) { return this.key(i).selected; }
  keyLabel(i) { return this.key(i).label; }
  keyInSpatialTangent(i) { return clone(this.key(i).spatialIn); }
  keyOutSpatialTangent(i) { return clone(this.key(i).spatialOut); }
  keySpatialContinuous() { return false; }
  keySpatialAutoBezier(i) { return this.key(i).spatialAuto; }
  #falha(mensagem) {
    if (this.falhaEm > 0) { this.falhaEm -= 1; if (this.falhaEm === 0) throw new Error(mensagem); }
  }
  removeKey(i) { this.chamadas.push({ tipo: "remocao", index: i, time: this.keyTime(i) }); this.keys.splice(i - 1, 1); }
  setValueAtTime(time, value) {
    this.#falha("o host recusou a escrita");
    this.chamadas.push({ tipo: "valor", time, value: clone(value) });
    this.keys.push(makeKey(time, value, this.eases));
    this.keys.sort((a, b) => a.time - b.time);
  }
  setInterpolationTypeAtKey(i, entrada, saida) {
    this.chamadas.push({ tipo: "interpolacao", index: i, time: this.keyTime(i), inType: entrada, outType: saida });
    this.key(i).inInterpolation = entrada; this.key(i).outInterpolation = saida;
  }
  setTemporalEaseAtKey(i, entrada, saida) {
    this.#falha("o host recusou o ease");
    this.chamadas.push({ tipo: "ease", index: i, time: this.keyTime(i), inEase: entrada, outEase: saida });
    this.key(i).inEase = entrada.map((e) => new FakeKeyframeEase(e.speed, e.influence));
    this.key(i).outEase = saida.map((e) => new FakeKeyframeEase(e.speed, e.influence));
  }
  setTemporalContinuousAtKey(i, v) { this.key(i).temporalContinuous = v; }
  setTemporalAutoBezierAtKey(i, v) { this.key(i).temporalAutoBezier = v; }
  setRovingAtKey(i, v) { this.chamadas.push({ tipo: "roving", index: i, v }); this.key(i).roving = v; }
  setSelectedAtKey(i, v) { this.key(i).selected = v; }
  setLabelAtKey(i, v) { this.key(i).label = v; }
  setSpatialTangentsAtKey(i, a, b) { this.chamadas.push({ tipo: "tangente", index: i, a, b }); this.key(i).spatialIn = a; this.key(i).spatialOut = b; }
  setSpatialContinuousAtKey() {}
  setSpatialAutoBezierAtKey(i, v) { this.chamadas.push({ tipo: "autoBezier", index: i, v }); this.key(i).spatialAuto = v; }
}

export class FakeCompItem {
  constructor(propriedades, { id = 1, layers = null, selectedLayers = [] } = {}) {
    this.id = id; this.name = "Comp " + id;
    this.selectedLayers = selectedLayers; this.selectedProperties = propriedades;
    this.frameDuration = FD; this.time = 0; this.duration = 10; this.frameRate = 25;
    this.width = 1920; this.height = 1080; this.workAreaStart = 0; this.workAreaDuration = 10;
    // Camadas: as informadas, ou as donas das propriedades (sem repetir), na
    // ordem em que aparecem — `layer(i)` responde pelo `index` de cada uma.
    this.layers = layers ?? [];
    if (!layers) {
      for (const p of propriedades) {
        let owner = p; let depth = 0;
        while (owner && owner.parentProperty && depth < 64) { owner = owner.parentProperty; depth += 1; }
        if (owner && owner !== p && !this.layers.includes(owner)) this.layers.push(owner);
      }
    }
  }
  get numLayers() { return this.layers.length; }
  layer(i) { return this.layers.find((l) => l.index === i) ?? null; }
}

/** `app` falso com contador de grupos de Undo abertos. */
export function makeApp(comp) {
  return {
    version: "26.3",
    undoGroups: 0,
    project: { activeItem: comp, expressionEngine: "javascript-1.0", file: null },
    beginUndoGroup() { this.undoGroups += 1; },
    endUndoGroup() {}
  };
}

export const EASE_MODULES = [
  "generated/motion-contracts.jsx", "generated/motion-descriptors.jsx", "src/json.jsx", "src/undo.jsx",
  "src/registry.jsx", "src/keyframe-operations.jsx", "src/selection-signature.jsx",
  "src/commands/keys-ease.jsx", "src/commands/context-read.jsx", "src/dispatch.jsx"
];

export function hostGlobals(app) {
  return {
    app, CompItem: FakeCompItem, Property: FakeProperty, PropertyType, PropertyValueType,
    KeyframeEase: FakeKeyframeEase, KeyframeInterpolationType
  };
}

/**
 * Despacha um comando contra uma composicao ja montada. `app` e opcional: sem
 * ele, um novo `makeApp(comp)` por chamada.
 */
export async function dispatchWith({ comp, app = makeApp(comp), command = "ae.keys.ease.apply", requestId = "ease" }, args) {
  const scope = await loadHostModules(EASE_MODULES, hostGlobals(app));
  return JSON.parse(scope.MotionAE.dispatch(JSON.stringify({
    protocolVersion: 1, requestId, command, args,
    context: { host: "after-effects", hostVersion: "26.3", locale: "pt_BR" }, options: {}
  })));
}

/** Composicao nova por chamada, com as propriedades dadas selecionadas. */
export async function dispatch(propriedades, args) {
  return dispatchWith({ comp: new FakeCompItem(propriedades), requestId: "ease-points-bake" }, args);
}
