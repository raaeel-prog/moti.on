import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHostModules } from './host-harness.mjs';

async function fixture() {
  const handlers = {};
  class CompItem { constructor() { this.selectedLayers = []; } }
  const comp = new CompItem();
  const app = { project: { activeItem: comp } };
  const errors = new Proxy({}, { get: (_, key) => key });
  await loadHostModules(['src/commands/quick-tools.jsx'], {
    app, CompItem, KeyframeInterpolationType: { HOLD: 1 },
    MotionContracts: { ERROR: errors },
    MotionRegistry: { register: (name, handler) => { handlers[name] = handler; } }
  });
  return { handlers, comp, app, apply: handlers['ae.quick-tools.apply'], save: handlers['ae.quick-tools.save-frame'] };
}

test('Quick validation rejects unknown, inherited and cross-route actions before writes', async () => {
  const f = await fixture();
  for (const action of ['constructor', '__proto__', 'align-center', 'save-frame', '', null]) {
    assert.equal(f.apply.preflight({action}).code, 'INVALID_PRESET');
  }
  assert.equal(f.apply.preflight({action: 'create-null', source: 'anything'}).code, 'INVALID_PRESET');
  assert.equal(f.save.preflight({action: 'create-null'}).code, 'INVALID_PRESET');
  assert.equal(f.save.preflight({action: 'save-frame'}).code, 'CAPABILITY_UNAVAILABLE');
});

test('Quick no-comp, no-selection and locked-target guards run before any mutation', async () => {
  const f = await fixture();
  assert.equal(f.apply.preflight({action: 'center'}).code, 'NO_SELECTION');
  assert.equal(f.apply.preflight({action: 'create-null'}), null);
  f.comp.selectedLayers = [{locked: true}];
  assert.equal(f.apply.preflight({action: 'precompose'}).code, 'INVALID_SELECTION_TYPE');
  f.app.project.activeItem = null;
  assert.equal(f.apply.preflight({action: 'create-null'}).code, 'NO_ACTIVE_COMP');
});

test('Quick protects time remapping and refuses unsupported effects before mutation', async () => {
  const f = await fixture();
  f.comp.selectedLayers = [{timeRemapEnabled: true, canSetTimeRemapEnabled: true}];
  assert.equal(f.apply.preflight({action: 'freeze'}).code, 'INVALID_SELECTION_TYPE');
  f.comp.selectedLayers = [{property: () => ({canAddProperty: () => false})}];
  assert.equal(f.apply.preflight({action: 'effect-blur'}).code, 'CAPABILITY_UNAVAILABLE');
});

test('Quick preserves an existing editable effect and reports a real idempotent result', async () => {
  const f = await fixture();
  let mutations = 0;
  const effect = {name: 'Moti.on Blur', matchName: 'ADBE Gaussian Blur 2'};
  f.comp.selectedLayers = [{property: () => ({
    numProperties: 1, canAddProperty: () => true, property: () => effect,
    addProperty() { mutations++; }
  })}];
  assert.equal(f.apply.preflight({action: 'effect-blur'}), null);
  const result = f.apply.run({action: 'effect-blur'});
  assert.equal(result.changed, false);
  assert.equal(result.data.unchangedItems, 1);
  assert.equal(mutations, 0);
});

function effectLayer(matchName, params, fail=false) {
  const items=[];
  const parade={
    get numProperties(){return items.length;},
    canAddProperty(){return true;},
    property(i){return items[i-1];},
    addProperty(){
      if(fail) throw new Error('host refused');
      const effect={name:matchName,matchName,property:(key)=>params[key]??null,remove(){items.splice(items.indexOf(effect),1);}};
      items.push(effect);
      return effect;
    }
  };
  return {layer:{property:()=>parade},items};
}

function staticParam(value){ return {value,setValue(next){this.value=next;}}; }

test('Quick effects target exact parameters and preserve Hue popup default', async()=>{
  for(const [action,mn,params,expected] of [
    ['effect-fill','ADBE Fill',{'ADBE Fill-0002':staticParam([1,0,0,1])},{'ADBE Fill-0002':[1,1,1,1]}],
    ['effect-tint','ADBE Tint',{'ADBE Tint-0003':staticParam(0)},{'ADBE Tint-0003':100}],
    ['effect-blur','ADBE Gaussian Blur 2',{'ADBE Gaussian Blur 2-0001':staticParam(0),'ADBE Gaussian Blur 2-0003':staticParam(0)},{'ADBE Gaussian Blur 2-0001':24,'ADBE Gaussian Blur 2-0003':1}],
    ['effect-hue','ADBE HUE SATURATION',{'ADBE HUE SATURATION-0002':staticParam(1)},{'ADBE HUE SATURATION-0002':1}]
  ]) {
    const f=await fixture();
    const layer=effectLayer(mn,params);
    f.comp.selectedLayers=[layer.layer];
    assert.equal(f.apply.preflight({action}),null);
    assert.equal(f.apply.run({action}).changed,true);
    for(const [name,value] of Object.entries(expected)) assert.deepEqual(params[name].value,value);
  }
});

