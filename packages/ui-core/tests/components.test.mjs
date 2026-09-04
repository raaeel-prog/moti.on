import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  COMPONENT_STATES,
  createActionButton,
  createChipGroup,
  createDrawer,
  createPopover,
  createQuickTile,
  createQuickTileGrid,
  createSliderField,
  createToastRegion
} from "../dist/components.js";
import { createFakeDocument } from "./fake-dom.mjs";

const ROOT = new URL("../../../", import.meta.url);

function createScheduler() {
  let nextId = 1;
  const pending = new Map();
  const delays = [];

  return {
    api: {
      setTimeout(callback, delay) {
        const id = nextId++;
        pending.set(id, callback);
        delays.push(delay);
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      }
    },
    delays,
    get size() {
      return pending.size;
    },
    runAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    }
  };
}

test("o kit publica o vocabulario completo de estados logicos", () => {
  assert.deepEqual(COMPONENT_STATES, [
    "default",
    "loading",
    "empty",
    "success",
    "warning",
    "error",
    "unsupported"
  ]);
  assert.equal(Object.isFrozen(COMPONENT_STATES), true);
});

test("estado nao padrao e indisponibilidade nunca nascem sem explicacao", () => {
  const doc = createFakeDocument();

  assert.throws(
    () => createActionButton(doc, { label: "Aplicar", state: "loading", onPress() {} }),
    /stateLabel/
  );
  assert.throws(
    () => createActionButton(doc, { label: "Aplicar", disabled: true, onPress() {} }),
    /disabledReason/
  );
});

test("botao mantem nome nativo, motivo acessivel e bloqueia press quando indisponivel", () => {
  const doc = createFakeDocument();
  let presses = 0;
  const control = createActionButton(doc, {
    id: "apply",
    label: "Aplicar",
    variant: "primary",
    disabled: true,
    disabledReason: "Selecione ao menos 1 layer.",
    onPress() {
      presses += 1;
    }
  });

  assert.equal(control.button.tagName, "button");
  assert.equal(control.button.getAttribute("type"), "button");
  assert.equal(control.button.getAttribute("aria-disabled"), "true");
  assert.match(control.button.getAttribute("aria-describedby"), /apply-disabled-reason/);
  assert.equal(control.element.children.at(-1).getAttribute("data-hidden"), "false");
  assert.match(control.element.allText, /Selecione ao menos 1 layer/);

  control.button.click();
  control.button.keydown("Enter");
  assert.equal(presses, 0);
  control.button.emit("focus");
  assert.equal(control.element.getAttribute("data-disabled-explanation"), "open");
  control.button.emit("blur");
  assert.equal(control.element.getAttribute("data-disabled-explanation"), "closed");

  control.setDisabled(false);
  assert.equal(control.element.children.at(-1).getAttribute("data-hidden"), "true");
  control.button.keydown("Enter");
  assert.equal(presses, 1);
});

test("botao ocupa loading sem dupla ativacao e anuncia a transicao de estado", () => {
  const doc = createFakeDocument();
  let presses = 0;
  const control = createActionButton(doc, {
    label: "Ajustar",
    onPress() {
      presses += 1;
    }
  });

  control.setState("loading", "Ajustando");
  assert.equal(control.element.getAttribute("data-state"), "loading");
  assert.equal(control.button.getAttribute("aria-busy"), "true");
  control.button.click();
  assert.equal(presses, 0);

  control.setState("success", "Ajuste concluido");
  assert.equal(control.button.getAttribute("aria-busy"), undefined);
  assert.match(control.element.allText, /Ajuste concluido/);
  control.button.click();
  assert.equal(presses, 1);
});

test("tile expoe descricao, preset, estado por texto e affordance avancada separada", () => {
  const doc = createFakeDocument();
  const tile = createQuickTile(doc, {
    id: "wiggle",
    label: "Wiggle",
    oneLine: "Crie movimento continuo e reproduzivel.",
    presetLabel: "Suave · 2 Hz",
    advancedLabel: "Abrir avancado",
    state: "success",
    stateLabel: "Rig aplicado",
    onQuick() {},
    onAdvanced() {},
    onPreview() {}
  });

  assert.equal(tile.primary.getAttribute("role"), "button");
  assert.match(tile.primary.getAttribute("aria-describedby"), /wiggle-description/);
  assert.equal(tile.advanced.getAttribute("tabindex"), "-1");
  assert.equal(tile.advanced.getAttribute("aria-label"), "Abrir avancado: Wiggle");
  assert.match(tile.element.allText, /Suave · 2 Hz/);
  assert.match(tile.element.allText, /● Rig aplicado/);
});

