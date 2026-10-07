import {loadHostModules} from './host-harness.mjs';
export async function numericBindings(kind) {
  const layer = {property: () => ({numProperties:0,property:()=>null})};
  const property = {propertyType:1,propertyValueType:1,canSetExpression:true,value:100,name:'Rotation',matchName:'ADBE Rotate Z',numKeys:2,expression:'',parentProperty:layer};
  class CompItem {constructor(){this.selectedProperties=[property];this.width=1920;this.height=1080;}}
  const scope=await loadHostModules(['generated/motion-contracts.jsx','src/json.jsx','src/expression-templates.jsx','src/quick-effects.jsx'],{
    app:{project:{activeItem:new CompItem()}},CompItem,PropertyType:{PROPERTY:1},PropertyValueType:{OneD:1,TwoD:2,ThreeD:3,COLOR:4}
  });
  const prepared=scope.MotionQuickEffects.prepare(kind,{frequency:2,amplitude:20,octaves:1,amplitudeMultiplier:.5,seed:0,rate:6,minFactor:.7,maxFactor:1,widthSeconds:.2,samples:5,referenceTime:'current',type:'cycle',numKeyframes:0,duration:0,useDuration:false},{mode:'quick'});
  if(prepared.error) throw new Error(JSON.stringify(prepared.error));
  return JSON.parse(JSON.stringify(prepared.items[0].config.bindings));
}