test('Quick removes all newly created effects after failure on a later layer or missing parameter',async()=>{
  for(const missing of [false,true]) {
    const f=await fixture();
    const first=effectLayer('ADBE Fill',{'ADBE Fill-0002':staticParam([1,0,0,1])});
    const second=effectLayer('ADBE Fill',{},!missing);
    f.comp.selectedLayers=[first.layer,second.layer];
    assert.equal(f.apply.preflight({action:'effect-fill'}),null);
    assert.throws(()=>f.apply.run({action:'effect-fill'}),e=>e.motionCode==='HOST_OPERATION_FAILED');
    assert.equal(first.items.length,0);
    assert.equal(second.items.length,0);
  }
});

function freezeLayer(fail = false) {
  const keys = [0, 3];
  const remap = { value: null, get numKeys() { return keys.length; }, valueAtTime: t => t * 0.5,
    removeKey(i) { keys.splice(i - 1, 1); },
    setValueAtTime(t, value) { if (fail) throw new Error('host failed'); keys.push(t); keys.sort((a,b) => a-b); this.value = value; },
    nearestKeyIndex(t) { return keys.indexOf(t) + 1; },
    setInterpolationTypeAtKey(index, inType, outType) { assert.equal(index, 1); assert.equal(inType, 1); assert.equal(outType, 1); } }; 
  return { layer: { canSetTimeRemapEnabled: true, timeRemapEnabled: false, inPoint: 0, outPoint: 3, property: () => remap }, remap };
}

test('Freeze replaces automatic endpoint keys with the current source frame across the entire layer', async () => {
  const f = await fixture(), target = freezeLayer();
  f.comp.time = 1; f.comp.frameDuration = 1 / 30; f.comp.selectedLayers = [target.layer];
  assert.equal(f.apply.preflight({ action: 'freeze' }), null);
  assert.equal(f.apply.run({ action: 'freeze' }).changed, true);
  assert.equal(target.layer.timeRemapEnabled, true);
  assert.equal(target.remap.numKeys, 1);
  assert.equal(target.remap.value, 0.5);
});

test('Freeze restores all layers when a later target fails', async () => {
  const f = await fixture(), a = freezeLayer(), b = freezeLayer(true);
  f.comp.time = 1; f.comp.frameDuration = 1 / 30; f.comp.selectedLayers = [a.layer, b.layer];
  assert.equal(f.apply.preflight({ action: 'freeze' }), null);
  assert.throws(() => f.apply.run({ action: 'freeze' }), e => e.motionCode === 'HOST_OPERATION_FAILED');
  assert.equal(a.layer.timeRemapEnabled, false); assert.equal(b.layer.timeRemapEnabled, false);
  assert.equal(a.layer.outPoint, 3); assert.equal(b.layer.outPoint, 3);
});


/** A keyframed property with some keys selected. */
function keyed(times, selected) { return { selectedKeys: selected, keyTime: i => times[i - 1], numKeys: times.length }; }
function trimLayer(name, properties, inPoint = 0, outPoint = 10) {
  return { name, locked: false, inPoint, outPoint, selectedProperties: properties };
}

test('Trim to keys fits each layer to its own selected keyframes, keeping the last key frame', async () => {
  const f = await fixture(); f.comp.frameDuration = 0.1;
  const a = trimLayer('A', [keyed([1, 2, 4], [1, 3])]), b = trimLayer('B', [keyed([0.5, 6], [1, 2]), keyed([7], [1])]);
  f.comp.selectedLayers = [a, b];
  assert.equal(f.apply.preflight({ action: 'trim-to-keys' }), null);
  const result = f.apply.run({ action: 'trim-to-keys' });
  assert.equal(result.changed, true); assert.equal(result.data.changedItems, 2);
  assert.deepEqual([a.inPoint, a.outPoint], [1, 4.1]); assert.deepEqual([b.inPoint, b.outPoint], [0.5, 7.1]);
});

