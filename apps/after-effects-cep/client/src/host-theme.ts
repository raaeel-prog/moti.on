import { MOTION_BLUE_ACCENT, normalizeHexColor } from "@motion/ui-core";

/** CEP appearance adapter. Theme changes update root tokens, never the view tree. */
export interface ThemeHost {
  getHostEnvironment(): {appSkinInfo?: {panelBackgroundColorSRGB?: {color?: unknown}; panelBackgroundColor?: {color?: unknown}; systemHighlightColor?: unknown}};
  addEventListener?(type:string, listener:()=>void):void;
  removeEventListener?(type:string, listener:()=>void):void;
}
type Rgb={red:number;green:number;blue:number};
const EVENT="com.adobe.csxs.events.ThemeColorChanged";
function rgb(value:unknown):Rgb|undefined {
  if(!value||typeof value!=="object")return;
  const c=value as Rgb;
  return [c.red,c.green,c.blue].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=255)?c:undefined;
}
const hex=(c:Rgb):string=>"#"+[c.red,c.green,c.blue].map(n=>Math.round(n).toString(16).padStart(2,"0")).join("");
const shift=(c:Rgb,n:number):string=>hex({red:Math.max(0,Math.min(255,c.red+n)),green:Math.max(0,Math.min(255,c.green+n)),blue:Math.max(0,Math.min(255,c.blue+n))});
function luminance(color:string):number {
  const channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
  return channels[0]!*.2126+channels[1]!*.7152+channels[2]!*.0722;
}
export const themeContrast=(a:string,b:string):number=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
export const AE_HIGHLIGHT_FALLBACK = "#c8ccd3";

function mixHex(a: string, b: string, portion: number): string {
  const rgb = [1, 3, 5].map(start => {
    const from = parseInt(a.slice(start, start + 2), 16), to = parseInt(b.slice(start, start + 2), 16);
    return Math.round(from + (to - from) * portion);
  });
  return hex({ red: rgb[0]!, green: rgb[1]!, blue: rgb[2]! });
}

