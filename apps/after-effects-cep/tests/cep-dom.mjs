import { createFakeDocument } from '../../../packages/ui-core/tests/fake-dom.mjs';
export function createCepDocument() {
  const doc = createFakeDocument();
  const events = new Map();
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const node = create(tag);
    node.style = { setProperty(key, value) { this[key] = value; } }; node.scrollTop = 0; node.dataset = {};
    node.querySelectorAll = selector => { const found = []; const walk = n => { for (const child of n.children) { if (selector[0] === "." ? child.className.split(" ").includes(selector.slice(1)) : selector === "[data-scope]" ? child.dataset?.scope : child.tagName === selector) found.push(child); walk(child); } }; walk(node); return found; };
    node.classList = { toggle(name, force) { const has=node.className.split(" ").includes(name); const next=force ?? !has; node.className=node.className.split(" ").filter(n=>n&&n!==name).concat(next?[name]:[]).join(" "); return next; }, add(...names) { node.className = [...new Set([...node.className.split(' '), ...names])].join(' ').trim(); } };
    Object.defineProperty(node, 'parentElement', { get: () => node.parentNode });
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
  doc.addEventListener = (type, fn) => { events.set(type, [...(events.get(type) ?? []), fn]); };
  doc.removeEventListener = (type, fn) => { events.set(type, (events.get(type) ?? []).filter(f => f !== fn)); };
  doc.emit = (type,init={}) => (events.get(type) ?? []).forEach(fn => fn({type,target:doc,...init}));
  return doc;
}
