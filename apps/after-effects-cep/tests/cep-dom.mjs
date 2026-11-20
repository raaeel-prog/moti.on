import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';

// The Chromium gallery delegates these interactions to its grid.
const bubblingEvents = new Set(['click', 'dblclick', 'contextmenu', 'keydown']);

export function createCepDocument() {
  const doc = createFakeDocument();
  const events = new Map();
  const nodeListeners = new WeakMap();
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const node = create(tag);
    node.hasAttribute = name => node.getAttribute(name) != null;
    const listeners = new Map();
    node.addEventListener = (type, handler) => {
      const handlers = listeners.get(type) ?? [];
      if (!handlers.includes(handler)) listeners.set(type, [...handlers, handler]);
    };
    node.removeEventListener = (type, handler) => {
      listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== handler));
    };
    node.emit = (type, init = {}) => {
      const event = {
        type,
        target: node,
        currentTarget: node,
        bubbles: bubblingEvents.has(type),
        defaultPrevented: false,
        cancelBubble: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.cancelBubble = true; },
        ...init
      };
      const ancestors = [node];
      if (event.bubbles) {
        for (let current = node.parentNode; current; current = current.parentNode) {
          ancestors.push(current);
        }
      }
      for (const current of ancestors) {
        event.currentTarget = current;
        for (const handler of nodeListeners.get(current)?.get(type) ?? []) handler(event);
        if (event.cancelBubble) break;
      }
      return event;
    };
    nodeListeners.set(node, listeners);
    node.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } }; node.scrollTop = 0; node.dataset = {};
    node.querySelectorAll = selector => { const found = []; const walk = n => { for (const child of n.children) { if (selector[0] === "." ? child.className.split(" ").includes(selector.slice(1)) : selector === "[data-scope]" ? child.dataset?.scope : child.tagName === selector) found.push(child); walk(child); } }; walk(node); return found; };
    node.classList = { contains(name) { return node.className.split(" ").includes(name); }, remove(...names) { node.className = node.className.split(" ").filter(n => n && !names.includes(n)).join(" "); }, toggle(name, force) { const has=node.className.split(" ").includes(name); const next=force ?? !has; node.className=node.className.split(" ").filter(n=>n&&n!==name).concat(next?[name]:[]).join(" "); return next; }, add(...names) { node.className = [...new Set([...node.className.split(' '), ...names])].join(' ').trim(); } };
    Object.defineProperty(node, 'parentElement', { get: () => node.parentNode });
    // O CEP roda no Chromium: a gaveta de presets usa nextSibling e insertBefore.
    // Ficam aqui, não no fake-dom do UXP, onde o ui-core detecta insertBefore para ligar o glide.
    Object.defineProperty(node, 'nextSibling', { get: () => { const siblings = node.parentNode?.children; const index = siblings ? siblings.indexOf(node) : -1; return index === -1 ? null : siblings[index + 1] ?? null; } });
    // Como no Chromium do AE: remover um nó que não é filho lança NotFoundError.
    // (Um removeChild tolerante escondeu a falha da aba Editar em 2026-11-18.)
    { const lenient = node.removeChild.bind(node); node.removeChild = child => { if (!node.children.includes(child)) { const error = new Error("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."); error.name = "NotFoundError"; throw error; } return lenient(child); }; }
    node.insertBefore = (child, reference) => { if (child.parentNode) child.parentNode.removeChild(child); const index = reference ? node.children.indexOf(reference) : -1; child.parentNode = node; node.children.splice(index === -1 ? node.children.length : index, 0, child); return child; };
    node.getBoundingClientRect = () => ({left: 10, top: 10, bottom: 54, width: 160, height: 60});
    node.querySelector = tag => node.getElementsByTagName(tag)[0];
    node.contains = candidate => { for(let current=candidate;current;current=current.parentNode)if(current===node)return true;return false; };
    node.closest = selector => {
      let current = node;
      while (current) { if (selector.split(',').some(s => current.className.split(' ').includes(s.trim().slice(1)))) return current; current = current.parentNode; }
      return null;
    };
    return node;
  };
  doc.documentElement = doc.createElement('html'); doc.documentElement.clientWidth = 340; doc.documentElement.clientHeight = 520;
  doc.hidden = false;
  // Menus de contexto e popovers vão para o body.
  if (!doc.body) { doc.body = doc.createElement('body'); doc.documentElement.appendChild(doc.body); }
  doc.addEventListener = (type, fn) => { events.set(type, [...(events.get(type) ?? []), fn]); };
  doc.removeEventListener = (type, fn) => { events.set(type, (events.get(type) ?? []).filter(f => f !== fn)); };
  doc.emit = (type,init={}) => (events.get(type) ?? []).forEach(fn => fn({type,target:doc,...init}));
  return doc;
}

/**
 * `node:assert/strict` com comparação segura de nós do DOM falso. Os nós têm
 * referências circulares e árvores enormes; quando uma asserção entre dois nós
 * falha, o Node tenta montar um diff deles e estoura a memória (derrubava a
 * suíte inteira em vez de mostrar o erro). Aqui, nós são comparados por
 * identidade e a falha mostra um rótulo curto.
 */
export function domSafeAssert(base) {
  const isNode = value => Boolean(value) && typeof value === 'object' && 'tagName' in value && 'children' in value;
  const label = value => {
    if (!isNode(value)) return String(value);
    const data = value.dataset && Object.keys(value.dataset).length ? ` ${JSON.stringify(value.dataset)}` : '';
    const text = String(value.textContent ?? '').trim().slice(0, 40);
    return `<${value.tagName}${value.id ? `#${value.id}` : ''}${value.className ? `.${String(value.className).trim().split(/\s+/).join('.')}` : ''}${data}${text ? ` "${text}"` : ''}>`;
  };
  const fail = (message, detail) => { throw new base.AssertionError({ message: message ? `${message} (${detail})` : detail }); };
  const same = (actual, expected, message) => {
    if (!isNode(actual) && !isNode(expected)) return base.strictEqual(actual, expected, message);
    if (actual !== expected) fail(message, `expected ${label(expected)}, got ${label(actual)}`);
  };
  const different = (actual, expected, message) => {
    if (!isNode(actual) && !isNode(expected)) return base.notStrictEqual(actual, expected, message);
    if (actual === expected) fail(message, `expected a node other than ${label(expected)}`);
  };
  const overrides = { equal: same, strictEqual: same, notEqual: different, notStrictEqual: different };
  return new Proxy(base, { get: (target, key) => overrides[key] ?? target[key] });
}
