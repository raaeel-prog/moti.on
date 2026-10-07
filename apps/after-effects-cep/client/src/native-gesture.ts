import type {PresetPhaseInspection, PresetTarget} from "@motion/contracts";

export interface GestureFiles {
  read(name:"handshake.json"|"response.json"):string|undefined;
  write(text:string):void;
}
interface CepFs {
  readFile(path:string):{err:number;data:string};
  writeFile(path:string,data:string):{err:number};
  rename(oldPath:string,newPath:string):{err:number};
  deleteFile(path:string):{err:number};
}
declare const CSInterface: new()=>{getSystemPath(type:string):string};
declare const SystemPath:{USER_DATA:string;EXTENSION:string};

/** Fixed, private macOS path. Never accepts a host/user-supplied filesystem path. */
export function cepGestureFiles(view:Window|null):GestureFiles|undefined {
  const fs=(view as (Window&{cep?:{fs?:CepFs}})|null)?.cep?.fs;
  if(!fs||typeof CSInterface==="undefined"||typeof SystemPath==="undefined")return;
  const paths=new CSInterface();
  // USER_DATA differs between CEP versions (some append Adobe/CEP). The
  // extension path has a known suffix and is the reliable macOS fallback.
  const extension=paths.getSystemPath(SystemPath.EXTENSION);
  const installed=/^(\/Users\/[^/]+)\/Library\/Application Support\/Adobe\/CEP\/extensions\/com\.motion\.plugin\.ae\/?$/.exec(extension);
  const userData=paths.getSystemPath(SystemPath.USER_DATA);
  const userRoot=/^(\/Users\/[^/]+)\/Library\/Application Support(?:\/Adobe(?:\/CEP)?)?\/?$/.exec(userData);
  const home=installed?.[1]??userRoot?.[1];
  if(!home)return;
  const root=`${home}/Library/Caches/Moti.on/Gestures`;
  const report=(stage:string,code:number):void=>{try{fs.writeFile(`${root}/client-status.json`,JSON.stringify({version:1,stage,code}));}catch{/* A diagnostic must never interrupt the gesture. */}};
  return {
    read(name){const result=fs.readFile(`${root}/${name}`);return result.err===0&&typeof result.data==="string"&&result.data.length<=4096?result.data:undefined;},
    write(text){if(text.length>4096)throw Error("gesture-size");
      const temporary=`${root}/request.tmp`,target=`${root}/request.json`;
      const written=fs.writeFile(temporary,text);
      if(written.err!==0){report("write",written.err);throw Error("gesture-write");}
      // CEP's rename does not replace an existing destination (err 10 on AE/macOS).
      // Retire only a previously published request, then atomically publish the
      // complete temporary file. The native reader may briefly see no request,
      // but can never observe a partially written one.
      let renamed=fs.rename(temporary,target);
      if(renamed.err===10){
        const retired=fs.deleteFile(target);
        if(retired.err===0)renamed=fs.rename(temporary,target);
        else{report("retire",retired.err);fs.deleteFile(temporary);throw Error("gesture-rename");}
      }
      if(renamed.err!==0){report("rename",renamed.err);fs.deleteFile(temporary);throw Error("gesture-rename");}
    }
  };
}
interface Reply {version:number;sequence:number;session:string;gesture:string;error:number;open:boolean;canceled:boolean;value:number}
interface Handshake {version:number;token:string;capabilities:string[];hostProof:boolean}
const pause=(ms:number):Promise<void>=>new Promise(resolve=>setTimeout(resolve,ms));
let clockSequence=Date.now()*1000;
const nextSequence=():number=>clockSequence=Math.max(clockSequence+1,Date.now()*1000);
function failureText(error:unknown):string {
  const code=error instanceof Error?error.message:String(error);
  if(code==="gesture-write"||code==="gesture-rename")return "O painel não conseguiu enviar o arraste ao componente nativo. Verifique o acesso à pasta de sessão.";
  if(code==="gesture-timeout")return "O componente nativo não respondeu ao arraste. O valor inicial foi restaurado.";
  if(code==="gesture-rejected")return "O componente nativo recusou o arraste. O valor inicial foi restaurado.";
  return "A comunicação do arraste falhou. O valor inicial foi restaurado.";
}