test("tile atrasa spinner, confirma por 700 ms e preserva marca sem depender so de cor", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const tile = createQuickTile(doc, {
    id: "feedback-tile",
    label: "Wiggle",
    oneLine: "Crie movimento.",
    advancedLabel: "Abrir avancado",
    iconText: "W",
    disabledMarker: "🔒",
    scheduler: scheduler.api,
    onQuick() {},
    onAdvanced() {},
    onPreview() {}
  });

  assert.equal(tile.icon.textContent, "W");
  tile.setState("loading", "Aplicando Wiggle");
  assert.equal(tile.icon.textContent, "W");
  assert.equal(tile.icon.getAttribute("data-feedback"), "waiting");
  assert.equal(scheduler.delays.at(-1), 180);
  scheduler.runAll();
  assert.equal(tile.icon.textContent, "◌");
  assert.equal(tile.icon.getAttribute("data-feedback"), "loading");

  tile.setState("success", "Rig aplicado");
  assert.equal(tile.icon.textContent, "✓");
  assert.equal(tile.icon.getAttribute("data-feedback"), "success");
  assert.equal(scheduler.delays.at(-1), 700);
  scheduler.runAll();
  assert.equal(tile.icon.textContent, "W");
  assert.equal(tile.icon.getAttribute("data-feedback"), "default");
  assert.match(tile.element.allText, /● Rig aplicado/);

  tile.setDisabled(true, "Licenca Suite necessaria");
  assert.equal(tile.icon.textContent, "🔒");
  assert.equal(tile.icon.getAttribute("data-feedback"), "disabled");
  tile.setDisabled(false);
  assert.equal(tile.icon.textContent, "W");
});

test("tile oferece Quick, Advanced e preview pelo teclado sem disparo duplicado", () => {
  const doc = createFakeDocument();
  const calls = [];
  const tile = createQuickTile(doc, {
    id: "wiggle",
    label: "Wiggle",
    oneLine: "Crie movimento.",
    advancedLabel: "Abrir avancado",
    onQuick: () => calls.push("quick"),
    onAdvanced: () => calls.push("advanced"),
    onPreview: () => calls.push("preview")
  });

  tile.primary.keydown("Enter");
  tile.primary.keydown("Enter", { altKey: true });
  tile.primary.keydown("?");
  tile.primary.click({ altKey: true });
  tile.advanced.click();

  assert.deepEqual(calls, ["quick", "advanced", "preview", "advanced", "advanced"]);
});

test("tile indisponivel continua focavel para explicar o motivo e nao executa", () => {
  const doc = createFakeDocument();
  const calls = [];
  const tile = createQuickTile(doc, {
    id: "camera",
    label: "Camera",
    oneLine: "Crie uma camera.",
    advancedLabel: "Abrir avancado",
    disabled: true,
    disabledReason: "Abra uma composicao.",
    onQuick: () => calls.push("quick"),
    onAdvanced: () => calls.push("advanced"),
    onPreview: () => calls.push("preview")
  });

  assert.equal(tile.primary.getAttribute("aria-disabled"), "true");
  assert.notEqual(tile.primary.getAttribute("tabindex"), "-1");
  assert.match(tile.element.allText, /Abra uma composicao/);
  tile.primary.click();
  tile.primary.keydown("Enter", { altKey: true });
  tile.primary.keydown("?");
  assert.deepEqual(calls, []);
});

test("atalho de preview do tile pode ser remapeado ou desligado", () => {
  const doc = createFakeDocument();
  const calls = [];
  const remapped = createQuickTile(doc, {
    id: "remapped-preview",
    label: "Wiggle",
    oneLine: "Crie movimento.",
    advancedLabel: "Abrir avancado",
    previewKey: "p",
    onQuick() {},
    onAdvanced() {},
    onPreview: () => calls.push("preview")
  });
  remapped.primary.keydown("?");
  assert.deepEqual(calls, []);
  remapped.primary.keydown("p");
  assert.deepEqual(calls, ["preview"]);

  const disabled = createQuickTile(doc, {
    id: "disabled-preview",
    label: "Delay",
    oneLine: "Atrase keyframes.",
    advancedLabel: "Abrir avancado",
    previewKey: null,
    onQuick() {},
    onAdvanced() {},
    onPreview: () => calls.push("disabled-preview")
  });
  disabled.primary.keydown("?");
  assert.deepEqual(calls, ["preview"]);
});

test("grid anuncia geometria real e oferece uma unica parada de Tab", () => {
  const doc = createFakeDocument();
  const tiles = ["A", "B", "C", "D", "E"].map((label) => createQuickTile(doc, {
    id: label.toLowerCase(),
    label,
    oneLine: `${label} descricao`,
    advancedLabel: "Avancado",
    onQuick() {},
    onAdvanced() {},
    onPreview() {}
  }));
  const grid = createQuickTileGrid(doc, { label: "Ferramentas", columns: 3, tiles });

  assert.equal(grid.element.getAttribute("role"), "grid");
  assert.equal(grid.element.getAttribute("aria-rowcount"), "2");
  assert.equal(grid.element.getAttribute("aria-colcount"), "3");
  assert.equal(grid.element.getElementsByRole("row").length, 2);
  assert.equal(grid.element.getElementsByRole("gridcell").length, 5);
  assert.equal(grid.element.getAttribute("style"), undefined);
  assert.equal(tiles.filter((tile) => tile.primary.getAttribute("tabindex") === "0").length, 1);
});

