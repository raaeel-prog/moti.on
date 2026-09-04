import test from "node:test";
import assert from "node:assert/strict";

import {
  REDUCED_MOTION_QUERY,
  REDUCED_MOTION_STORAGE_KEY,
  createBrowserReducedMotionController,
  createReducedMotionController
} from "../dist/index.js";

class FakeRoot {
  attributes = new Map();

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

class FakeStorage {
  values = new Map();
  reads = [];
  writes = [];

  getItem(key) {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.writes.push([key, value]);
    this.values.set(key, value);
  }
}

class FakeMediaQuery {
  matches = false;
  listeners = new Set();

  addEventListener(type, listener) {
    assert.equal(type, "change");
    this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    assert.equal(type, "change");
    this.listeners.delete(listener);
  }

  setMatches(matches) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

test("a preferência persistida reduz movimento mesmo quando o sistema não reduz", () => {
  const root = new FakeRoot();
  const storage = new FakeStorage();
  const media = new FakeMediaQuery();
  storage.values.set(REDUCED_MOTION_STORAGE_KEY, "1");

  const controller = createReducedMotionController({ root, storage, mediaQuery: media });

  assert.deepEqual(controller.snapshot(), {
    internal: true,
    system: false,
    effective: true,
    storage: "available"
  });
  assert.equal(root.getAttribute("data-reduced-motion"), "true");
  controller.dispose();
});

test("a preferência efetiva é OR entre toggle interno e sistema", () => {
  const root = new FakeRoot();
  const storage = new FakeStorage();
  const media = new FakeMediaQuery();
  const snapshots = [];
  const controller = createReducedMotionController({
    root,
    storage,
    mediaQuery: media,
    onChange: (snapshot) => snapshots.push(snapshot)
  });

  assert.equal(controller.snapshot().effective, false);
  media.setMatches(true);
  assert.equal(controller.snapshot().effective, true);
  assert.equal(root.getAttribute("data-reduced-motion"), "true");

  controller.setInternal(true);
  media.setMatches(false);
  assert.equal(controller.snapshot().effective, true);

  controller.setInternal(false);
  assert.equal(controller.snapshot().effective, false);
  assert.equal(root.getAttribute("data-reduced-motion"), null);
  assert.deepEqual(storage.writes, [
    [REDUCED_MOTION_STORAGE_KEY, "1"],
    [REDUCED_MOTION_STORAGE_KEY, "0"]
  ]);
  assert.ok(snapshots.length >= 4);
  controller.dispose();
  assert.equal(media.listeners.size, 0);
});

test("valor persistido inválido e falha de storage não quebram a interface", () => {
  const root = new FakeRoot();
  const unavailableStorage = {
    getItem() {
      throw new Error("read denied");
    },
    setItem() {
      throw new Error("write denied");
    }
  };

  const controller = createReducedMotionController({ root, storage: unavailableStorage });
  assert.equal(controller.snapshot().storage, "unavailable");
  assert.doesNotThrow(() => controller.setInternal(true));
  assert.equal(controller.snapshot().effective, true);
  assert.equal(root.getAttribute("data-reduced-motion"), "true");
});

test("o adapter de browser consulta a media query oficial e tolera getters hostis", () => {
  const root = new FakeRoot();
  const media = new FakeMediaQuery();
  const environment = {
    get localStorage() {
      throw new Error("storage getter");
    },
    matchMedia(query) {
      assert.equal(query, REDUCED_MOTION_QUERY);
      media.matches = true;
      return media;
    }
  };

  const controller = createBrowserReducedMotionController(root, environment);
  assert.equal(controller.snapshot().storage, "unavailable");
  assert.equal(controller.snapshot().system, true);
  assert.equal(root.getAttribute("data-reduced-motion"), "true");
  controller.dispose();
});

test("listener legado addListener também é removido no dispose", () => {
  const listeners = new Set();
  const mediaQuery = {
    matches: false,
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    }
  };
  const controller = createReducedMotionController({ root: new FakeRoot(), mediaQuery });
  assert.equal(listeners.size, 1);
  controller.dispose();
  assert.equal(listeners.size, 0);
});

test("evento de sistema repetido e dispose duplicado são idempotentes", () => {
  const media = new FakeMediaQuery();
  const snapshots = [];
  const controller = createReducedMotionController({
    root: new FakeRoot(),
    mediaQuery: media,
    onChange: (snapshot) => snapshots.push(snapshot)
  });

  assert.equal(snapshots.length, 1);
  media.setMatches(false);
  assert.equal(snapshots.length, 1);

  controller.dispose();
  controller.dispose();
  media.setMatches(true);
  assert.equal(controller.snapshot().system, false);
});

test("falha apenas na escrita rebaixa storage sem perder o estado interno", () => {
  const storage = {
    getItem() {
      return "valor-invalido";
    },
    setItem() {
      throw new Error("write denied");
    }
  };
  const controller = createReducedMotionController({ root: new FakeRoot(), storage });

  assert.equal(controller.snapshot().storage, "available");
  controller.setInternal(true);
  assert.deepEqual(controller.snapshot(), {
    internal: true,
    system: false,
    effective: true,
    storage: "unavailable"
  });
});

test("adapter de browser preserva storage válido quando matchMedia falha", () => {
  const storage = new FakeStorage();
  const controller = createBrowserReducedMotionController(new FakeRoot(), {
    localStorage: storage,
    matchMedia() {
      throw new Error("media denied");
    }
  });

  assert.equal(controller.snapshot().storage, "available");
  assert.equal(controller.snapshot().system, false);
  controller.setInternal(true);
  assert.deepEqual(storage.writes, [[REDUCED_MOTION_STORAGE_KEY, "1"]]);
});
