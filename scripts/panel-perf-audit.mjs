#!/usr/bin/env node
/**
 * Mede a galeria no Chromium do CEP pelo protocolo de depuração do After Effects.
 *
 * Uso: node scripts/panel-perf-audit.mjs <rotulo> [--port=8091] [--runs=5] [--compare=<rotulo-base>]
 * Saída: artifacts/perf/<rotulo>.json com medianas e amostras individuais.
 * Abra Presets → Navegar → Todos os presets, sem filtros ou gavetas abertas.
 * Use a mesma visibilidade, idioma, tamanho do card e dimensões nos dois builds.
 */
/* global document, innerWidth, innerHeight, devicePixelRatio, requestAnimationFrame, MouseEvent, __adobe_cep__ */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = process.argv[2] ?? "";
const args = process.argv.slice(3);
const compare = args.find(arg => arg.startsWith("--compare="))?.slice("--compare=".length);
const output = path.join(root, "artifacts", "perf");
const numberArg = (name, fallback) => Number(args.find(arg => arg.startsWith(name))?.slice(name.length) ?? fallback);
const port = numberArg("--port=", 8091);
const runs = numberArg("--runs=", 5);
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label) ||
    args.some(arg => !/^--(?:port|runs)=\d+$|^--compare=[a-z0-9][a-z0-9._-]*$/i.test(arg)) ||
    compare === label ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    !Number.isInteger(runs) || runs < 1 || runs > 20) {
  console.error("Uso: node scripts/panel-perf-audit.mjs <rotulo> [--port=8091] [--runs=5] [--compare=<rotulo-base>]");
  process.exit(2);
}