test("setas, Home e End movem o foco no grid sem acionar ferramenta", () => {
  const doc = createFakeDocument();
  const calls = [];
  const tiles = ["A", "B", "C", "D", "E"].map((label) => createQuickTile(doc, {
    id: label.toLowerCase(),
    label,
    oneLine: `${label} descricao`,
    advancedLabel: "Avancado",
    onQuick: () => calls.push(label),
    onAdvanced() {},
    onPreview() {}
  }));
  createQuickTileGrid(doc, { label: "Ferramentas", columns: 3, tiles });

  tiles[0].primary.focus();
  assert.equal(tiles[0].primary.keydown("ArrowDown").defaultPrevented, true);
  assert.equal(doc.activeElement, tiles[3].primary);
  tiles[3].primary.keydown("End");
  assert.equal(doc.activeElement, tiles[4].primary);
  tiles[4].primary.keydown("Home");
  assert.equal(doc.activeElement, tiles[0].primary);
  assert.deepEqual(calls, []);
});

test("slider une range, campo numerico, unidade e ARIA no mesmo valor", () => {
  const doc = createFakeDocument();
  const slider = createSliderField(doc, {
    id: "amplitude",
    label: "Amplitude",
    numberLabel: "Amplitude numerica",
    value: 12,
    defaultValue: 8,
    min: 0,
    max: 100,
    step: 1,
    unit: "px",
    formatValue: (value) => `${value} pixels`,
    onInput() {},
    onCommit() {}
  });

  assert.equal(slider.range.getAttribute("role"), "slider");
  assert.equal(slider.range.getAttribute("aria-valuemin"), "0");
  assert.equal(slider.range.getAttribute("aria-valuemax"), "100");
  assert.equal(slider.range.getAttribute("aria-valuenow"), "12");
  assert.equal(slider.range.getAttribute("aria-valuetext"), "12 pixels");
  assert.equal(slider.range.getAttribute("aria-labelledby"), "amplitude-label");
  assert.equal(slider.range.parentNode.getAttribute("aria-hidden"), undefined);
  assert.equal(slider.numberInput.getAttribute("aria-label"), "Amplitude numerica");
  assert.match(slider.element.allText, /px/);
  slider.label.click();
  assert.equal(doc.activeElement, slider.range);
});

test("slider implementa passo, passo grosso, dez por cento e limites pelo teclado", () => {
  const doc = createFakeDocument();
  const inputs = [];
  const commits = [];
  const slider = createSliderField(doc, {
    id: "amount",
    label: "Amount",
    numberLabel: "Numeric amount",
    value: 20,
    defaultValue: 20,
    min: 0,
    max: 100,
    step: 2,
    unit: "%",
    onInput: (value) => inputs.push(value),
    onCommit: (value) => commits.push(value)
  });

  slider.range.keydown("ArrowRight");
  assert.equal(slider.value, 22);
  slider.range.keydown("ArrowUp", { shiftKey: true });
  assert.equal(slider.value, 42);
  slider.range.keydown("PageUp");
  assert.equal(slider.value, 52);
  slider.range.keydown("PageDown");
  assert.equal(slider.value, 42);
  slider.range.keydown("End");
  assert.equal(slider.value, 100);
  slider.range.keydown("Home");
  assert.equal(slider.value, 0);
  assert.deepEqual(inputs, commits);
  assert.deepEqual(commits, [22, 42, 52, 42, 100, 0]);
});

test("campo numerico rejeita nao finito e duplo clique no rotulo restaura preset", () => {
  const doc = createFakeDocument();
  const commits = [];
  const slider = createSliderField(doc, {
    id: "frequency",
    label: "Frequencia",
    numberLabel: "Frequencia numerica",
    value: 4,
    defaultValue: 2,
    min: 0,
    max: 10,
    step: 0.5,
    unit: "Hz",
    onInput() {},
    onCommit: (value) => commits.push(value)
  });

  slider.numberInput.value = "invalido";
  slider.numberInput.emit("change");
  assert.equal(slider.numberInput.getAttribute("aria-invalid"), "true");
  assert.deepEqual(commits, []);

  slider.label.emit("dblclick");
  assert.equal(slider.value, 2);
  assert.deepEqual(commits, [2]);
});