export function accentTokens(choice: string, native: unknown, surfaces: readonly string[]): Record<string, string> {
  const highlight = rgb(native);
  const source = choice === "host" ? highlight ? hex(highlight) : AE_HIGHLIGHT_FALLBACK : normalizeHexColor(choice) ?? MOTION_BLUE_ACCENT;
  const over = (tone: string): number => Math.min(...surfaces.map(bg => themeContrast(tone, bg)));
  const direction = over("#ffffff") >= over("#000000") ? "#ffffff" : "#000000";
  let accent = source;
  for (let step = 1; step <= 100 && over(accent) < 4.5; step++) accent = mixHex(source, direction, step / 100);
  const ink = themeContrast("#111a27", accent) >= 4.5 ? "#111a27" : themeContrast("#000000", accent) >= 4.5 ? "#000000" : "#ffffff";
  const state = (candidate: string): string => over(candidate) >= 4.5 && themeContrast(ink, candidate) >= 4.5 ? candidate : accent;
  const hover = state(mixHex(accent, direction, .2)), press = state(mixHex(accent, ink, .13));
  const tint = [1, 3, 5].map(start => parseInt(accent.slice(start, start + 2), 16)).join(", ");
  return {
    "ae-accent": accent, "ae-accent-source": source,
    "ae-accent-on": ink, "ae-accent-wash": `rgba(${tint}, .13)`, "ae-nav-selection": `rgba(${tint}, .13)`, "ae-selected-text": accent,
    "ae-host-accent": highlight ? hex(highlight) : AE_HIGHLIGHT_FALLBACK,
    "action-fill": accent, "action-fill-hover": hover, "action-fill-press": press, "action-on": ink,
    "action-text": accent, "action-text-hover": hover, "action-text-press": press,
    "value-editable": accent, "value-editable-hover": hover,
    "focus-ring": `1px solid ${accent}`, "ch-border-focus": accent
  };
}
export function hostThemeTokens(color:unknown,highlight?:unknown):{theme:"dark"|"light";tokens:Record<string,string>} {
  const c=rgb(color)??{red:50,green:50,blue:50},base=hex(c),light=themeContrast("#000000",base)>themeContrast("#ffffff",base);
  const ink=light?"#000000":"#ffffff";
  const surface=(delta:number):string=>{while(delta&&themeContrast(ink,shift(c,delta))<4.5)delta-=Math.sign(delta);return shift(c,delta);};
  // Design system 2026-11: hover e ativo têm degrau próprio (antes repetiam o elevado).
  const deep=surface(light?-10:-12),raised=surface(light?-7:8),hover=surface(light?-12:16),pressed=surface(light?-18:26);
  const surfaces=[base,deep,raised,pressed];
  const parse=(color:string):Rgb=>({red:parseInt(color.slice(1,3),16),green:parseInt(color.slice(3,5),16),blue:parseInt(color.slice(5,7),16)});
  // Anda da cor preferida em direção à tinta até fechar o contraste em todas as superfícies pedidas.
  const toward=(preferred:string,over:string[],min=4.5):string=>{
    const from=parse(preferred),to=parse(ink);
    for(let step=0;step<=20;step++){const t=step/20,color=hex({red:from.red+(to.red-from.red)*t,green:from.green+(to.green-from.green)*t,blue:from.blue+(to.blue-from.blue)*t});if(over.every(bg=>themeContrast(color,bg)>=min))return color;}
    return ink;
  };
  const readable=(preferred:string,min=4.5):string=>surfaces.every(bg=>themeContrast(preferred,bg)>=min)?preferred:surfaces.every(bg=>themeContrast("#ffffff",bg)>=min)?"#ffffff":"#000000";
  // Três níveis de texto: o terciário (dica, contagem, unidade) só precisa fechar AA até a superfície elevada.
  const text=readable(light?"#242424":"#dedede"),secondary=toward(light?"#444444":"#b2b2b2",[...surfaces,hover]),tertiary=toward(light?"#5c5c5c":"#8e8e8e",[base,deep,raised]),off=toward(light?"#8a8a8a":"#6a6a6a",[base,deep],3);
  const blue=toward(light?"#164b89":"#8ab8ff",[...surfaces,hover]),blueHover=toward(light?"#0f3a6c":"#b9d5ff",[...surfaces,hover]);
  const family=(dark:string,lightTone:string):string=>toward(light?lightTone:dark,[base,deep,raised,hover],3);
  const border=readable(light?"#6b6b6b":"#9b9b9b",3),native=rgb(highlight),focus=native&&surfaces.every(bg=>themeContrast(hex(native),bg)>=3)?hex(native):blue;
  const tokens:Record<string,string>={"bg-host":base,"surface-deep":deep,"surface-raised":raised,"bg-elevated":deep,"surface-hover":hover,"surface-active":pressed,"surface-section":base,"overlay-surface":raised,"border-subtle":shift(c,light?-20:20),"border-muted":shift(c,light?-20:20),"line-hairline":shift(c,light?-20:20),"line-2":shift(c,light?-46:48),"border-control":border,"line-strong":border,"text-primary":text,"text-secondary":secondary,"text-muted":secondary,"text-tertiary":tertiary,"text-off":off,"txt-1":text,"txt-2":secondary,"txt-3":secondary,"bg-0":deep,"bg-1":base,"bg-2":raised,"bg-3":deep,"bg-4":raised,"accent":text,"accent-hover":text,"accent-press":text,"accent-on":deep,"accent-wash":light?"rgba(0,0,0,.06)":"rgba(255,255,255,.06)","action-text":blue,"action-text-hover":blueHover,"action-text-press":blue,"value-editable":blue,"value-editable-hover":blueHover,"focus-ring":`2px solid ${focus}`,"ch-border-focus":focus,"ok":readable(light?"#216a3d":"#b5e6c6"),"warn":readable(light?"#755000":"#ffe0a3"),"danger":readable(light?"#a12222":"#ffd0c9"),"info":blue};
  // O ícone fica neutro em repouso; a cor da família só aparece no hover (camada ae-design-system.css).
  const families:Record<string,[string,string]>={keyframes:["#b4c7f1","#2f4f96"],layers:["#b7cfbd","#2f6a41"],animation:["#d7bae7","#6c3d86"],spatial:["#91cad3","#1f6470"],shapes:["#d7c58b","#6d5a14"],effects:["#dea6aa","#8a2f36"],project:["#b8bccc","#474c62"]};
  for(const [name,tones] of Object.entries(families)){tokens[`icon-${name}`]=text;tokens[`fam-${name}`]=family(tones[0],tones[1]);}
  return {theme:light?"light":"dark",tokens};
}
export function createHostTheme(root:HTMLElement,host:ThemeHost|undefined,mode:()=>string,accent?:()=>string):{refresh():void;dispose():void} {
  let owned: Record<string, string> = {}, disposed = false;
  let signature = "";
  const refresh=():void=>{
    if(disposed)return;
    const selectedMode = mode();
    let skin:ReturnType<ThemeHost["getHostEnvironment"]>["appSkinInfo"];
    try{skin=host?.getHostEnvironment()?.appSkinInfo;}catch{/* Canonical screenshot fallback. */}
    const background = rgb(skin?.panelBackgroundColorSRGB?.color) ?? rgb(skin?.panelBackgroundColor?.color);
    const highlight = rgb(skin?.systemHighlightColor);
    const choice = accent?.();
    const next = [selectedMode, choice, background && hex(background), highlight && hex(highlight)].join("|");
    if (next === signature) return;
    signature = next;
    const palette=hostThemeTokens(background, highlight);
    const tokens = selectedMode === "host" ? palette.tokens : {};
    const light = selectedMode === "light" || (selectedMode === "host" && palette.theme === "light");
    if (selectedMode === "host") {
      root.setAttribute("data-host-theme", palette.theme);
      root.setAttribute("data-theme", palette.theme);
    }
    if (selectedMode === "host") {
      const surface = tokens["surface-raised"]!;
      const channels = [1, 3, 5].map(start => parseInt(surface.slice(start, start + 2), 16)).join(", ");
      tokens["ae-overlay-tint"] = `rgba(${channels}, .93)`;
    }
    if (choice) {
      const hostAccent = highlight ? hex(highlight) : AE_HIGHLIGHT_FALLBACK;
      tokens["ae-host-accent"] = hostAccent;
      if (choice === "host") {
        tokens["ae-accent-source"] = hostAccent;
      } else {
        const surfaces = selectedMode === "host"
          ? ["bg-host", "surface-deep", "surface-raised", "surface-active"].map(key => tokens[key]!)
          : light ? ["#e8e8e8", "#f2f2f2", "#dcdcdc"] : ["#262626", "#323232", "#3a3a3a", "#4c4c4c"];
        Object.assign(tokens, accentTokens(choice, highlight, surfaces));
      }
    }
    for (const key of Object.keys(owned)) if (!(key in tokens)) root.style.removeProperty(`--${key}`);
    for (const [key, value] of Object.entries(tokens)) if (value !== owned[key]) root.style.setProperty(`--${key}`, value);
    owned = tokens;
  };
  refresh();host?.addEventListener?.(EVENT,refresh);
  return {refresh,dispose(){if(disposed)return;disposed=true;host?.removeEventListener?.(EVENT,refresh);for(const key of Object.keys(owned))root.style.removeProperty(`--${key}`);owned={};}};
}
