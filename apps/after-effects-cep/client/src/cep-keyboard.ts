/** CEP forwards non-input keys to AE unless the panel registers its interest. */
export interface CepKeyboardHost { registerKeyEventsInterest?(events: string): void }
type KeyInterest = {keyCode: number; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean};
export function cepControlKeyInterests(platform: string): KeyInterest[] {
 const mac=/Mac/i.test(platform);
 const codes=mac?[36,53,49,48,115,119,123,124,125,126,116,121]:[13,27,32,9,36,35,37,39,40,38,33,34];
 return codes.flatMap(keyCode=>Array.from({length:8},(_,mask)=>({keyCode,ctrlKey:Boolean(mask&1),altKey:Boolean(mask&2),shiftKey:Boolean(mask&4),...(mac?{metaKey:false}:{})})));
}
function interactive(element: Element | null): boolean {
 for(let node=element;node;node=node.parentElement){
  if(/^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|A)$/.test(node.tagName)||node.getAttribute('tabindex')!==null||node.getAttribute('contenteditable')==='true'||/^(button|option|menuitem|menuitemradio|listbox|treeitem|slider|spinbutton)$/.test(node.getAttribute('role')??''))return true;
 }
 return false;
}
export function createCepKeyboard(doc: Document,win: Window,host: CepKeyboardHost | undefined,platform: string): {dispose():void;refresh():void} {
 let alive=true,last='',focused=true,capable=typeof host?.registerKeyEventsInterest==='function';
 const controlKeys=cepControlKeyInterests(platform);
 function register(payload:string):void{if(!capable||payload===last)return;try{host!.registerKeyEventsInterest!(payload);last=payload;}catch{capable=false;}}
 function refresh():void{if(!alive)return;register(focused&&!doc.hidden&&interactive(doc.activeElement)?JSON.stringify(controlKeys):'');}
 const focus=():void=>{focused=true;refresh();};
 const blur=():void=>{focused=false;refresh();};
 const focusOut=():void=>{void Promise.resolve().then(refresh);};
 doc.addEventListener('focusin',refresh,true);doc.addEventListener('focusout',focusOut,true);doc.addEventListener('visibilitychange',refresh);
 win.addEventListener('focus',focus);win.addEventListener('blur',blur);refresh();
 return {refresh,dispose(){if(!alive)return;alive=false;doc.removeEventListener('focusin',refresh,true);doc.removeEventListener('focusout',focusOut,true);doc.removeEventListener('visibilitychange',refresh);win.removeEventListener('focus',focus);win.removeEventListener('blur',blur);register('');}};
}