/** One in-flight request, latest-only updates at 10Hz and an explicit final value. */
export function createNativeGestures(files:GestureFiles|undefined,onState:(active:boolean,error?:string)=>void):{
  available():boolean; start(target:PresetTarget,phase:PresetPhaseInspection,key:string,initial:number):void;
  update(value:number):void; finish(cancel:boolean,value:number):Promise<void>;dispose():void;
} {
  const session=`panel-${Date.now()}-${++clockSequence}`;
  let handshake:Handshake|undefined,gesture="",initial=0,latest=0,active=false,ending=false,canceled=false;
  let interval:ReturnType<typeof setInterval>|undefined,chain=Promise.resolve(),lastUpdate=0;
  let generation=0;
  function available():boolean {
    if(!files)return false;
    try{const raw=files.read("handshake.json");if(!raw)return false;const value=JSON.parse(raw) as Handshake;
      if(value.version!==1||typeof value.token!=="string"||!/^[A-Fa-f0-9-]{36}$/.test(value.token)||value.hostProof!==true||!Array.isArray(value.capabilities)||!value.capabilities.includes("phase-number"))return false;
      handshake=value;return true;
    }catch{return false;}
  }
  async function send(operation:string,payload:Record<string,unknown>={}):Promise<Reply>{
    if(!files||!handshake)throw Error("gesture-unavailable");
    const sequence=nextSequence();files.write(JSON.stringify({version:1,token:handshake.token,sequence,session,gesture,operation,...payload}));
    const deadline=Date.now()+1800;
    while(Date.now()<deadline){await pause(20);const raw=files.read("response.json");if(!raw)continue;
      let r:Reply;try{r=JSON.parse(raw) as Reply;}catch{continue;}
      if(r.version!==1||r.sequence!==sequence||r.session!==session||r.gesture!==gesture)continue;
      if(r.error!==0||(r.canceled&&operation!=="cancel"))throw Error("gesture-rejected");return r;
    }throw Error("gesture-timeout");
  }
  async function abort(error?:string):Promise<void>{
    if(interval)clearInterval(interval);interval=undefined;
    try{await send("cancel");}catch{/* Native watchdog restores the captured initial value if communication is lost. */}
    active=false;ending=false;canceled=true;onState(false,error);
  }
  function queueUpdate():void {
    if(!active||ending||canceled||Date.now()-lastUpdate<100)return;
    lastUpdate=Date.now();const currentGeneration=generation;
    chain=chain.then(async()=>{if(!active||ending||canceled||generation!==currentGeneration)return;await send("update",{value:latest});}).catch(async error=>{if(active)await abort(failureText(error));});
  }
  return {
    available,
    start(target,phase,key,value){
      if(active||!available())return;
      const binding=phase.controls.find(control=>control.key===key);if(!binding)return;
      active=true;ending=false;canceled=false;initial=latest=value;generation++;gesture=`${session}-${generation}`;onState(true);
      chain=send("begin",{compId:target.compId,layerId:target.layerId,instance:target.instance,phaseInstance:phase.instance,phase:phase.phase,parameter:key,control:binding.name,initial:value}).then(()=>{}).catch(async error=>{if(active)await abort(failureText(error));});
      interval=setInterval(queueUpdate,100);
    },
    update(value){if(active&&!ending&&Number.isFinite(value))latest=value;},
    async finish(cancel,value){
      if(!active||ending)return;ending=true;canceled=cancel;latest=cancel?initial:value;
      if(interval)clearInterval(interval);interval=undefined;
      await chain;if(!active)return;
      try{if(cancel){await send("cancel");}else{await send("commit",{value:latest});}active=false;ending=false;onState(false);}
      catch(error){await abort(failureText(error));}
    },
    dispose(){if(active)void this.finish(true,initial);}
  };
}
