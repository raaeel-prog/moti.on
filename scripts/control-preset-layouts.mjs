/** Original Moti.on control definitions; FFX authoring is an offline step. */
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
export function layoutKey(bindings, locale) {
  return JSON.stringify([...bindings].sort((a,b)=>a.order-b.order).map(b=>[b.paramId,b.control,b.label[locale]||b.label['en-US'],b.unit||'none',b.min??null,b.max??null,b.options?b.options.map(o=>[o.value,o.label[locale]||o.label['en-US']]):null])).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
}
export async function controlLayouts() {
  const scope={$:{global:{}},PropertyValueType:{COLOR:6}};
  let quick=await readFile(new URL('apps/after-effects-cep/host/src/quick-effects.jsx',root),'utf8');
  quick=quick.replace('prepare: prepare,','configuration: configuration, prepare: prepare,');vm.runInNewContext(quick,scope);
  const args={frequency:2,amplitude:20,seed:0,octaves:1,amplitudeMultiplier:.5,rate:6,minFactor:.7,maxFactor:1,widthSeconds:.2,samples:5,referenceTime:'current',type:'cycle',numKeyframes:0,duration:0,useDuration:false};
  const layouts=[];
  for(const kind of ['wiggle','flicker','smooth','loopout']) for(const [matchName,value] of [['ADBE Rotate Z',0],['ADBE Position_0',0],['Other',0],['ADBE Position',[0,0]],['ADBE Orientation',[0,0,0]],['Other',[0,0,0,1]],['ADBE Scale',[100,100]]]) {
    const c=scope.$.global.MotionQuickEffects.configuration(kind,args,{matchName,value,propertyValueType:1},{width:1920,height:1080},{mode:'quick'});
    layouts.push({tool:kind,bindings:c.bindings});
  }
  for(const file of ['expression-wiggle','expression-flicker','expression-smooth','expression-loopout','animate-inertial','audio-beat']) {
    const source=await readFile(new URL('apps/after-effects-cep/host/src/commands/'+file+'.jsx',root),'utf8');
    const match=/var LIVE_BINDINGS\s*=[\s\S]*?\(\[[\s\S]*?\]\);/.exec(source);
    if(!match) throw new Error('Missing bindings: '+file);
    const bindings=vm.runInNewContext(match[0]+'\nLIVE_BINDINGS;');layouts.push({tool:file,bindings});
  }
  layouts.push({tool:'effector',bindings:rigBindings('effector')},{tool:'parallax',bindings:rigBindings('parallax')});
  const unique=new Map();
  for(const l of layouts)for(const locale of ['pt-BR','en-US']){const key=layoutKey(l.bindings,locale);if(!unique.has(key))unique.set(key,{...l,locale,key});}
  return [...unique.values()];
}
export function rigBindings(tool){
 const rows=tool==='effector'?[['radius','Raio','Radius',0,1000000,'px'],['positionAmount','Posição','Position',-100000,100000,'px'],['scaleAmount','Escala','Scale',-100000,100000,'%'],['rotationAmount','Rotação','Rotation',-100000,100000,'°'],['opacityAmount','Opacidade','Opacity',-100000,100000,'%']]:[['frequency','Frequência','Frequency',0,100,'none'],['amplitude','Amplitude','Amplitude',0,100000,'px']];
 return rows.map(([paramId,pt,en,min,max,unit],i)=>({paramId,label:{'pt-BR':pt,'en-US':en},control:'slider',target:'controller',order:i+1,min,max,unit}));
}