test("chips usam radiogroup, roving tabindex e pulam opcao indisponivel", () => {
  const doc = createFakeDocument();
  const changes = [];
  const group = createChipGroup(doc, {
    id: "preset",
    label: "Presets",
    value: "soft",
    items: [
      { value: "soft", label: "Suave" },
      { value: "pro", label: "Pro", disabled: true, disabledReason: "Plano Suite" },
      { value: "strong", label: "Forte" }
    ],
    onChange: (value) => changes.push(value)
  });

  assert.equal(group.element.getAttribute("role"), "radiogroup");
  assert.equal(group.chips[0].getAttribute("aria-checked"), "true");
  assert.match(group.chips[0].textContent, /^● /);
  assert.match(group.chips[1].textContent, /^— /);
  assert.match(group.chips[2].textContent, /^○ /);
  assert.equal(group.chips.filter((chip) => chip.getAttribute("tabindex") === "0").length, 1);
  group.chips[0].keydown("ArrowRight");
  assert.equal(doc.activeElement, group.chips[2]);
  assert.equal(group.value, "strong");
  assert.deepEqual(changes, ["strong"]);
  group.chips[1].click();
  assert.deepEqual(changes, ["strong"]);
});

test("loading e unsupported bloqueiam mutacoes e explicam cada controle", () => {
  const doc = createFakeDocument();
  let buttonPresses = 0;
  const button = createActionButton(doc, {
    id: "blocked-action",
    label: "Aplicar",
    onPress: () => {
      buttonPresses += 1;
    }
  });
  button.setState("unsupported", "Host sem suporte");
  button.button.click();
  assert.equal(buttonPresses, 0);
  assert.equal(button.button.getAttribute("aria-disabled"), "true");
  assert.match(button.button.getAttribute("aria-describedby"), /blocked-action-state/);

  const sliderInputs = [];
  const slider = createSliderField(doc, {
    id: "blocked-slider",
    label: "Amplitude",
    numberLabel: "Amplitude numerica",
    value: 2,
    defaultValue: 2,
    min: 0,
    max: 10,
    step: 1,
    onInput: (value) => sliderInputs.push(value),
    onCommit() {}
  });
  slider.setState("loading", "Sincronizando com o host");
  slider.range.value = "7";
  slider.range.emit("input");
  assert.equal(slider.value, 2);
  assert.deepEqual(sliderInputs, []);
  assert.equal(slider.range.getAttribute("aria-disabled"), "true");
  assert.match(slider.range.getAttribute("aria-describedby"), /blocked-slider-state/);

  const changes = [];
  const chips = createChipGroup(doc, {
    id: "blocked-chips",
    label: "Presets",
    value: "a",
    items: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    onChange: (value) => changes.push(value)
  });
  chips.setState("unsupported", "Presets indisponiveis neste host");
  chips.chips[1].click();
  assert.equal(chips.value, "a");
  assert.deepEqual(changes, []);
  assert.equal(chips.chips[0].getAttribute("aria-disabled"), "true");
  assert.match(chips.chips[0].getAttribute("aria-describedby"), /blocked-chips-state/);

  chips.setState("default");
  chips.setDisabled(true, "Edicao bloqueada pela selecao");
  assert.match(chips.chips[0].getAttribute("aria-describedby"), /blocked-chips-disabled-reason/);
  assert.equal(chips.chips[0].title, "Edicao bloqueada pela selecao");
});

test("popover abre sob demanda, fecha com Esc e devolve foco a origem", () => {
  const doc = createFakeDocument();
  const origin = doc.createElement("button");
  const content = doc.createElement("div");
  content.textContent = "Preview real";
  const closes = [];
  const popover = createPopover(doc, {
    id: "wiggle-preview",
    label: "Preview de Wiggle",
    content,
    onClose: (reason) => closes.push(reason)
  });

  origin.focus();
  popover.open(origin);
  assert.equal(popover.isOpen, true);
  assert.equal(doc.activeElement, popover.element);
  assert.equal(popover.element.getAttribute("tabindex"), "-1");
  assert.equal(popover.element.hidden, false);
  assert.equal(popover.element.getAttribute("data-hidden"), "false");
  assert.equal(popover.element.getAttribute("data-open"), "true");
  assert.match(popover.element.getAttribute("data-motion"), /preview-enter/);

  const event = popover.element.keydown("Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(popover.isOpen, false);
  assert.equal(doc.activeElement, origin);
  assert.deepEqual(closes, ["escape"]);
  popover.element.emit("animationend");
  assert.equal(popover.element.hidden, true);
  assert.equal(popover.element.getAttribute("data-hidden"), "true");
});

test("animationend de filho nao encerra prematuramente popover ou gaveta", () => {
  const doc = createFakeDocument();
  const popoverContent = doc.createElement("div");
  const popover = createPopover(doc, {
    id: "nested-animation-popover",
    label: "Preview",
    content: popoverContent
  });
  popover.open();
  popover.close();
  popover.element.emit("animationend", { target: popoverContent });
  assert.equal(popover.element.hidden, false);
  popover.element.emit("animationend");
  assert.equal(popover.element.hidden, true);

  const drawerContent = doc.createElement("div");
  const drawer = createDrawer(doc, {
    id: "nested-animation-drawer",
    label: "Inspector",
    content: drawerContent,
    overlay: true
  });
  drawer.open();
  drawer.close();
  drawer.element.emit("animationend", { target: drawerContent });
  assert.equal(drawer.element.hidden, false);
  drawer.element.emit("animationend");
  assert.equal(drawer.element.hidden, true);
});

test("popover e gaveta finalizam mesmo quando o runtime nao emite animationend", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const popover = createPopover(doc, {
    id: "fallback-popover",
    label: "Preview",
    content: doc.createElement("div"),
    scheduler: scheduler.api
  });
  const drawer = createDrawer(doc, {
    id: "fallback-drawer",
    label: "Inspector",
    content: doc.createElement("div"),
    overlay: true,
    scheduler: scheduler.api
  });

  popover.open();
  drawer.open();
  popover.close();
  drawer.close();
  assert.equal(popover.element.hidden, false);
  assert.equal(drawer.element.hidden, false);
  scheduler.runAll();
  assert.equal(popover.element.hidden, true);
  assert.equal(drawer.element.hidden, true);
  assert.equal(drawer.backdrop.hidden, true);
});

