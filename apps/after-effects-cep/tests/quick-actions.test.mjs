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

