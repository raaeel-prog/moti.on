import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const scope={MotionJson:JSON};vm.createContext(scope);vm.runInContext(await readFile(new URL('../scripts/tools-audit-state.jsx',import.meta.url),'utf8'),scope);
const compare=(a,b,t=0.00000095367431640625)=>scope.MotionAuditCompare(JSON.stringify(a),JSON.stringify(b),t);
test('native TextDocument precision allowance retains each raw color difference',()=>{
 const result=compare({text:{fill:[.92156898975372,0,1]}},{text:{fill:[.92156994342804,0,1]}});
 assert.equal(result.equal,true);assert.equal(result.tolerated.length,1);assert.equal(result.tolerated[0].before,.92156898975372);
});
test('text precision never relaxes key selection, expressions, times or other scalar values',()=>{
 for(const key of ['selected','expression','time','value']){const result=compare({[key]:key==='selected'?true:0},{[key]:key==='selected'?false:0.0000001});assert.equal(result.equal,false,key);}
});
test('text color change beyond measured native precision remains a failure',()=>{
 assert.equal(compare({text:{fill:[.2,0,0]}},{text:{fill:[.20001,0,0]}}).equal,false);
});

test('native text snapshots read the stored document without evaluating its expression',()=>{
 scope.PropertyType={PROPERTY:1};scope.PropertyValueType={OneD:1,TwoD:2,ThreeD:3,TwoD_SPATIAL:4,ThreeD_SPATIAL:5,COLOR:6,TEXT_DOCUMENT:7};scope.app={project:{numItems:0}};
 const property={name:'Source Text',matchName:'ADBE Text Document',propertyType:1,propertyValueType:7,numKeys:0,canSetExpression:true,expression:'expensiveGeneratedText()',expressionEnabled:true,get value(){throw Error('expression must not be evaluated by a state snapshot');},valueAtTime(time,preExpression){assert.equal(time,0);assert.equal(preExpression,true);return {text:'stored document',font:'Test',fontSize:20,applyFill:false,applyStroke:false,strokeWidth:0};}};
 const layer={id:1,numProperties:1,property:()=>property};const comp={id:1,time:0,duration:2,numLayers:1,layer:()=>layer};
 assert.equal(JSON.parse(scope.MotionAuditState(comp)).layers[0].properties[0].text.text,'stored document');
});