test("gaveta sobreposta prende Tab, Esc fecha e foco retorna ao tile", () => {
  const doc = createFakeDocument();
  const origin = doc.createElement("button");
  const content = doc.createElement("div");
  const first = doc.createElement("button");
  const last = doc.createElement("input");
  content.appendChild(first);
  content.appendChild(last);
  const drawer = createDrawer(doc, {
    id: "wiggle-inspector",
    label: "Inspector Wiggle",
    content,
    overlay: true
  });

  origin.focus();
  drawer.open(origin);
  assert.equal(doc.activeElement, first);
  last.focus();
  assert.equal(drawer.element.keydown("Tab").defaultPrevented, true);
  assert.equal(doc.activeElement, first);
  first.focus();
  drawer.element.keydown("Tab", { shiftKey: true });
  assert.equal(doc.activeElement, last);
  drawer.element.keydown("Escape");
  assert.equal(doc.activeElement, origin);
  assert.equal(drawer.backdrop.getAttribute("data-open"), "false");
});

test("gaveta fixa larga nao cria armadilha de foco", () => {
  const doc = createFakeDocument();
  const content = doc.createElement("div");
  const only = doc.createElement("button");
  content.appendChild(only);
  const drawer = createDrawer(doc, {
    id: "wide-inspector",
    label: "Inspector",
    content,
    overlay: false
  });

  drawer.open();
  const event = drawer.element.keydown("Tab");
  assert.equal(event.defaultPrevented, false);
  assert.equal(drawer.element.getAttribute("aria-modal"), "false");
});

test("gaveta calcula o foco pela ordem real do DOM, nao agrupado por tag", () => {
  const doc = createFakeDocument();
  const content = doc.createElement("div");
  const firstInDom = doc.createElement("input");
  const secondInDom = doc.createElement("button");
  content.appendChild(firstInDom);
  content.appendChild(secondInDom);
  const drawer = createDrawer(doc, {
    id: "dom-order-inspector",
    label: "Inspector",
    content,
    overlay: true
  });

  drawer.open();

  assert.equal(doc.activeElement, firstInDom);
});

test("toast com acao dura ao menos 8 s, fixa ao foco e usa live region polite", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const calls = [];
  const region = createToastRegion(doc, {
    id: "results",
    label: "Resultados",
    dismissLabel: "Fechar",
    scheduler: scheduler.api
  });
  const toast = region.push({
    message: "Wiggle aplicado em 3 layers.",
    detail: "3 controles criados.",
    state: "success",
    stateLabel: "Sucesso",
    durationMs: 100,
    actions: [{ label: "Ajustar", onPress: () => calls.push("adjust") }]
  });

  assert.equal(toast.element.getAttribute("role"), "status");
  assert.equal(toast.element.getAttribute("aria-live"), "polite");
  assert.equal(region.element.getAttribute("aria-live"), undefined);
  assert.equal(toast.element.getElementsByRole("status").length, 0);
  assert.equal(scheduler.delays[0], 8000);
  assert.equal(scheduler.size, 1);
  toast.element.emit("focusin");
  assert.equal(toast.element.getAttribute("data-pinned"), "true");
  assert.equal(scheduler.size, 0);
  toast.actions[0].click();
  assert.deepEqual(calls, ["adjust"]);
});

test("erro recuperavel fica indefinido e assertive so existe quando solicitado", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const region = createToastRegion(doc, {
    id: "errors",
    label: "Erros",
    dismissLabel: "Fechar",
    scheduler: scheduler.api
  });
  const polite = region.push({
    message: "Selecao invalida.",
    state: "error",
    stateLabel: "Erro recuperavel",
    recoverable: true
  });
  const assertive = region.push({
    message: "Falha destrutiva.",
    state: "error",
    stateLabel: "Erro",
    assertive: true
  });

  assert.equal(polite.element.getAttribute("data-duration"), "indefinite");
  assert.equal(polite.element.getAttribute("aria-live"), "polite");
  assert.equal(assertive.element.getAttribute("role"), "alert");
  assert.equal(assertive.element.getAttribute("aria-live"), "assertive");
  assert.equal(scheduler.size, 1);
});

