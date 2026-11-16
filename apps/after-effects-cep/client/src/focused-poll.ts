/** CEP stays visible when focus moves into the native Adobe editor. Do not
 * leave host reads or even an idle polling timer running in that state.
 * `paused` skips the periodic reads only; focus and visibility still read. */
export function focusedPoll(doc: Document, read: () => void, interval: number, enabled: () => boolean = () => true, paused: () => boolean = () => false): { refresh(): void; dispose(): void } {
  let focused = typeof doc.hasFocus === "function" ? doc.hasFocus() : true, disposed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const allowed = (): boolean => !disposed && focused && !doc.hidden && enabled();
  const stop = (): void => { if(timer !== undefined)clearInterval(timer);timer=undefined; };
  function refresh(): void { if(!allowed()){stop();return;}if(timer===undefined)timer=setInterval(()=>{if(!allowed())stop();else if(!paused())read();},interval); }
  const focus = (): void => { focused=true;refresh();if(allowed())read(); };
  const blur = (): void => { focused=false;stop(); };
  const visibility = (): void => { focused=typeof doc.hasFocus === "function" ? doc.hasFocus() : focused;refresh();if(allowed())read(); };
  window.addEventListener("focus",focus);window.addEventListener("blur",blur);doc.addEventListener("visibilitychange",visibility);
  refresh();
  return {refresh,dispose(){if(disposed)return;disposed=true;stop();window.removeEventListener("focus",focus);window.removeEventListener("blur",blur);doc.removeEventListener("visibilitychange",visibility);}};
}
