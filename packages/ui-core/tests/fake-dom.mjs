/**
 * DOM minimo para testar o shell fora de um host Adobe.
 *
 * Implementa exatamente o subconjunto que o shell tem permissao de usar:
 * createElement, appendChild, removeChild, textContent, className, title,
 * setAttribute, addEventListener. Se um teste falhar aqui por metodo ausente, a
 * resposta certa quase sempre e tirar o metodo do shell — nao adiciona-lo aqui —
 * porque o UXP nao e um navegador e nao implementa o DOM inteiro.
 */

export function createFakeDocument({ supportsNamespaces = true, clientWidth = 360 } = {}) {
  const doc = {
    activeElement: null,
    createElement(tag) {
      return createNode(tag);
    },
    documentElement: { clientWidth }
  };

  if (supportsNamespaces) {
    doc.createElementNS = (namespace, tag) => {
      const node = createNode(tag);
      node.namespace = namespace;
      return node;
    };
  }

  function createNode(tag) {
    const listeners = {};

    return {
      tagName: tag,
      className: "",
      textContent: "",
      title: "",
      disabled: false,
      offsetWidth: 0,
      attributes: {},
      children: [],
      ownerDocument: doc,

      get firstChild() {
        return this.children.length ? this.children[0] : null;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const index = this.children.indexOf(child);
        if (index !== -1) this.children.splice(index, 1);
        return child;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      addEventListener(type, handler) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      },
      click() {
        (listeners.click || []).forEach((handler) => handler());
      },
      focus() {
        doc.activeElement = this;
      },
      keydown(key) {
        const event = {
          key,
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          }
        };
        (listeners.keydown || []).forEach((handler) => handler(event));
        return event;
      },
      getElementsByTagName(name) {
        const found = [];
        const walk = (node) => {
          node.children.forEach((child) => {
            if (child.tagName === name) found.push(child);
            walk(child);
          });
        };
        walk(this);
        return found;
      },
      /** Texto de toda a subarvore, para asserir o que o usuario leria. */
      get allText() {
        const parts = this.textContent ? [this.textContent] : [];
        this.children.forEach((child) => parts.push(child.allText));
        return parts.filter(Boolean).join(" ");
      }
    };
  }

  return doc;
}

/** Janela minima, com registro de listeners para testar o cancelamento. */
export function createFakeWindow(innerWidth = 360) {
  const listeners = new Map();

  return {
    innerWidth,
    addEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) ?? [];
      const index = list.indexOf(handler);
      if (index !== -1) list.splice(index, 1);
    },
    listenerCount(type) {
      return (listeners.get(type) ?? []).length;
    },
    emit(type) {
      (listeners.get(type) ?? []).slice().forEach((handler) => handler());
    }
  };
}
