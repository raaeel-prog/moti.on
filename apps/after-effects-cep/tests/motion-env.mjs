/**
 * Manual clock for the AE motion helpers (apps/after-effects-cep/client/src/motion).
 * Frames run every 16 ms of `advance`; timeouts fire when their time is reached.
 */
export function createManualEnv({ reduced = false, frames = true } = {}) {
  let now = 0;
  let nextId = 1;
  let reducedMotion = reduced;
  const frameQueue = new Map();
  const timers = new Map();
  const env = {
    now: () => now,
    frame: callback => {
      if (!frames) return null;
      const id = nextId++;
      frameQueue.set(id, callback);
      return id;
    },
    cancelFrame: id => { frameQueue.delete(id); },
    timeout: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimeout: id => { timers.delete(id); },
    reduced: () => reducedMotion
  };
  function runFrames() {
    const due = [...frameQueue.entries()];
    frameQueue.clear();
    for (const [, callback] of due) callback(now);
  }
  function runTimers() {
    for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
    }
  }
  return {
    env,
    setReduced(value) { reducedMotion = value; },
    get now() { return now; },
    get pendingFrames() { return frameQueue.size; },
    get pendingTimers() { return timers.size; },
    /** Advances time in 16 ms frames, running frame callbacks and due timeouts. */
    advance(ms) {
      const end = now + ms;
      if (!frameQueue.size) runFrames();
      while (now < end) {
        now = Math.min(end, now + 16);
        runFrames();
        runTimers();
      }
    }
  };
}

/** Minimal element with style/attributes/geometry for helpers that fake-dom does not cover. */
export function motionNode(tag = 'div', geometry = {}) {
  const attributes = {};
  const listeners = {};
  const style = {
    values: {},
    setProperty(name, value) { this.values[name] = value; },
    removeProperty(name) { delete this.values[name]; },
    getPropertyValue(name) { return this.values[name] ?? ''; }
  };
  const node = {
    tagName: tag.toUpperCase(), nodeType: 1, hidden: false, children: [], parentNode: null, style,
    scrollTop: 0, scrollHeight: geometry.scrollHeight ?? 0, clientHeight: geometry.clientHeight ?? 0,
    offsetHeight: geometry.height ?? 0, offsetWidth: geometry.width ?? 0,
    rect: { top: geometry.top ?? 0, left: geometry.left ?? 0, width: geometry.width ?? 0, height: geometry.height ?? 0 },
    get firstChild() { return this.children[0] ?? null; },
    textContent: '', className: '',
    getBoundingClientRect() { const r = this.rect; return { ...r, bottom: r.top + r.height, right: r.left + r.width }; },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return name in attributes ? attributes[name] : null; },
    removeAttribute(name) { delete attributes[name]; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; },
    addEventListener(type, handler) { (listeners[type] ??= []).push(handler); },
    removeEventListener(type, handler) { listeners[type] = (listeners[type] ?? []).filter(item => item !== handler); },
    dispatch(type, init = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
      for (const handler of listeners[type] ?? []) handler(event);
      return event;
    },
    getElementsByTagName(name) {
      const found = [];
      const walk = item => { for (const child of item.children) { if (child.tagName === name.toUpperCase()) found.push(child); walk(child); } };
      walk(this);
      return found;
    },
    listenerCount(type) { return (listeners[type] ?? []).length; }
  };
  return node;
}
