/** Relative frame offsets use the composition's nominal timecode rate. */
function rate(fps:number,dropFrame:boolean):{nominal:number;drop:number} {
  const nominal=Number.isFinite(fps)&&fps>0?Math.max(1,Math.round(fps)):24;
  return {nominal,drop:dropFrame&&(nominal===30||nominal===60)&&Math.abs(fps-nominal/1.001)<.02?nominal/15:0};
}
export function formatPresetOffset(frames:number,fps:number,dropFrame=false):string {
  const {nominal,drop}=rate(fps,dropFrame),pad=(value:number):string=>String(value).padStart(2,"0");
  const absolute=Math.abs(Math.round(frames));let count=absolute;
  if(drop){const ten=nominal*600-drop*9,minute=nominal*60-drop,remainder=absolute%ten;count+=drop*9*Math.floor(absolute/ten)+drop*Math.max(0,Math.floor((remainder-drop)/minute));}
  const ff=count%nominal,seconds=Math.floor(count/nominal),ss=seconds%60,minutes=Math.floor(seconds/60),mm=minutes%60,hh=Math.floor(minutes/60);
  return `${frames<0?"-":frames>0?"+":""}${pad(hh)}:${pad(mm)}:${pad(ss)}${drop?";":":"}${pad(ff)}`;
}
/** Accept frames or signed HH:MM:SS:FF; reject omitted drop-frame labels. */
export function parsePresetOffset(value:string,fps:number,dropFrame=false):number|undefined {
  const text=value.trim();if(/^[+-]?\d+$/.test(text)){const frames=Number(text);return Number.isSafeInteger(frames)?frames:undefined;}
  const match=/^([+-]?)(\d{2,}):(\d{2}):(\d{2})[:;](\d{2,})$/.exec(text);if(!match)return;
  const {nominal,drop}=rate(fps,dropFrame),hh=Number(match[2]),mm=Number(match[3]),ss=Number(match[4]),ff=Number(match[5]);
  if(mm>=60||ss>=60||ff>=nominal||drop&&mm%10!==0&&ss===0&&ff<drop)return;
  const minutes=hh*60+mm,frames=((minutes*60)+ss)*nominal+ff-drop*(minutes-Math.floor(minutes/10));
  return Number.isSafeInteger(frames)?(match[1]==="-"?-frames:frames):undefined;
}
