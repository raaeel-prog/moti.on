import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {collectInventory} from './tools-audit-inventory.mjs';
import {deriveToolStarterArgs} from '../packages/command-registry/dist/index.js';
import {groupConditionalBranches} from './build-extendscript.mjs';
// Apply the same real-ExtendScript precedence protection used by the product build.
for(const name of ['tools-audit-fixture-lib','tools-audit-inspect','tools-audit-runner','verify-all-tools-audit','verify-ease-tools-audit','verify-particles-tools-audit','verify-gradient-tools-audit','verify-parallax-tools-audit','verify-tools-undo','verify-tools-context-audit','verify-particles-polish','verify-neon-tools-audit','verify-geometry-tools-audit']){
 const file=`scripts/${name}.jsx`,source=await readFile(file,'utf8'),safe=groupConditionalBranches(source,file);
 if(safe!==source)await writeFile(file,safe);
}
const context={host:'after-effects',hostVersion:'26.5',fps:30,compWidth:640,compHeight:360,compDurationSeconds:8,currentTimeSeconds:0,workAreaStart:0,workAreaDuration:8,selectionCount:3,selectionLayerCount:3,selectionKinds:[],selectionHasKeyframes:true,selectionHasExpressions:false,selectionIs3D:false,averageLayerDurationSeconds:8,existingRigIdsInSelection:[]};
const inventory=await collectInventory();
await mkdir('artifacts/tools-audit',{recursive:true});
const tools=inventory.tools.map(tool=>({id:tool.id,command:tool.commandId,args:deriveToolStarterArgs(tool.commandId,context)??{},allowsNoop:tool.hostCommands[0]?.allowsNoopSuccess??false,mutates:tool.hostCommands[0]?.mutates??true}));
const geometryCases=[[640,360],[360,640],[512,512]].map(([width,height])=>{const geometryContext={...context,compWidth:width,compHeight:height};return {width,height,cube:deriveToolStarterArgs('ae.3d.cube',geometryContext),cylinder:deriveToolStarterArgs('ae.3d.cylinder',geometryContext)};});
await writeFile('scripts/verify-all-tools-audit-fixtures.json',JSON.stringify({schemaVersion:1,tools,quickActions:inventory.quickActions,geometryCases,sourceHashes:inventory.sourceHashes},null,2));
// Original mono PCM percussion signal, no external recording or copyright asset.
const rate=22050,seconds=8,pcm=Buffer.alloc(rate*seconds*2),wav=Buffer.alloc(44+pcm.length);
for(let i=0;i<rate*seconds;i++){const phase=(i/rate)%0.5,envelope=Math.exp(-phase*35),value=Math.sin(2*Math.PI*180*i/rate)*envelope*.7;pcm.writeInt16LE(Math.round(value*32767),i*2);}
wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
await writeFile('artifacts/tools-audit/beat-fixture.wav',wav);
await writeFile('artifacts/tools-audit/vector-fixture.ai','%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Adobe Illustrator(TM) 3.2\n%%BoundingBox: 0 0 200 200\n%%EndComments\n0.1 0.3 0.8 setrgbcolor\nnewpath 20 20 moveto 180 20 lineto 180 180 lineto 20 180 lineto closepath fill\nshowpage\n%%EOF\n');
console.log(JSON.stringify({tools:tools.length,quick:inventory.quickActions.length,wavSha256:createHash('sha256').update(wav).digest('hex')}));