test("regiao de toast mantem no maximo tres e substitui o mais antigo", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const region = createToastRegion(doc, {
    id: "toasts",
    label: "Resultados",
    dismissLabel: "Fechar",
    maxVisible: 3,
    scheduler: scheduler.api
  });

  const created = [1, 2, 3, 4].map((index) => region.push({
    message: `Resultado ${index}`,
    state: "success",
    stateLabel: "Sucesso"
  }));

  assert.equal(region.items.length, 3);
  assert.equal(region.element.children.length, 3);
  assert.equal(region.items.includes(created[0]), false);
  assert.match(region.element.allText, /Resultado 4/);
  assert.doesNotMatch(region.element.allText, /Resultado 1/);
});

test("CSS cobre pseudoestados, todos os estados logicos e os IDs de movimento", async () => {
  const css = await readFile(new URL("packages/ui-core/src/components.css", ROOT), "utf8");

  for (const selector of [
    ":hover",
    ":focus",
    ":active",
    '[aria-disabled="true"]',
    '[data-state="loading"]',
    '[data-state="empty"]',
    '[data-state="success"]',
    '[data-state="warning"]',
    '[data-state="error"]',
    '[data-state="unsupported"]'
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(css, /\.ch-popover:focus/);
  assert.match(css, /\.ch-drawer:focus/);
  assert.match(css, /\.ch-quick-tile\[data-state="success"\]\s*>\s*\.ch-component-state[^}]*var\(--accent\)/s);

  assert.match(css, /\[data-hidden="true"\]/);
  assert.doesNotMatch(css, /ch-disabled-reason\[aria-hidden/);
  assert.doesNotMatch(css, /display:\s*(?:inline-)?grid\b/);
  assert.doesNotMatch(css, /\bgrid-(?:template|row|column)\b/);
  assert.doesNotMatch(css, /:is\(|:focus-visible|:focus-within/);
  assert.doesNotMatch(css, /(?:^|[;{]\s*)font\s*:/m);
  assert.doesNotMatch(css, /(?:^|\s)gap\s*:/m);
  assert.doesNotMatch(css, /\b(?:inset(?:-inline)?|border-inline-start|margin-inline-start)\s*:/);
  assert.doesNotMatch(css, /\b(?:accent-color|scrollbar-width|transition)\s*:/);
  assert.doesNotMatch(css, /\b(?:min\(|fit-content\b)/);

  for (const motion of [
    "tile-hover",
    "tile-press",
    "tile-advanced",
    "slider-knob",
    "slider-track",
    "preset-chip",
    "preview-enter",
    "preview-exit",
    "drawer-enter",
    "drawer-exit",
    "drawer-dimmer",
    "toast-enter",
    "toast-exit"
  ]) {
    assert.match(css, new RegExp(`data-motion[^\\n]*${motion}`));
  }

  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
  assert.doesNotMatch(css, /(?:transition|animation)[^;]*(?:width|height|top|left|margin)/i);
});

test("kit nao atravessa a fronteira de apresentacao e entra no tema dos dois hosts", async () => {
  const [source, build] = await Promise.all([
    readFile(new URL("packages/ui-core/src/components.ts", ROOT), "utf8"),
    readFile(new URL("scripts/build.mjs", ROOT), "utf8")
  ]);

  assert.doesNotMatch(source, /evalScript|premierepro|require\s*\(|node:fs|fetch\s*\(/);
  assert.match(build, /ui-core[^\n]+components\.css/s);
});

test("construtores recusam ranges, geometrias e estados ambiguos", () => {
  const doc = createFakeDocument();
  assert.throws(
    () => createQuickTileGrid(doc, { label: "Grid", columns: 0, tiles: [] }),
    /positive integer/
  );
  const sliderBase = {
    id: "invalid-slider",
    label: "Valor",
    numberLabel: "Valor numerico",
    value: 1,
    defaultValue: 1,
    min: 0,
    max: 2,
    step: 1,
    onInput() {},
    onCommit() {}
  };
  assert.throws(() => createSliderField(doc, { ...sliderBase, max: 0 }), /greater than min/);
  assert.throws(() => createSliderField(doc, { ...sliderBase, step: 0 }), /greater than zero/);
  assert.throws(() => createSliderField(doc, { ...sliderBase, value: 3 }), /within min and max/);
  assert.throws(() => createSliderField(doc, { ...sliderBase, value: Number.NaN }), /finite/);
  assert.throws(() => createChipGroup(doc, {
    id: "duplicate",
    label: "Presets",
    value: "a",
    items: [{ value: "a", label: "A" }, { value: "a", label: "Outra A" }],
    onChange() {}
  }), /Duplicate/);
  assert.throws(() => createChipGroup(doc, {
    id: "missing",
    label: "Presets",
    value: "x",
    items: [{ value: "a", label: "A" }],
    onChange() {}
  }), /must match/);
  assert.throws(() => createChipGroup(doc, {
    id: "disabled-chip",
    label: "Presets",
    value: "a",
    items: [{ value: "a", label: "A", disabled: true }],
    onChange() {}
  }), /disabledReason/);
  assert.throws(() => createToastRegion(doc, {
    id: "too-many",
    label: "Toasts",
    dismissLabel: "Fechar",
    maxVisible: 4
  }), /1 to 3/);
});

test("mutadores do tile e foco programatico do grid preservam os contratos", () => {
  const doc = createFakeDocument();
  let scrolled = 0;
  let scrollArgument = null;
  const tile = createQuickTile(doc, {
    id: "mutable",
    label: "Mutable",
    oneLine: "Descricao",
    advancedLabel: "Avancado",
    onQuick() {},
    onAdvanced() {},
    onPreview() {}
  });
  tile.element.scrollIntoView = (alignToTop) => {
    scrolled += 1;
    scrollArgument = alignToTop;
  };
  const grid = createQuickTileGrid(doc, { label: "Grid", columns: 1, tiles: [tile] });

  tile.setState("loading", "Aplicando");
  assert.equal(tile.primary.getAttribute("aria-busy"), "true");
  tile.setState("default");
  tile.setDisabled(true, "Sem selecao");
  assert.equal(tile.advanced.getAttribute("aria-disabled"), "true");
  tile.setDisabled(false);
  grid.focus(0);
  grid.focus(99);
  assert.equal(doc.activeElement, tile.primary);
  assert.equal(scrolled, 1);
  assert.equal(scrollArgument, false);
  assert.equal(tile.primary.keydown("Tab").defaultPrevented, false);
});

test("slider sincroniza ponteiro, range e campo numerico sem aceitar mutacao desabilitada", () => {
  const doc = createFakeDocument();
  const inputs = [];
  const commits = [];
  const slider = createSliderField(doc, {
    id: "sync-slider",
    label: "Valor",
    numberLabel: "Valor numerico",
    description: "Faixa recomendada",
    value: 2,
    defaultValue: 1,
    min: 0,
    max: 10,
    step: 0.5,
    unit: "x",
    onInput: (value) => inputs.push(value),
    onCommit: (value) => commits.push(value)
  });

  slider.range.emit("pointerdown");
  assert.equal(slider.range.getAttribute("data-dragging"), "true");
  slider.range.emit("pointerup");
  assert.equal(slider.range.getAttribute("data-dragging"), "false");
  slider.range.emit("pointercancel");

  slider.range.value = "3.5";
  slider.range.emit("input");
  slider.range.emit("change");
  assert.equal(slider.value, 3.5);
  slider.numberInput.value = "4.5";
  slider.numberInput.emit("input");
  slider.numberInput.emit("change");
  assert.equal(slider.value, 4.5);
  slider.numberInput.value = "5";
  slider.numberInput.keydown("Enter");
  assert.equal(slider.value, 5);
  slider.numberInput.value = "7";
  slider.numberInput.keydown("Escape");
  assert.equal(slider.numberInput.value, "5");

  slider.setValue(6);
  assert.throws(() => slider.setValue(11), /within min and max/);
  slider.setState("warning", "Valor fora da faixa recomendada");
  slider.setDisabled(true, "Controle indisponivel");
  slider.range.value = "9";
  slider.range.emit("input");
  slider.range.emit("change");
  slider.numberInput.value = "9";
  slider.numberInput.emit("input");
  slider.numberInput.emit("change");
  assert.equal(slider.value, 6);
  assert.equal(slider.range.value, "6");
  assert.equal(slider.numberInput.value, "6");
  assert.match(slider.range.getAttribute("aria-describedby"), /sync-slider-description/);
  slider.setDisabled(false);
  assert.ok(inputs.length >= 2);
  assert.ok(commits.length >= 2);
});

test("chip group cobre navegacao inversa, mutadores e estado vazio", () => {
  const doc = createFakeDocument();
  const outside = doc.createElement("button");
  const values = [];
  const group = createChipGroup(doc, {
    id: "mutable-chips",
    label: "Presets",
    value: "b",
    items: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" }
    ],
    onChange: (value) => values.push(value)
  });

  outside.focus();
  group.setValue("c");
  assert.equal(group.value, "c");
  assert.equal(doc.activeElement, outside, "atualizacao programatica nao rouba foco");
  group.chips[2].keydown("ArrowLeft");
  group.chips[1].keydown("Home");
  group.chips[0].keydown("End");
  group.chips[2].keydown(" ");
  assert.deepEqual(values, ["b", "a", "c", "c"]);
  group.setState("success", "Preset selecionado");
  group.setDisabled(true, "Edicao bloqueada");
  group.chips[0].click();
  assert.equal(group.value, "c");
  group.setDisabled(false);
  assert.throws(() => group.setValue("missing"), /available chip/);

  const empty = createChipGroup(doc, {
    id: "empty-chips",
    label: "Sem presets",
    value: "",
    items: [],
    state: "empty",
    stateLabel: "Nenhum preset",
    onChange() {}
  });
  assert.equal(empty.value, null);
  assert.equal(empty.element.getAttribute("data-empty"), "true");
});

test("popover aceita foco inicial, reabertura e fechamento programatico idempotente", () => {
  const doc = createFakeDocument();
  const origin = doc.createElement("button");
  const content = doc.createElement("div");
  const initial = doc.createElement("button");
  content.appendChild(initial);
  const reasons = [];
  const popover = createPopover(doc, {
    id: "stateful-popover",
    label: "Preview",
    content,
    initialFocus: initial,
    onClose: (reason) => reasons.push(reason)
  });

  origin.focus();
  popover.open();
  assert.equal(doc.activeElement, initial);
  popover.finishClose();
  assert.equal(popover.element.hidden, false);
  popover.setState("success", "Preview carregado");
  popover.close();
  popover.close();
  assert.deepEqual(reasons, ["programmatic"]);
  popover.open(origin);
  assert.equal(popover.element.getAttribute("data-closing"), undefined);
  popover.close("backdrop");
  popover.finishClose();
  assert.equal(popover.element.hidden, true);
});

test("gaveta sem foco usa o dialogo, backdrop fecha e finish remove a camada", () => {
  const doc = createFakeDocument();
  const origin = doc.createElement("button");
  const reasons = [];
  const drawer = createDrawer(doc, {
    id: "empty-drawer",
    label: "Inspector",
    content: doc.createElement("div"),
    overlay: true,
    onClose: (reason) => reasons.push(reason)
  });

  origin.focus();
  drawer.open();
  assert.equal(doc.activeElement, drawer.element);
  assert.equal(drawer.element.keydown("Tab").defaultPrevented, true);
  drawer.setState("unsupported", "Host sem suporte");
  drawer.backdrop.click();
  assert.deepEqual(reasons, ["backdrop"]);
  drawer.finishClose();
  assert.equal(drawer.element.hidden, true);
  assert.equal(drawer.backdrop.hidden, true);
});

test("toast cobre timer, Escape, dismiss por id, action persistente e clear", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const region = createToastRegion(doc, {
    id: "lifecycle-toasts",
    label: "Resultados",
    dismissLabel: "Fechar",
    scheduler: scheduler.api
  });
  const persistentAction = region.push({
    message: "Resultado",
    state: "success",
    stateLabel: "Sucesso",
    actions: [{ label: "Salvar", dismissOnPress: false, onPress() {} }]
  });
  persistentAction.actions[0].click();
  assert.equal(persistentAction.element.getAttribute("data-closing"), undefined);

  const timed = region.push({ message: "Temporario" });
  scheduler.runAll();
  assert.equal(timed.element.getAttribute("data-closing"), "true");
  timed.element.emit("animationend");
  assert.equal(region.items.includes(timed), false);

  region.dismiss("missing");
  region.dismiss(persistentAction.id);
  assert.equal(persistentAction.element.getAttribute("data-closing"), "true");
  persistentAction.element.emit("animationend");

  const escaped = region.push({ message: "Fechar por teclado" });
  assert.equal(escaped.element.keydown("Escape").defaultPrevented, true);
  escaped.element.emit("animationend");
  region.push({ message: "A" });
  region.push({ message: "B" });
  region.clear();
  assert.equal(region.items.length, 0);
  assert.equal(region.element.children.length, 0);
});

test("toast recusa assertive indevido e duracao negativa", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const region = createToastRegion(doc, {
    id: "validated-toasts",
    label: "Resultados",
    dismissLabel: "Fechar",
    scheduler: scheduler.api
  });
  assert.throws(() => region.push({
    message: "Sucesso",
    state: "success",
    stateLabel: "Sucesso",
    assertive: true
  }), /reserved for error/);
  assert.throws(() => region.push({ message: "Invalido", durationMs: -1 }), /must not be negative/);
});

test("toast finaliza pelo timeout de seguranca sem depender de animationend", () => {
  const doc = createFakeDocument();
  const scheduler = createScheduler();
  const region = createToastRegion(doc, {
    id: "fallback-toast",
    label: "Resultados",
    dismissLabel: "Fechar",
    scheduler: scheduler.api
  });
  const toast = region.push({ message: "Resultado", durationMs: 0 });

  scheduler.runAll();
  assert.equal(toast.element.getAttribute("data-closing"), "true");
  assert.equal(region.items.length, 1);
  scheduler.runAll();
  assert.equal(region.items.length, 0);
});

test("scheduler padrao encerra toast sem manter timer pendente", async () => {
  const doc = createFakeDocument();
  const region = createToastRegion(doc, {
    id: "native-timer",
    label: "Resultados",
    dismissLabel: "Fechar"
  });
  const toast = region.push({ message: "Rapido", durationMs: 0 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(toast.element.getAttribute("data-closing"), "true");
  toast.element.emit("animationend");
  assert.equal(region.items.length, 0);
});
