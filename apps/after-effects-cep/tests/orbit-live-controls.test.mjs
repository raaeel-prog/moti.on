/** Orbit's emitted expressions are evaluated here against native-control doubles.
 * This checks shared null edits and trajectory math; real AE remains a separate gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadHostModules} from './host-harness.mjs';

const PropertyType = {PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3};
const PropertyValueType = {NO_VALUE: 0, OneD: 1, TwoD: 2, TwoD_SPATIAL: 3, ThreeD: 4, ThreeD_SPATIAL: 6, COLOR: 9};
const copy = value => Array.isArray(value) ? [...value] : value;
const defaults = {radius: 400, speed: 90, inclination: 0, phase: 0, targetMode: 'newController', faceTarget: false, bake: false};
const presets = ['frontal', 'horizontal', 'vertical', 'diagonal', 'reverseDiagonal', 'side', 'sphere', 'tiltedSphere'];
const near = (a, b, tolerance = 1e-7) => Math.abs(a - b) < tolerance;
const distance = (a, b = [0, 0, 0]) => Math.hypot(...a.map((value, i) => value - b[i]));

class Property {
  constructor(matchName, value, owner = null) {
    Object.assign(this, {matchName, name: matchName, owner, raw: copy(value), keys: [], canVaryOverTime: true,
      canSetExpression: true, expressionEnabled: false, _expression: '', failExpression: false,
      propertyType: PropertyType.PROPERTY, propertyValueType: Array.isArray(value) ? PropertyValueType.ThreeD_SPATIAL : PropertyValueType.OneD,
      dimensionsSeparated: false});
  }
  get expression() { return this._expression; }
  set expression(value) { this._expression = value; }
  get expressionError() { return this.failExpression && this._expression ? 'Expression rejected by fixture' : ''; }
  get numKeys() { return this.keys.length; }
  get value() { return this.valueAtTime(this.owner?.comp?.time ?? 0, false); }
  set value(value) { this.raw = copy(value); }
  setValue(value) { if (this.numKeys) throw new Error('setValue on animated property'); this.raw = copy(value); }
  setValueAtTime(time, value) { this.keys.push({time, value: copy(value)}); this.keys.sort((a, b) => a.time - b.time); }
  removeKey(index) { this.keys.splice(index - 1, 1); }
  valueAtTime(time, preExpression) {
    const key = this.keys.filter(item => item.time <= time).at(-1) ?? this.keys[0];
    const value = copy(key?.value ?? this.raw);
    if (!preExpression && this.expressionEnabled && this._expression && this.owner) return evaluate(this._expression, this.owner, time, value, [], this);
    return value;
  }
}

class Effect {
  constructor(parade, state, generation = parade.generation) { Object.assign(this, {parade, state, generation}); }
  fresh() { if (this.generation !== this.parade.generation) throw new Error('Stale native effect handle'); }
  get matchName() { this.fresh(); return this.state.matchName; }
  get name() { this.fresh(); return this.state.name; }
  set name(value) { this.fresh(); this.state.name = value; }
  get propertyIndex() { this.fresh(); return this.parade.states.indexOf(this.state) + 1; }
  get numProperties() { return 1; }
  property(index) { this.fresh(); return index === 1 ? this.parade.parameter(this.state) : null; }
  remove() { this.fresh(); this.parade.states.splice(this.propertyIndex - 1, 1); this.parade.generation++; }
}

class Parade {
  constructor(owner) { Object.assign(this, {owner, states: [], generation: 0, failAt: null, dropdown: true, dynamicDropdown: false, nativeMatchTransitions: []}); }
  get numProperties() { return this.states.length; }
  property(key) {
    const state = typeof key === 'number' ? this.states[key - 1] : this.states.find(item => item.name === key || item.matchName === key);
    return state ? new Effect(this, state) : null;
  }
  canAddProperty() { return true; }
  parameter(state) {
    if (!state.dynamicDropdown) return state.param;
    const generation = this.generation;
    const fresh = () => {if (this.generation !== generation) throw new Error('Stale native dropdown parameter handle');};
    return new Proxy(state.param, {
      get: (target, key) => {fresh(); const value = Reflect.get(target, key, target); return typeof value === 'function' ? (...args) => {fresh(); return value.apply(target, args);} : value;},
      set: (target, key, value) => {fresh(); return Reflect.set(target, key, value, target);}
    });
  }
  addProperty(matchName) {
    if (this.numProperties + 1 === this.failAt) throw new Error('Native effect creation failed');
    const param = new Property(`${matchName}-0001`, 0);
    param.isDropdownEffect = matchName === 'ADBE Dropdown Control' && this.dropdown;
    const dynamicDropdown = matchName === 'ADBE Dropdown Control' && this.dynamicDropdown;
    const state = {name: matchName, matchName: dynamicDropdown ? 'Pseudo/@@before-menu' : matchName, param, dynamicDropdown};
    param.setPropertyParameters = items => {
      if (!param.isDropdownEffect) throw new Error('Dropdown unavailable'); param.items = [...items];
      if (dynamicDropdown) {
        this.nativeMatchTransitions.push([state.matchName, 'Pseudo/@@after-menu']);
        state.matchName = 'Pseudo/@@after-menu'; state.name = 'Localized Dropdown Control'; param.matchName = state.matchName + '-0001';
        this.generation++;
      }
      return this.parameter(state);
    };
    this.states.push(state); this.generation++;
    return this.property(this.numProperties);
  }
}

let nextId = 0;
class Layer {
  constructor(name, {nullLayer = false, threeDLayer = false} = {}) {
    Object.assign(this, {id: ++nextId, name, nullLayer, threeDLayer, selected: true, parent: null, comment: '', locked: false, startTime: 0});
    this.position = new Property('ADBE Position', threeDLayer ? [100, 200, 0] : [100, 200], this);
    this.anchorPoint = new Property('ADBE Anchor Point', nullLayer ? [50, 50, 0] : [0, 0, 0], this);
    this.orientation = new Property('ADBE Orientation', [0, 0, 0], this);
    this.effects = new Parade(this);
    this.transform = {property: name => ({'ADBE Position': this.position, 'ADBE Anchor Point': this.anchorPoint, 'ADBE Orientation': this.orientation})[name] ?? null};
  }
  get index() { return this.comp?.all.indexOf(this) + 1; }
  property(name) { return name === 'ADBE Transform Group' ? this.transform : name === 'ADBE Effect Parade' ? this.effects : null; }
  remove() { this.comp.all.splice(this.comp.all.indexOf(this), 1); }
}

class CompItem {
  constructor(count = 4) {
    Object.assign(this, {all: [], time: 0.75, width: 1920, height: 1080, duration: 2, frameDuration: 1 / 25, selectedProperties: []});
    for (let i = 0; i < count; i++) this.add(new Layer(`Member ${i + 1}`));
    this.layers = {addNull: () => {
      for (const layer of this.all) layer.selected = false;
      const layer = this.add(new Layer('Null', {nullLayer: true}));
      if (this.configureNull) this.configureNull(layer);
      return layer;
    }};
  }
  add(layer) { layer.comp = this; this.all.unshift(layer); return layer; }
  get numLayers() { return this.all.length; }
  get selectedLayers() { return this.all.filter(layer => layer.selected); }
  layer(index) { return this.all[index - 1] ?? null; }
  select(layers) { for (const layer of this.all) layer.selected = layers.includes(layer); }
}

function evaluate(source, layer, time, value, lookCalls = [], property = layer.position) {
  const ref = item => ({
    get anchorPoint() { return item.anchorPoint.valueAtTime(time, false); },
    transform: {get anchorPoint() { return item.anchorPoint.valueAtTime(time, false); }},
    effect: name => index => { const effect = item.effects.property(name); if (!effect) throw new Error(`Missing effect: ${name}`); return effect.property(index).valueAtTime(time, false); }
  });
  const context = {
    time, value, Math, parent: layer.parent ? ref(layer.parent) : null,
    thisLayer: {get parent() { return layer.parent ? ref(layer.parent) : null; }},
    position: property === layer.position ? value : layer.position.valueAtTime(time, false),
    degreesToRadians: degrees => degrees * Math.PI / 180,
    radiansToDegrees: radians => radians * 180 / Math.PI,
    clamp: (number, min, max) => Math.min(max, Math.max(min, number)),
    add: (a, b) => a.map((x, i) => x + b[i]), sub: (a, b) => a.map((x, i) => x - b[i]),
    length: (a, b = a.map(() => 0)) => distance(a, b),
    lookAt: (from, to) => { lookCalls.push({from: [...from], to: [...to]}); return [11, 22, 33]; }
  };
  return copy(vm.runInNewContext(source, context, {timeout: 1000}));
}

async function fixture(count = 4) {
  const comp = new CompItem(count), calls = [];
  const app = {project: {activeItem: comp, expressionEngine: 'javascript-1.0'}, beginUndoGroup: label => calls.push(['begin', label]), endUndoGroup: () => calls.push(['end'])};
  const scope = await loadHostModules([
    'generated/motion-contracts.jsx', 'generated/motion-descriptors.jsx', 'src/json.jsx', 'src/undo.jsx', 'src/registry.jsx',
    'src/effect-operations.jsx', 'src/keyframe-operations.jsx', 'src/live-controls.jsx', 'src/live-preset.jsx',
    'src/expression-templates.jsx', 'src/rig-meta.jsx', 'src/commands/three-d-orbit.jsx', 'src/dispatch.jsx'
  ], {app, CompItem, Property, PropertyType, PropertyValueType});
  const handler = scope.MotionRegistry.get('ae.3d.orbit'), originalRun = handler.run;
  let failure = null;
  handler.run = (...args) => {try {return originalRun(...args);} catch (error) {failure = String(error); throw error;}};
  const apply = (args = {}, options = {}) => {
    failure = null;
    const result = JSON.parse(scope.MotionAE.dispatch(JSON.stringify({protocolVersion: 1, requestId: 'orbit-live-qa', command: 'ae.3d.orbit',
      args: {...defaults, ...args}, context: {host: 'after-effects', hostVersion: '26.5', locale: 'pt-BR'}, options: {mode: 'quick', preserveSelection: true, emitLiveControls: true, ...options}})));
    if (failure) result.fixtureDiagnostic = failure;
    return result;
  };
  return {comp, scope, calls, apply, members: [...comp.selectedLayers]};
}

function controller(f) { return f.scope.MotionRigMeta.findController(f.comp, 'orbit'); }
function control(layer, slot) { return layer.effects.property(slot).property(1); }

test('Orbit applies once with nine native controls on one shared 3D null and keeps selection/time', async () => {
  const f = await fixture(), before = [...f.members], time = f.comp.time;
  const result = f.apply(); assert.equal(result.ok, true, JSON.stringify(result));
  const nullLayer = controller(f); assert.ok(nullLayer?.nullLayer && nullLayer.threeDLayer);
  assert.equal(nullLayer.effects.numProperties, 9);
  assert.deepEqual(nullLayer.anchorPoint.value, [0, 0, 0]);
  assert.deepEqual(f.comp.selectedLayers, before); assert.equal(f.comp.time, time);
  assert.equal(f.calls.length, 2);
  for (const member of before) {
    assert.equal(member.parent, nullLayer); assert.equal(member.threeDLayer, true);
    assert.equal(member.effects.numProperties, 0);
    assert.equal(member.position.expressionEnabled, true);
    assert.equal(f.scope.MotionExpressions.isManagedOrbitLive(member.position.expression), true);
  }
});

test('Editing radius, speed and phase on null changes evaluated positions without another Apply', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), member = f.members[0], source = member.position.expression;
  const initial = member.position.valueAtTime(1.25, false);
  control(nullLayer, 2).setValue(700);
  const bigger = member.position.valueAtTime(1.25, false); assert.ok(near(distance(bigger, nullLayer.anchorPoint.value), 700));
  assert.ok(distance(initial, bigger) > 100);
  control(nullLayer, 3).setValue(0);
  assert.deepEqual(member.position.valueAtTime(0, false), member.position.valueAtTime(1.5, false));
  const frozen = member.position.valueAtTime(1.25, false);
  control(nullLayer, 7).setValue(45);
  assert.ok(distance(frozen, member.position.valueAtTime(1.25, false)) > 50);
  assert.equal(member.position.expression, source); assert.equal(f.calls.length, 2);
});

test('Unavailable native dropdown uses indexed slider without changing sphere output', async () => {
  const f = await fixture(7); f.comp.configureNull = layer => { layer.effects.dropdown = false; };
  const result = f.apply({preset: 'sphere'}); assert.equal(result.ok, true, JSON.stringify(result));
  const nullLayer = controller(f); assert.equal(nullLayer.effects.numProperties, 9);
  assert.equal(nullLayer.effects.property(1).matchName, 'ADBE Slider Control'); assert.equal(control(nullLayer, 1).value, 7);
  for (const member of f.members) assert.ok(near(distance(member.position.value), 400));
});

test('Native dropdown dynamic pseudo match names and invalidated handles remain valid live sphere references', async () => {
  const f = await fixture(7); f.comp.configureNull = layer => { layer.effects.dynamicDropdown = true; };
  const result = f.apply({preset: 'sphere'}); assert.equal(result.ok, true, JSON.stringify(result));
  const nullLayer = controller(f), record = result.data.liveControls.find(item => item.paramId === 'preset'), effect = nullLayer.effects.property(1);
  assert.deepEqual(nullLayer.effects.nativeMatchTransitions, [['Pseudo/@@before-menu', 'Pseudo/@@after-menu']]);
  assert.equal(effect.matchName, 'Pseudo/@@after-menu'); assert.equal(effect.property(1).matchName, 'Pseudo/@@after-menu-0001');
  assert.equal(record.actualControl, 'dropdown'); assert.equal(record.matchName, effect.matchName); assert.equal(record.name, effect.name);
  assert.equal(control(nullLayer, 1).value, 7); assert.equal(nullLayer.effects.numProperties, 9);
  for (const member of f.members) {assert.ok(near(distance(member.position.value), 400)); assert.equal(member.position.expressionError, '');}
  assert.equal(f.apply({preset: 'sphere'}).ok, true, 'Reapply resolves final native identity');
});

test('Facing checkbox on null enables center facing immediately and retains base Orientation while off', async () => {
  const f = await fixture(); f.members[0].orientation.setValue([4, 8, 12]);
  assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), member = f.members[0], source = member.orientation.expression;
  assert.ok(source); assert.deepEqual(member.orientation.value, [4, 8, 12]);
  const anchor = [15, -7, 23]; nullLayer.anchorPoint.setValue(anchor); control(nullLayer, 9).setValue(1);
  const lookCalls = [];
  evaluate(source, member, f.comp.time, [4, 8, 12], lookCalls, member.orientation);
  assert.equal(lookCalls.length, 1); assert.deepEqual(lookCalls[0].to, anchor);
  assert.deepEqual(lookCalls[0].from, member.position.value);
  control(nullLayer, 9).setValue(0); assert.deepEqual(member.orientation.value, [4, 8, 12]);
  assert.equal(member.orientation.expression, source); assert.equal(f.calls.length, 2);
});

test('Every orbital preset keeps true radius and finite coordinates across time and arbitrary null anchor', async () => {
  for (const preset of presets) {
    const f = await fixture(7), result = f.apply({preset}); assert.equal(result.ok, true, `${preset}: ${JSON.stringify(result)}`);
    const nullLayer = controller(f), anchor = [37, -21, 49]; nullLayer.anchorPoint.setValue(anchor);
    for (const member of f.members) for (const time of [-1, 0, .75, 1.234, 8]) {
      const point = member.position.valueAtTime(time, false);
      assert.equal(point.length, 3); assert.ok(point.every(Number.isFinite), preset);
      assert.ok(near(distance(point, anchor), 400), `${preset}: radius ${distance(point, anchor)}`);
    }
  }
});

test('Perspective controls rotate trajectory without changing radius and sphere spreads objects in 3D', async () => {
  const f = await fixture(9); assert.equal(f.apply({preset: 'sphere'}).ok, true);
  const nullLayer = controller(f), points = f.members.map(member => member.position.value);
  assert.ok(Math.max(...points.map(point => point[1])) - Math.min(...points.map(point => point[1])) > 400);
  assert.equal(new Set(points.map(point => point.map(x => x.toFixed(3)).join(','))).size, points.length);
  control(nullLayer, 5).setValue(57); control(nullLayer, 6).setValue(-32); control(nullLayer, 4).setValue(23);
  const turned = f.members.map(member => member.position.value);
  assert.ok(turned.some((point, i) => distance(point, points[i]) > 100));
  for (const point of turned) assert.ok(near(distance(point), 400));
});

test('Repeated click reuses null and preserves manual and animated controls', async () => {
  const f = await fixture(); assert.equal(f.apply({preset: 'diagonal'}).ok, true);
  const nullLayer = controller(f); control(nullLayer, 2).setValue(610); control(nullLayer, 5).setValue(48);
  control(nullLayer, 3).setValueAtTime(0, 40); control(nullLayer, 3).setValueAtTime(2, 140);
  for (let i = 0; i < 2; i++) assert.equal(f.apply({preset: 'diagonal'}).ok, true);
  assert.equal(f.comp.numLayers, 5); assert.equal(controller(f), nullLayer);
  assert.equal(control(nullLayer, 2).value, 610); assert.equal(control(nullLayer, 5).value, 48);
  assert.equal(control(nullLayer, 3).numKeys, 2);
});

test('Selecting only null changes preset for all owned members and explicit preset resets additive perspective', async () => {
  const f = await fixture(); assert.equal(f.apply({preset: 'diagonal'}).ok, true);
  const nullLayer = controller(f), before = f.members.map(member => member.position.value);
  control(nullLayer, 5).setValue(70); control(nullLayer, 6).setValue(30);
  f.comp.select([nullLayer]); const result = f.apply({preset: 'sphere', applyPreset: true}); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(control(nullLayer, 1).value, 7); assert.equal(control(nullLayer, 5).value, 0); assert.equal(control(nullLayer, 6).value, 0);
  assert.ok(f.members.some((member, i) => distance(member.position.value, before[i]) > 50));
  assert.deepEqual(f.comp.selectedLayers, [nullLayer]); assert.equal(f.comp.numLayers, 5);
});

test('Regular click preserves a mode chosen directly on null even with remembered panel defaults', async () => {
  const f = await fixture(); assert.equal(f.apply({preset: 'frontal'}).ok, true);
  const nullLayer = controller(f); control(nullLayer, 1).setValue(7); control(nullLayer, 4).setValue(34);
  const before = f.members.map(member => member.position.value);
  assert.equal(f.apply({preset: 'frontal'}).ok, true);
  assert.equal(control(nullLayer, 1).value, 7); assert.equal(control(nullLayer, 4).value, 34);
  f.members.forEach((member, i) => assert.deepEqual(member.position.value, before[i]));
});

test('Explicit preset rejects animated additive angle before changing any control', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f); control(nullLayer, 5).setValueAtTime(0, 20); control(nullLayer, 5).setValueAtTime(2, 80);
  const before = f.calls.length, preset = control(nullLayer, 1).value;
  f.comp.select([nullLayer]); const result = f.apply({preset: 'sphere', applyPreset: true});
  assert.equal(result.ok, false); assert.equal(f.calls.length, before); assert.equal(control(nullLayer, 1).value, preset);
  assert.equal(control(nullLayer, 5).numKeys, 2);
});

test('Changed numeric request updates untouched null control while keeping manual edits', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f); control(nullLayer, 3).setValue(73);
  assert.equal(f.apply({radius: 520, speed: 150}, {mode: 'advanced'}).ok, true);
  assert.equal(control(nullLayer, 2).value, 520); assert.equal(control(nullLayer, 3).value, 73);
  for (const member of f.members) assert.ok(near(distance(member.position.value), 520));
});

test('Control expressions are preserved on ordinary Apply and conflict with explicit angle reset', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), speed = control(nullLayer, 3), angle = control(nullLayer, 5);
  speed.expression = '123'; speed.expressionEnabled = true;
  assert.equal(f.apply({speed: 200}).ok, true); assert.equal(speed.expression, '123'); assert.equal(speed.expressionEnabled, true); assert.equal(speed.raw, 90);
  angle.expression = '25'; angle.expressionEnabled = true;
  const before = f.calls.length, source = f.members[0].position.expression;
  const result = f.apply({preset: 'sphere', applyPreset: true}); assert.equal(result.ok, false); assert.equal(f.calls.length, before);
  assert.equal(angle.expression, '25'); assert.equal(angle.expressionEnabled, true); assert.equal(f.members[0].position.expression, source);
});

test('Missing or renamed native control rejects before modifying existing rig', async () => {
  for (const kind of ['missing', 'renamed']) {
    const f = await fixture(); assert.equal(f.apply().ok, true);
    const nullLayer = controller(f), source = f.members[0].position.expression;
    if (kind === 'missing') nullLayer.effects.property(2).remove();
    else nullLayer.effects.property(2).name = 'User renamed radius';
    const before = f.calls.length, count = nullLayer.effects.numProperties;
    const result = f.apply({radius: 700}); assert.equal(result.ok, false, kind);
    assert.equal(f.calls.length, before); assert.equal(nullLayer.effects.numProperties, count);
    assert.equal(f.members[0].position.expression, source);
  }
});

test('Partial owned selection safely adjusts full rig without changing deterministic member placement', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), before = f.members.map(member => member.position.value);
  f.comp.select([f.members[1]]); const result = f.apply(); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(f.comp.numLayers, 5); assert.equal(controller(f), nullLayer);
  f.members.forEach((member, i) => assert.deepEqual(member.position.value, before[i]));
  assert.deepEqual(f.comp.selectedLayers, [f.members[1]]);
});

test('Controller rename and timeline reordering retain parent-based live behavior', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), member = f.members[0], before = member.position.value;
  nullLayer.name = 'Meu centro'; f.comp.all.reverse();
  assert.deepEqual(member.position.value, before);
  assert.equal(f.apply().ok, true); assert.equal(controller(f), nullLayer); assert.equal(f.comp.numLayers, 5);
  assert.deepEqual(member.position.value, before);
});

test('User child under managed null blocks full rig update before Undo or control mutation', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), unowned = f.comp.add(new Layer('User child')); unowned.parent = nullLayer;
  f.comp.select([nullLayer]); const beforeCalls = f.calls.length, radius = control(nullLayer, 2).value;
  const result = f.apply({radius: 700, preset: 'sphere', applyPreset: true});
  assert.equal(result.ok, false); assert.equal(f.calls.length, beforeCalls); assert.equal(control(nullLayer, 2).value, radius);
  assert.equal(unowned.position.expression, '');
});

test('Legacy managed numeric orbit migrates to null controls and retains its editable null anchor', async () => {
  const f = await fixture(3), nullLayer = f.comp.add(new Layer('Legacy null', {nullLayer: true, threeDLayer: true}));
  nullLayer.comment = f.scope.MotionRigMeta.write('User note', JSON.stringify({rigType: 'orbit', schemaVersion: 1, controllerId: nullLayer.id}));
  const anchor = [...nullLayer.anchorPoint.value];
  f.members.forEach((member, ordinal) => {member.threeDLayer = true; member.parent = nullLayer;
    member.position.expression = f.scope.MotionExpressions.renderOrbit({...defaults, inclination: 37, phase: 30 + ordinal * 120}); member.position.expressionEnabled = true;});
  const times = [0, .37, 1, 2.5], before = f.members.map(member => times.map(time => member.position.valueAtTime(time, false)));
  f.comp.select([f.members[1]]); const result = f.apply({inclination: 37, phase: 30}); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(controller(f), nullLayer); assert.equal(nullLayer.effects.numProperties, 9); assert.deepEqual(nullLayer.anchorPoint.value, anchor);
  assert.ok(nullLayer.comment.startsWith('User note'));
  for (const member of f.members) { assert.ok(!member.position.expression.includes('var raio = 400;')); assert.ok(near(distance(member.position.value, anchor), 400)); }
  f.members.forEach((member, i) => times.forEach((time, j) => {
    const migrated = member.position.valueAtTime(time, false).map((value, axis) => value - anchor[axis]);
    assert.ok(distance(migrated, before[i][j]) < .001, 'Legacy trajectory relative to actual null pivot');
  }));
});

test('User expression, locked member and separated position fail before creating null', async () => {
  for (const kind of ['expression', 'locked', 'separated']) {
    const f = await fixture();
    if (kind === 'expression') f.members[1].position.expression = 'wiggle(2, 10)';
    if (kind === 'locked') f.members[1].locked = true;
    if (kind === 'separated') f.members[1].position.dimensionsSeparated = true;
    const result = f.apply(); assert.equal(result.ok, false, kind); assert.equal(f.comp.numLayers, 4); assert.deepEqual(f.calls, []);
    assert.ok(f.members.every(member => member.parent === null));
  }
});

test('Edited live expression body is rejected even when the managed v2 header remains', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const member = f.members[1]; member.position.expression += '\n// user extension\n';
  assert.equal(f.scope.MotionExpressions.isManagedOrbitLive(member.position.expression), false);
  const before = f.calls.length, source = member.position.expression;
  const result = f.apply(); assert.equal(result.ok, false); assert.equal(f.calls.length, before); assert.equal(member.position.expression, source);
});

test('Partial native-control creation failure removes null and preserves source layers', async () => {
  const f = await fixture(); f.comp.configureNull = layer => { layer.effects.failAt = 5; };
  const before = f.members.map(member => member.position.value);
  const result = f.apply(); assert.equal(result.ok, false); assert.equal(f.comp.numLayers, 4);
  f.members.forEach((member, i) => {assert.equal(member.parent, null); assert.equal(member.threeDLayer, false); assert.equal(member.position.expression, ''); assert.deepEqual(member.position.value, before[i]);});
  assert.deepEqual(f.comp.selectedLayers, f.members);
});

test('Mid-batch expression rejection restores converted layers and removes created controller', async () => {
  const f = await fixture(); f.members[1].position.failExpression = true;
  const before = f.members.map(member => member.position.value);
  const result = f.apply(); assert.equal(result.ok, false); assert.equal(f.comp.numLayers, 4);
  f.members.forEach((member, i) => {assert.equal(member.parent, null); assert.equal(member.threeDLayer, false); assert.equal(member.position.expression, ''); assert.equal(member.position.expressionEnabled, false); assert.deepEqual(member.position.value, before[i]);});
  assert.deepEqual(f.comp.selectedLayers, f.members);
});

test('Existing rig failure restores native control values, metadata and expressions as one batch', async () => {
  const f = await fixture(); assert.equal(f.apply({preset: 'diagonal'}).ok, true);
  const nullLayer = controller(f), before = {
    comment: nullLayer.comment,
    values: Array.from({length: 9}, (_, i) => control(nullLayer, i + 1).value),
    expressions: f.members.map(member => [member.position.expression, member.orientation.expression]),
    positions: f.members.map(member => member.position.value)
  };
  f.members[1].position.failExpression = true;
  const result = f.apply({radius: 650, preset: 'sphere', applyPreset: true});
  assert.equal(result.ok, false); assert.equal(result.error.code, 'HOST_OPERATION_FAILED', JSON.stringify(result));
  f.members[1].position.failExpression = false;
  assert.equal(f.comp.numLayers, 5); assert.equal(controller(f), nullLayer); assert.equal(nullLayer.comment, before.comment);
  assert.deepEqual(Array.from({length: 9}, (_, i) => control(nullLayer, i + 1).value), before.values);
  f.members.forEach((member, i) => {
    assert.equal(member.parent, nullLayer); assert.equal(member.threeDLayer, true);
    assert.deepEqual([member.position.expression, member.orientation.expression], before.expressions[i]);
    assert.deepEqual(member.position.value, before.positions[i]);
  });
  assert.deepEqual(f.comp.selectedLayers, f.members);
});

test('Bake stores actual evaluated live trajectory frame by frame and keeps shared parent', async () => {
  const f = await fixture(3); f.comp.duration = .2;
  assert.equal(f.apply({preset: 'tiltedSphere'}).ok, true);
  const nullLayer = controller(f), times = Array.from({length: 6}, (_, i) => i * f.comp.frameDuration);
  const samples = f.members.map(member => times.map(time => [...member.position.valueAtTime(time, false)]));
  const result = f.apply({preset: 'tiltedSphere', bake: true}); assert.equal(result.ok, true, JSON.stringify(result));
  for (let m = 0; m < f.members.length; m++) {
    const member = f.members[m]; assert.equal(member.parent, nullLayer); assert.equal(member.position.expression, ''); assert.equal(member.position.expressionEnabled, false);
    assert.equal(member.position.numKeys, times.length);
    member.position.keys.forEach((key, i) => assert.ok(distance(key.value, samples[m][i]) < .001));
  }
});

test('Prototype-named unknown argument keys are rejected before any Orbit mutation', async () => {
  for (const key of ['toString', 'valueOf', '__defineGetter__', 'constructor']) {
    const f = await fixture(), result = f.apply({[key]: 1});
    assert.equal(result.ok, false, key);
    // The shared JSON parser rejects constructor before command preflight.
    if (key !== 'constructor') assert.equal(result.error.code, 'INVALID_PRESET', key);
    assert.deepEqual(f.calls, []); assert.equal(f.comp.numLayers, 4); assert.ok(f.members.every(member => member.parent === null));
  }
});

test('Duplicate saved member identifiers do not duplicate followers or move existing ordinals', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), before = f.members.map(member => ({point: member.position.value, source: member.position.expression}));
  const {META_OPEN, META_CLOSE} = f.scope.MotionContracts;
  const metadata = JSON.parse(nullLayer.comment.substring(nullLayer.comment.indexOf(META_OPEN) + META_OPEN.length, nullLayer.comment.indexOf(META_CLOSE)));
  metadata.memberIds.splice(1, 0, metadata.memberIds[0]);
  nullLayer.comment = f.scope.MotionRigMeta.write(nullLayer.comment, JSON.stringify(metadata));
  const result = f.apply(); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.data.orbitedLayers, 4);
  f.members.forEach((member, i) => {assert.deepEqual(member.position.value, before[i].point); assert.equal(member.position.expression, before[i].source);});
  assert.equal(f.comp.numLayers, 5);
});

test('Hidden 2D Orientation keyframes are preserved and rejected before conversion or Undo', async () => {
  const f = await fixture(), member = f.members[1];
  member.orientation.setValueAtTime(0, [3, 5, 7]); member.orientation.setValueAtTime(1, [9, 11, 13]);
  const before = member.orientation.keys.map(key => ({time: key.time, value: [...key.value]}));
  const result = f.apply(); assert.equal(result.ok, false); assert.deepEqual(f.calls, []);
  assert.equal(member.threeDLayer, false); assert.equal(member.parent, null); assert.equal(f.comp.numLayers, 4);
  assert.deepEqual(member.orientation.keys, before);
});

test('Hidden 2D user Orientation expression preserves source and enabled state before conversion', async () => {
  for (const enabled of [false, true]) {
    const f = await fixture(), member = f.members[1]; member.orientation.expression = 'wiggle(2,10)'; member.orientation.expressionEnabled = enabled;
    const result = f.apply(); assert.equal(result.ok, false); assert.deepEqual(f.calls, []);
    assert.equal(member.threeDLayer, false); assert.equal(member.parent, null); assert.equal(member.orientation.expression, 'wiggle(2,10)');
    assert.equal(member.orientation.expressionEnabled, enabled); assert.equal(f.comp.numLayers, 4);
  }
});

test('Rollback restores Orientation after native compensation when attaching to rotated null', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const nullLayer = controller(f), originalRadius = control(nullLayer, 2).value, comment = nullLayer.comment;
  const originals = f.members.map(member => ({position: member.position.value, source: member.position.expression}));
  const added = f.comp.add(new Layer('Added rotated layer', {threeDLayer: true})); added.orientation.setValue([4, 8, 12]);
  nullLayer.rotationDelta = [0, 30, 0]; added._nativeParent = null;
  Object.defineProperty(added, 'parent', {
    get() {return this._nativeParent;},
    set(next) {
      if (next === this._nativeParent) return;
      const oldDelta = this._nativeParent?.rotationDelta ?? [0, 0, 0], nextDelta = next?.rotationDelta ?? [0, 0, 0];
      this.orientation.raw = this.orientation.raw.map((value, i) => value + oldDelta[i] - nextDelta[i]); this._nativeParent = next;
    }
  });
  f.comp.select([added]); added.position.failExpression = true;
  const result = f.apply({targetMode: 'reuseController', radius: 650}); assert.equal(result.ok, false);
  assert.equal(result.error.code, 'HOST_OPERATION_FAILED', JSON.stringify(result));
  assert.equal(added.parent, null); assert.equal(added.threeDLayer, true); assert.deepEqual(added.orientation.raw, [4, 8, 12]);
  assert.equal(added.position.expression, ''); assert.equal(added.orientation.expression, '');
  assert.equal(control(nullLayer, 2).value, originalRadius); assert.equal(nullLayer.comment, comment);
  f.members.forEach((member, i) => {assert.deepEqual(member.position.value, originals[i].position); assert.equal(member.position.expression, originals[i].source);});
  assert.deepEqual(f.comp.selectedLayers, [added]);
});


test('Regular Quick after explicit preset and advanced adjustment preserves all shared settings', async () => {
  const f = await fixture(); assert.equal(f.apply({preset: 'frontal'}).ok, true);
  assert.equal(f.apply({preset: 'sphere', applyPreset: true}).ok, true);
  assert.equal(f.apply({preset: 'sphere', radius: 640, speed: 30}, {mode: 'advanced'}).ok, true);
  const nullLayer = controller(f);
  assert.equal(f.apply({preset: 'frontal'}).ok, true);
  assert.equal(control(nullLayer, 1).value, 7);
  assert.equal(control(nullLayer, 2).value, 640);
  assert.equal(control(nullLayer, 3).value, 30);
});

test('Advanced defaults after skipped Quick restore radius and speed using the last advanced request', async () => {
  const f = await fixture(); assert.equal(f.apply({radius: 640, speed: 30}, {mode: 'advanced'}).ok, true);
  const nullLayer = controller(f);
  const lastRequested = () => {
    const {META_OPEN, META_CLOSE} = f.scope.MotionContracts;
    return JSON.parse(nullLayer.comment.substring(nullLayer.comment.indexOf(META_OPEN) + META_OPEN.length, nullLayer.comment.indexOf(META_CLOSE))).lastRequested;
  };
  const beforeQuick = lastRequested(); assert.equal(beforeQuick.radius, 640); assert.equal(beforeQuick.speed, 30);
  assert.equal(f.apply().ok, true); assert.equal(control(nullLayer, 2).value, 640); assert.equal(control(nullLayer, 3).value, 30);
  assert.deepEqual(lastRequested(), beforeQuick, 'Skipped Quick must preserve applied request history');
  assert.equal(f.apply({}, {mode: 'advanced'}).ok, true);
  assert.equal(control(nullLayer, 2).value, 400); assert.equal(control(nullLayer, 3).value, 90);
});

test('Failed native 3D enable preserves untouched hidden managed Orientation expression', async () => {
  const f = await fixture(); assert.equal(f.apply().ok, true);
  const member = f.members[0], nullLayer = controller(f), before = {
    facing: member.orientation.expression, enabled: member.orientation.expressionEnabled, raw: [...member.orientation.raw],
    position: member.position.expression, radius: control(nullLayer, 2).value, comment: nullLayer.comment
  };
  member.threeDLayer = false;
  let dimensionality = false;
  Object.defineProperty(member, 'threeDLayer', {
    get() {return dimensionality;},
    set(value) {if (value) throw new Error('Native 3D toggle failed before conversion'); dimensionality = value;}
  });
  f.comp.select([member]); const result = f.apply({radius: 650}, {mode: 'advanced'});
  assert.equal(result.ok, false); assert.equal(result.error.code, 'HOST_OPERATION_FAILED', JSON.stringify(result));
  assert.equal(member.threeDLayer, false); assert.equal(member.parent, nullLayer);
  assert.equal(member.orientation.expression, before.facing); assert.equal(member.orientation.expressionEnabled, before.enabled);
  assert.deepEqual(member.orientation.raw, before.raw); assert.equal(member.position.expression, before.position);
  assert.equal(control(nullLayer, 2).value, before.radius); assert.equal(nullLayer.comment, before.comment);
  assert.deepEqual(f.comp.selectedLayers, [member]); assert.equal(f.comp.numLayers, 5);
});