test('Trim to keys refuses a selection without two keyframes and skips layers without them', async () => {
  const f = await fixture(); f.comp.frameDuration = 0.1;
  f.comp.selectedLayers = [trimLayer('A', [keyed([1, 2], [1])])];
  assert.equal(f.apply.preflight({ action: 'trim-to-keys' }).code, 'NO_SELECTION');
  const kept = trimLayer('Kept', []), cut = trimLayer('Cut', [keyed([3, 5], [1, 2])]);
  f.comp.selectedLayers = [kept, cut];
  const result = f.apply.run({ action: 'trim-to-keys' });
  assert.deepEqual([kept.inPoint, kept.outPoint], [0, 10]); assert.deepEqual([cut.inPoint, cut.outPoint], [3, 5.1]);
  assert.equal(result.warnings.length, 1);
});

test('Trim to keys moving past the old out point sets the out point first and restores on failure', async () => {
  const f = await fixture(); f.comp.frameDuration = 0.1;
  const order = [], layer = { name: 'L', locked: false, selectedProperties: [keyed([12, 14], [1, 2])], _in: 0, _out: 10 };
  Object.defineProperty(layer, 'inPoint', { get() { return this._in; }, set(v) { if (v >= this._out) throw new Error('in after out'); order.push('in'); this._in = v; } });
  Object.defineProperty(layer, 'outPoint', { get() { return this._out; }, set(v) { order.push('out'); this._out = v; } });
  const broken = { name: 'X', locked: false, selectedProperties: [keyed([1, 2], [1, 2])], inPoint: 0 };
  Object.defineProperty(broken, 'outPoint', { get() { return 10; }, set() { throw new Error('locked by AE'); } });
  f.comp.selectedLayers = [layer, broken];
  assert.throws(() => f.apply.run({ action: 'trim-to-keys' }), e => e.motionCode === 'HOST_OPERATION_FAILED');
  assert.deepEqual(order.slice(0, 2), ['out', 'in']); assert.deepEqual([layer.inPoint, layer.outPoint], [0, 10], 'earlier layers are restored');
});

/** A layer whose Puppet effect has the given pins in one mesh. */
function puppetLayer(name, pins) {
  const pinNodes = pins.map(pin => ({ name: pin }));
  const group = (props, extra = {}) => ({ numProperties: props.length, property: k => typeof k === 'number' ? props[k - 1] : props.find(p => p.name === k || p.matchName === k), ...extra });
  const deform = group(pinNodes, { name: 'Deform' }), mesh = group([deform], { name: 'Mesh 1' }), meshes = group([mesh], { name: 'Mesh' });
  const arap = group([meshes], { name: 'arap' }), puppet = group([arap], { name: 'Puppet', matchName: 'ADBE FreePin3' });
  const layer = { name, locked: false, index: 2, effects: group([puppet]), moved: null };
  layer.property = key => key === 'ADBE Effect Parade' ? layer.effects : null;
  return layer;
}

test('Pins to nulls creates one null per Puppet pin that follows it through toComp', async () => {
  const f = await fixture(), created = [];
  f.comp.layers = { addNull() { const position = { expression: '', expressionEnabled: false }; const n = { name: '', moveBefore(l) { n.before = l; }, remove() { n.removed = true; }, transform: { property: k => k === 'ADBE Position' ? position : null }, position }; created.push(n); return n; } };
  const layer = puppetLayer('Arm "L"', ['Shoulder', 'Hand']);
  f.comp.selectedLayers = [layer];
  assert.equal(f.apply.preflight({ action: 'pin-to-null' }), null);
  const result = f.apply.run({ action: 'pin-to-null' });
  assert.equal(result.data.createdItems, 2); assert.deepEqual(created.map(n => n.name), ['Shoulder · Arm "L"', 'Hand · Arm "L"']);
  assert.ok(created.every(n => n.before === layer), 'nulls sit right above the layer');
  assert.equal(created[1].position.expression, 'var L=thisComp.layer("Arm \\"L\\"");\nL.toComp(L.effect("Puppet").arap.mesh("Mesh 1").deform("Hand").position);');
});

test('Pins to nulls needs a Puppet pin and removes created nulls when a later one fails', async () => {
  const f = await fixture();
  f.comp.selectedLayers = [{ name: 'Plain', locked: false, property: () => ({ numProperties: 0, property: () => null }) }];
  assert.equal(f.apply.preflight({ action: 'pin-to-null' }).code, 'INVALID_SELECTION_TYPE');
  const created = []; let count = 0;
  f.comp.layers = { addNull() { if (++count === 2) throw new Error('AE refused'); const position = { expression: '' }; const n = { moveBefore() {}, remove() { n.removed = true; }, transform: { property: () => position } }; created.push(n); return n; } };
  f.comp.selectedLayers = [puppetLayer('Arm', ['A', 'B'])];
  assert.throws(() => f.apply.run({ action: 'pin-to-null' }), e => e.motionCode === 'HOST_OPERATION_FAILED');
  assert.ok(created.every(n => n.removed), 'no half-built rig is left behind');
});