/** Executado no painel via CDP. A pintura é estimada pelo segundo rAF. */
const PROBE = async (runs, expected) => {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const settle = async () => {
    await frame();
    await frame();
  };
  const round = value => Math.round(value * 10) / 10;
  const summary = times => {
    const sorted = [...times].sort((a, b) => a - b);
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
    return {
      frames: times.length,
      p50: round(at(0.5)),
      p90: round(at(0.9)),
      worst: round(sorted[sorted.length - 1] ?? 0),
      over34: times.filter(t => t > 34).length
    };
  };
  const ensureVisible = () => {
    if (document.visibilityState !== "visible") throw new Error("Mantenha o painel visível durante toda a medição.");
  };
  const perFrame = async (count, step) => {
    const times = [];
    await frame();
    let last = performance.now();
    for (let index = 0; index < count; index++) {
      step(index);
      await frame();
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    ensureVisible();
    return summary(times);
  };
  const untilPainted = async action => {
    await frame();
    const start = performance.now();
    action();
    const syncMs = round(performance.now() - start);
    await settle();
    ensureVisible();
    return { syncMs, paintedMs: round(performance.now() - start) };
  };
  const dispatch = (input, type) => input.dispatchEvent(new Event(type, { bubbles: true }));

  const gallery = document.querySelector(".ch-preset-gallery");
  const grid = gallery?.querySelector(".ch-preset-grid");
  const size = gallery?.querySelector(".ch-preset-size input[type=range]");
  const search = gallery?.querySelector(".ch-preset-search input, input.ch-preset-search");
  const resultCount = gallery?.querySelector(".ch-preset-result-count");
  const folderPicker = gallery?.querySelector(".ch-preset-filter-menu");
  const folderTrigger = gallery?.querySelector(".ch-preset-browser-heading button[aria-controls]");
  const currentFolder = () => gallery?.querySelector(".ch-preset-breadcrumb [aria-current=page]")?.dataset.focusKey;
  const folder = id => gallery?.querySelector(`.ch-folder-select[data-category="${id}"]`);
  const mountedCards = () => grid.querySelectorAll(".ch-preset-card").length;
  const countResults = () => Number(resultCount.textContent.trim().match(/^\d+/)?.[0]);
  ensureVisible();
  if (!grid || !size || !search || !resultCount || !grid.clientHeight) {
    throw new Error("Abra o painel no After Effects em Presets → Navegar.");
  }
  if (currentFolder() !== "path.all" || !folder("all") || !folder("motion") ||
      search.value !== "" || !gallery.querySelector(".ch-preset-clear-filters")?.hidden ||
      gallery.hasAttribute("data-settings-open") ||
      (gallery.dataset.folderPicker === "true" && !folderPicker?.hidden)) {
    throw new Error("Selecione Todos os presets e feche a busca, os filtros e a gaveta de ajustes.");
  }

  const totalCards = countResults();
  if (!Number.isInteger(totalCards) || totalCards < 1 || mountedCards() < 1) {
    throw new Error("A grade ainda não carregou o catálogo.");
  }

  const originalSize = size.value;
  const originalScrollTop = grid.scrollTop;
  const fixtureGeometry = {
    cardSize: Number(originalSize), gridWidth: grid.clientWidth, gridHeight: grid.clientHeight,
    maxScrollPx: grid.scrollHeight - grid.clientHeight
  };
  if (expected && (innerWidth !== expected.panel.width || innerHeight !== expected.panel.height ||
      devicePixelRatio !== expected.panel.dpr || totalCards !== expected.catalogCards ||
      Object.keys(fixtureGeometry).some(key => fixtureGeometry[key] !== expected.fixture[key]))) {
    throw new Error(`O painel e a grade precisam reproduzir a base. Atual: ${innerWidth}×${innerHeight}, grade ${fixtureGeometry.gridWidth}×${fixtureGeometry.gridHeight}, miniatura ${originalSize} px, ${totalCards} presets, ${fixtureGeometry.maxScrollPx} px roláveis.`);
  }
  const originalFocus = document.activeElement;
  const originalFocusKey = originalFocus?.dataset?.focusKey;
  const cardsAtPositions = async distancePx => {
    grid.scrollTop = distancePx;
    await settle();
    const far = { scrollTop: grid.scrollTop, cards: mountedCards() };
    grid.scrollTop = 0;
    await settle();
    return { top: mountedCards(), far };
  };
  const setSize = (value, commit = false) => {
    size.value = String(value);
    dispatch(size, "input");
    if (commit) dispatch(size, "change");
  };
  const setSearch = value => {
    search.value = value;
    dispatch(search, "input");
  };
  const prepareFolder = async id => {
    if (gallery.dataset.folderPicker === "true") {
      if (!folderTrigger || !folderPicker) throw new Error("Seletor de pastas indisponível.");
      if (folderPicker.hidden) folderTrigger.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const button = folder(id);
    if (!button || button.disabled) throw new Error(`Pasta indisponível: ${id}.`);
    return button;
  };

  // A partir do topo, cada passagem lê a mesma faixa do catálogo.
  grid.scrollTop = 0;
  await settle();
  for (const type of ["mouseenter", "mousemove"]) gallery.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  const maxScroll = fixtureGeometry.maxScrollPx;
  const stridePx = 120, steps = Math.floor(Math.min(maxScroll, 9000) / stridePx);
  if (steps < 1) throw new Error("A grade não tem altura rolável para o cenário de benchmark.");
  const distancePx = steps * stridePx;
  const values = [];
  const stepSize = Number(size.step) || 10;
  for (let value = Number(size.min); value <= Number(size.max); value += stepSize) values.push(value);
  const sliderPath = [...values, ...values.slice().reverse()];
  const initial = {
    panel: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    userAgent: document.defaultView.navigator.userAgent,
    host: typeof __adobe_cep__ === "undefined" ? undefined : JSON.parse(__adobe_cep__.getHostEnvironment()).appVersion,
    catalogCards: totalCards,
    cardsInDom: mountedCards(),
    nodesInGrid: grid.querySelectorAll("*").length,
    heading: gallery.querySelector(".ch-preset-browser-heading")?.textContent.trim(),
    fixture: {
      ...fixtureGeometry, scrollStepPx: stridePx, search: "fade", folder: "motion"
    }
  };
  const starKey = grid.querySelector('.ch-preset-favorite[aria-pressed="false"]')?.dataset.focusKey;
  const star = () => [...grid.querySelectorAll(".ch-preset-favorite")].find(node => node.dataset.focusKey === starKey);

  const measureSearch = async (value, expectedResults) => {
    const previousCount = countResults();
    const start = performance.now();
    setSearch(value);
    const times = [];
    let last = performance.now(), foundResults = false, paintedMs, postResultFrames = 0;
    // On a slow render the first frame can arrive after the nominal 700 ms
    // sample. Keep waiting for its two following frames before timing out.
    while (last - start < 8000 && (last - start < 700 || paintedMs === undefined)) {
      await frame();
      const now = performance.now();
      times.push(now - last);
      last = now;
      if (!foundResults) {
        const count = countResults();
        foundResults = Number.isInteger(count) && (expectedResults === undefined ? count !== previousCount : count === expectedResults);
      } else if (++postResultFrames === 2) paintedMs = round(now - start);
    }
    if (paintedMs === undefined) throw new Error(`A busca por "${value}" não estabilizou em tempo.`);
    ensureVisible();
    return { longestFrameMs: summary(times).worst, paintedMs, catalogCards: countResults(), cards: mountedCards() };
  };

  const measure = async () => {
    const idle = await perFrame(60, () => {});

    let storageWrites = 0;
    const storage = document.defaultView.localStorage;
    const storagePrototype = Object.getPrototypeOf(storage);
    const setItem = storagePrototype.setItem;
    storagePrototype.setItem = function (...args) {
      if (this === storage) storageWrites++;
      return setItem.apply(this, args);
    };
    let sizeSlider;
    try {
      sizeSlider = await perFrame(sliderPath.length, index => setSize(sliderPath[index]));
    } finally {
      storagePrototype.setItem = setItem;
      setSize(originalSize, true);
      await settle();
    }
    sizeSlider.storageWritesDuringDrag = storageWrites;

    const scroll = await perFrame(steps * 2, index => {
      grid.scrollTop = (index < steps ? index + 1 : steps * 2 - index - 1) * stridePx;
    });
    scroll.distancePx = distancePx;
    const positions = await cardsAtPositions(distancePx);
    if (Math.abs(positions.far.scrollTop - distancePx) > 1 || positions.far.cards === 0) {
      throw new Error("A grade não percorreu a distância ou ficou vazia fora do topo.");
    }
    scroll.cardsAtTop = positions.top;
    scroll.cardsAtDistance = positions.far.cards;

    let favorite = null;
    if (star()) {
      const on = await untilPainted(() => star().click());
      if (star()?.getAttribute("aria-pressed") !== "true") throw new Error("O favorito não foi marcado.");
      const off = await untilPainted(() => star().click());
      if (star()?.getAttribute("aria-pressed") !== "false") throw new Error("O favorito não foi restaurado.");
      favorite = { on, off, cardsAfter: mountedCards() };
    }

    const typed = await measureSearch("fade");
    const cleared = await measureSearch("", totalCards);

    const switchFolder = async id => {
      const button = await prepareFolder(id);
      const timing = await untilPainted(() => button.click());
      const catalogCards = countResults(), cards = mountedCards();
      if (currentFolder() !== `path.${id}` || cards === 0 || !Number.isInteger(catalogCards)) {
        throw new Error(`Resultado inesperado ao trocar para a pasta ${id}.`);
      }
      return { ...timing, catalogCards, cards };
    };
    const toMotion = await switchFolder("motion");
    const toAll = await switchFolder("all");
    if (toMotion.catalogCards >= totalCards || toAll.catalogCards !== totalCards) {
      throw new Error("A troca de pasta não retornou as coleções esperadas.");
    }
    return { idle, sizeSlider, scroll, favorite, search: { typed, cleared }, folderSwitch: { toMotion, toAll } };
  };

  try {
    await measure(); // Aquece antes de guardar as amostras.
    const samples = [];
    for (let index = 0; index < runs; index++) samples.push(await measure());
    if (innerWidth !== initial.panel.width || innerHeight !== initial.panel.height ||
        devicePixelRatio !== initial.panel.dpr || grid.clientWidth !== fixtureGeometry.gridWidth ||
        grid.clientHeight !== fixtureGeometry.gridHeight || size.value !== originalSize ||
        grid.scrollHeight - grid.clientHeight !== maxScroll) {
      throw new Error("O tamanho do painel mudou durante a medição.");
    }
    return { ...initial, samples };
  } finally {
    if (size.value !== originalSize) setSize(originalSize, true);
    if (search.value !== "") {
      setSearch("");
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (star()?.getAttribute("aria-pressed") === "true") star().click();
    if (currentFolder() !== "path.all") (await prepareFolder("all")).click();
    if (gallery.dataset.folderPicker === "true" && !folderPicker?.hidden) folderTrigger?.click();
    grid.scrollTop = originalScrollTop;
    await settle();
    const focus = originalFocus?.isConnected ? originalFocus : originalFocusKey && [...gallery.querySelectorAll("[data-focus-key]")].find(node => node.dataset.focusKey === originalFocusKey);
    if (focus) focus.focus({ preventScroll: true });
  }
};

function medians(samples) {
  const first = samples[0];
  if (first === null) return null;
  if (typeof first === "number") {
    const sorted = samples.slice().sort((a, b) => a - b);
    return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  }
  return Object.fromEntries(Object.keys(first).map(key => [key, medians(samples.map(sample => sample[key]))]));
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })
  .then(response => response.json()).catch(() => null);
const target = targets?.find(entry => entry.type === "page" && /^file:.*com\.motion\.plugin\.ae\//i.test(entry.url));
if (!target) {
  console.error(`Painel Moti.on não encontrado na porta ${port}. O After Effects está aberto com o .debug instalado?`);
  process.exit(1);
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const evaluate = expression => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Tempo esgotado esperando o painel.")), (runs + 1) * 60000);
  socket.addEventListener("message", function onMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    socket.removeEventListener("message", onMessage);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message));
    else if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.exception?.description ?? "Erro no painel."));
    else resolve(message.result?.result?.value);
  });
  socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});

try {
  const baseline = compare ? JSON.parse(await readFile(path.join(output, `${compare}.json`), "utf8")) : null;
  if (baseline && baseline.schema !== 2) throw new Error("Use uma base de medição do mesmo protocolo (schema 2).");
  const expected = baseline ? { panel: baseline.panel, fixture: baseline.fixture, catalogCards: baseline.catalogCards } : null;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Falha ao abrir a conexão de depuração do CEP.")), { once: true });
  });
  const result = await evaluate(`(${PROBE.toString()})(${runs}, ${JSON.stringify(expected)})`);
  if (!result?.samples?.length) throw new Error("O painel não devolveu as amostras.");
  const { samples, ...initial } = result;
  const report = {
    schema: 2, label, measuredAt: new Date().toISOString(), panelUrl: target.url,
    machine: { system: os.type(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model },
    ...initial, ...medians(samples), runs, samples
  };
  await mkdir(output, { recursive: true });
  const outputFile = path.join(output, `${label}.json`);
  await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputFile, ...report, samples: undefined }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  socket.close();
}
