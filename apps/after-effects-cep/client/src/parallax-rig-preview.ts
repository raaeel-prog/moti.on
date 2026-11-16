import {createElement} from '@motion/ui-core';
import {createCameraPreviewPlayback} from './camera-preview-playback.js';
export type ParallaxMovePreview='create'|'adjust'|'subtle'|'truck'|'vertical'|'dolly';
export interface ParallaxPreviewSettings {operation:ParallaxMovePreview;depthStep:number;strength:number;reverseOrder:boolean;orderMode:string;width:number;height:number}
/** Original sample planes. Movement follows movementPlan in the native rig:
 * linear controller travel of 2% width/height and/or 3% camera zoom in 3s. */
export function sampleParallaxRigPreview(settings:ParallaxPreviewSettings,seconds:number):Array<{id:number;z:number;x:number;y:number;width:number;height:number}> {
 const {width:w,height:h}=settings,zoom=3000,total=(settings.depthStep===0?zoom*5/6:settings.depthStep*3)*settings.strength;
 if(!Number.isFinite(total)||total<0||total>=zoom*.9)return [];
 const phase=Math.max(0,Math.min(1,seconds/3)),dx=(settings.operation==='subtle'||settings.operation==='truck')?w*.02*phase:0,
  dy=settings.operation==='vertical'?h*.02*phase:0,dz=(settings.operation==='subtle'||settings.operation==='dolly')?zoom*.03*phase:0;
 const planes=[{x:.36,y:.53,w:.35,h:.5},{x:.7,y:.42,w:.28,h:.3},{x:.5,y:.28,w:.6,h:.12},{x:.5,y:.5,w:1,h:1}];
 const ranks=planes.map((_,id)=>id);if(settings.orderMode==='area')ranks.sort((a,b)=>planes[a]!.w*planes[a]!.h-planes[b]!.w*planes[b]!.h);if(settings.reverseOrder)ranks.reverse();
 return planes.map((plane,id)=>{const z=-total*(3-ranks.indexOf(id))/3,k=1+z/zoom,factor=zoom/(zoom+z-dz);
  return {id,z,x:w/2+((plane.x*w-w/2)*k-dx)*factor,y:h/2+((plane.y*h-h/2)*k-dy)*factor,width:plane.w*w*k*factor,height:plane.h*h*k*factor};
 }).sort((a,b)=>b.z-a.z);
}
export function createParallaxRigPreview(doc:Document,settings:ParallaxPreviewSettings,english:boolean):{element:HTMLElement;dispose():void}{
 const element=createElement(doc,'div','ch-parallax-rig-preview'),ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');
 svg.setAttribute('viewBox',`0 0 ${settings.width} ${settings.height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',english?'Parallax sample scene':'Cena de exemplo do Parallax');
 svg.setAttribute('style','display:block;width:100%;height:140px;background:#191919;border-radius:4px;overflow:hidden');
 const planes=[0,1,2,3].map(id=>{const rect=doc.createElementNS(ns,'rect');rect.setAttribute('rx','8');rect.setAttribute('fill',['#7c91b5','#c8ae88','#d1d5dc','#303942'][id]!);rect.setAttribute('stroke','#8c97a5');rect.setAttribute('stroke-width','2');return rect;});
 function paint(seconds:number):void{for(const p of sampleParallaxRigPreview(settings,seconds)){const rect=planes[p.id]!;rect.setAttribute('x',String(p.x-p.width/2));rect.setAttribute('y',String(p.y-p.height/2));rect.setAttribute('width',String(p.width));rect.setAttribute('height',String(p.height));svg.appendChild(rect);}}
 const caption=createElement(doc,'p','ch-hint',english?'Sample scene · timeline order and camera recipe':'Cena de exemplo · ordem da timeline e receita da câmera');
 const play=createElement(doc,'button','ch-button ch-button--tertiary',english?'Play preview':'Reproduzir prévia') as HTMLButtonElement;play.type='button';
 const win=doc.defaultView,playback=createCameraPreviewPlayback(doc,element,{frame:cb=>win?.requestAnimationFrame(cb)??0,cancelFrame:id=>win?.cancelAnimationFrame(id)});
 play.addEventListener('click',()=>playback.play(t=>paint(Math.min(3,t%4)),()=>paint(0)));
 element.appendChild(svg);element.appendChild(caption);if(!['create','adjust'].includes(settings.operation))element.appendChild(play);paint(0);
 return {element,dispose:()=>playback.dispose()};
}
