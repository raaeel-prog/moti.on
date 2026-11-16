// Rebuild fixtures from a separately compiled native oracle, never from the JS preview.
// node this-file.mjs absolute/path/to/gradient-preview-oracle.exe
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cloneGradientSettings,createGradientSettings,GRADIENT_SCALARS} from '../../../../packages/contracts/dist/index.js';
const executable=process.argv[2];if(!executable)throw Error('Supply compiled native oracle path.');
const source=['plugin/host/GradientMath.inc','plugin/host/GradientKernel.h'];
const hashes=Object.fromEntries(await Promise.all(source.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../../../../'+path,import.meta.url))).digest('hex')])));
const width=12,height=8,alpha=Array.from({length:width*height},(_,i)=>i%width<2||i%width>9?0:(i%width===2?.45:1));
const cases=[];
for(const [id,changes,mask] of [
 ['linear',{},false],['radial',{mode:'radial',diffusion:.8,diffusionRadius:3,glow:.9,glowRadius:4,grain:.2},true],
 ['angular',{mode:'angular',cycles:1.35,offset:.27,aspect:1.4,angle:-31},false],
 ['linear-hdr',{colorProcessing:'srgb-linear',phase:37,grain:.3},true],['aurora',createGradientSettings(),false]
]) {
 const settings={...cloneGradientSettings(),depthRadius:3,glowRadius:3,diffusionRadius:3,...changes};
 if(id==='linear-hdr')settings.stops[0].color=[-.2,1.5,3];
 const frame={width,height,layerWidth:id==='aurora'?1920:width,layerHeight:id==='aurora'?1080:height,pixelAspect:id==='radial'?1.33:1,timeSeconds:1.25,alpha:mask?alpha:Array(width*height).fill(1)};
 const scalarValues=GRADIENT_SCALARS.map(d=>d.kind==='enum'?d.options.indexOf(settings[d.key]):settings[d.key]);
 const input=[width,height,frame.layerWidth,frame.layerHeight,frame.pixelAspect,frame.timeSeconds,...scalarValues,...settings.stops.flatMap(s=>[Number(s.enabled),...s.color,s.position]),...frame.alpha].join(' ');
 const result=spawnSync(executable,[],{input,encoding:'utf8'});if(result.status!==0)throw Error(`Oracle failed ${id}: ${result.stderr}`);
 cases.push({id,settings,frame,pixels:JSON.parse(result.stdout)});
}
await writeFile(new URL('./gradient-preview-native.json',import.meta.url),JSON.stringify({nativeSourceHashes:hashes,cases}));
