import { afterEach } from 'node:test';
import test from "node:test";
import assert from "node:assert/strict";
import { createAlert, createBadge, createToastRegion } from "../dist/components.js";
import { createFeedbackController } from "../dist/feedback.js";
import { createFakeDocument } from "./fake-dom.mjs";

function clock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    api: {
      now: () => time,
      setTimeout(fn, duration) {
        const id = ++nextId;
        timers.set(id, { fn, at: time + duration });
        return id;
      },
      clearTimeout(id) { timers.delete(id); }
    },
    get size() { return timers.size; },
    tick(duration) {
      const end = time + duration;
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      time = end;
    }
  };
}

const pt = {
  region: "Notificações", dismiss: "Fechar aviso", queued: (n) => `+${n} avisos — ver próximo`,
  success: "Concluído", warning: "Atenção", error: "Erro", info: "Informação"
};
const en = {
  region: "Notifications", dismiss: "Dismiss notification", queued: (n) => `+${n} notifications — view next`,
  success: "Completed", warning: "Warning", error: "Error", info: "Information"
};

function makeRegion(doc, timer, extra = {}) {
  return createToastRegion(doc, {
    id: "results", label: pt.region, dismissLabel: pt.dismiss, queuedLabel: pt.queued,
    scheduler: timer.api, ...extra
  });
}

const error = (message, extra = {}) => ({ message, state: "error", stateLabel: "Erro", recoverable: true, ...extra });

function closeButton(toast) {
  return toast.element.getElementsByTagName("button").find((button) => button.className === "ch-toast__dismiss");
}

test("sucessos aguardam na fila sem remover erros persistentes; +N permite percorrê-los", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const region = makeRegion(doc, timer);
  const failures = [1, 2, 3].map((n) => region.push(error(`Falha ${n}`)));
  const success = region.push({ message: "Preset salvo", state: "success", stateLabel: "Sucesso" });
  const otherFailure = region.push(error("Outra falha"));
  assert.deepEqual(region.items, failures);
  assert.deepEqual(region.pending, [success, otherFailure]);
  assert.equal(timer.size, 0, "um aviso na fila não perde seu tempo antes de ser exibido");
  const queue = region.element.getElementsByTagName("button").find((button) => button.className === "ch-toast-queue");
  assert.equal(queue.getAttribute("aria-label"), "+2 avisos — ver próximo");
  queue.click();
  assert.equal(region.items.length, 3);
  assert.equal(region.items.includes(success), true);
  assert.equal(region.pending.includes(failures[0]), true, "erro deslocado permanece disponível");
  assert.equal(doc.activeElement, closeButton(success));
  timer.tick(3000);
  assert.equal(success.element.getAttribute("data-closing"), "true");
  timer.tick(140);
  assert.equal(region.items.includes(otherFailure), true);
  assert.equal(region.items.length, 3);
  assert.equal(region.pending.includes(failures[0]), true);
  region.dispose();
});

test("deduplicação inclui itens aguardando e permite ocorrência nova após fechamento", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const region = makeRegion(doc, timer, { maxVisible: 1 });
  region.push(error("Falha 1"));
  const first = region.push(error("Falha 2", { dedupKey: "request-2" }));
  assert.equal(region.push(error("Falha 2", { dedupKey: "request-2" })), first);
  assert.equal(region.pending.length, 1);
  first.dismiss();
  assert.equal(region.pending.length, 0);
  const again = region.push(error("Falha 2", { dedupKey: "request-2" }));
  assert.notEqual(again, first);
  region.dispose();
});

test("hover e foco pausam tempo restante e retomam somente após ambos saírem", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const region = makeRegion(doc, timer);
  const toast = region.push({ message: "Salvo" });
  timer.tick(1000);
  toast.element.emit("pointerenter");
  toast.element.emit("focusin");
  timer.tick(9000);
  assert.equal(toast.element.getAttribute("data-closing"), undefined);
  toast.element.emit("pointerleave");
  timer.tick(3000);
  assert.equal(timer.size, 0);
  toast.element.emit("focusout", { relatedTarget: closeButton(toast) });
  assert.equal(timer.size, 0, "mover entre ações do mesmo toast mantém a pausa");
  toast.element.emit("focusout", { relatedTarget: null });
  timer.tick(1999);
  assert.equal(toast.element.getAttribute("data-closing"), undefined);
  timer.tick(1);
  assert.equal(toast.element.getAttribute("data-closing"), "true");
  timer.tick(140);
  assert.equal(region.items.length, 0);
});

test("aviso com ação permanece até resolução; pin é explícito", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const region = makeRegion(doc, timer);
  let presses = 0;
  const warning = region.push({
    message: "A seleção mudou", state: "warning", stateLabel: "Atenção",
    actions: [{ label: "Atualizar", onPress() { presses++; } }]
  });
  assert.equal(warning.element.getAttribute("data-duration"), "indefinite");
  timer.tick(60000);
  assert.equal(region.items.length, 1);
  warning.actions[0].click();
  warning.actions[0].click();
  assert.equal(presses, 1, "ação não é repetida durante saída");
  timer.tick(140);
  const pinned = region.push({ message: "Resultado para ler" });
  pinned.pin();
  timer.tick(60000);
  assert.equal(region.items.length, 1);
  assert.equal(pinned.element.getAttribute("data-duration"), "indefinite");
  region.dispose();
});

test("fechar toast só move foco se o usuário estava dentro dele", () => {
  const doc = createFakeDocument();
  const page = doc.createElement("div");
  const input = doc.createElement("input");
  page.appendChild(input);
  input.focus();
  const timer = clock();
  const region = makeRegion(doc, timer);
  page.appendChild(region.element);
  const toast = region.push(error("Erro"));
  toast.dismiss();
  assert.equal(doc.activeElement, input);
  timer.tick(140);
  const focusToast = region.push(error("Falhou de novo"));
  closeButton(focusToast).focus();
  focusToast.dismiss();
  assert.equal(doc.activeElement, input, "retorna à origem somente se o toast possuía o foco");
  region.dispose();
});

test("final da entrada não encerra a saída; clear/dispose cancelam fila e timers", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const region = makeRegion(doc, timer, { maxVisible: 1 });
  const a = region.push({ message: "A" });
  let calls = 0;
  const queued = region.push({ message: "B", actions: [{ label: "Ajustar", onPress() { calls++; } }] });
  a.dismiss();
  a.element.emit("animationend", { animationName: "motion-toast-in" });
  assert.equal(region.items[0], a);
  a.element.emit("animationend", { animationName: "motion-toast-out", target: closeButton(a) });
  assert.equal(region.items[0], a);
  region.clear();
  a.element.emit("animationend", { animationName: "motion-toast-out" });
  queued.actions[0].click();
  assert.equal(calls, 0);
  timer.tick(100000);
  assert.equal(timer.size, 0);
  assert.equal(region.element.children.length, 0);
  assert.equal(region.pending.length, 0);
  region.push({ message: "Nova" });
  region.dispose();
  region.dispose();
  timer.tick(100000);
  assert.equal(timer.size, 0);
  assert.throws(() => region.push({ message: "Tarde" }), /disposed/);
});

test("trocar idioma atualiza controles visíveis e da fila preservando mensagem real e foco", () => {
  const doc = createFakeDocument();
  const timer = clock();
  let locale = pt;
  const feedback = createFeedbackController(doc, { labels: () => locale, maxVisible: 1, scheduler: timer.api });
  const first = feedback.reportError("Seleção real inválida");
  const second = feedback.reportError("Segundo erro real");
  closeButton(first).focus();
  locale = en;
  feedback.refreshLabels();
  assert.equal(feedback.element.getAttribute("aria-label"), en.region);
  assert.equal(closeButton(first).getAttribute("aria-label"), en.dismiss);
  assert.equal(closeButton(second).getAttribute("aria-label"), en.dismiss);
  assert.equal(doc.activeElement, closeButton(first));
  assert.match(first.element.allText, /Seleção real inválida/);
  assert.match(first.element.allText, /Error/);
  assert.match(feedback.element.allText, /\+1 notifications/);
  feedback.dispose();
});

test("controller usa resultados reais, ignora contexto ocioso e não duplica erro com sucesso", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const feedback = createFeedbackController(doc, { labels: () => pt, scheduler: timer.api });
  feedback.onStatus({ message: "Conectado", state: "ok" });
  assert.equal(feedback.region.items.length, 0);
  feedback.onStatus({ message: "Aplicando", state: "busy" });
  feedback.onStatus({ message: "Curva aplicada a 4 keyframes", state: "ok" });
  assert.match(feedback.region.items[0].element.allText, /Curva aplicada a 4 keyframes/);
  feedback.onStatus({ message: "Aplicando", state: "busy" });
  const err = feedback.reportError("KEYFRAME_CONFLICT: ajuste a seleção", { key: "request-4" });
  assert.equal(feedback.reportError("KEYFRAME_CONFLICT: ajuste a seleção", { key: "request-4" }), err);
  feedback.onStatus({ message: "Conectado", state: "ok" });
  assert.equal(feedback.region.items.length, 2);
  timer.tick(3140);
  assert.deepEqual(feedback.region.items, [err]);
  feedback.onStatus({ message: "Aplicando", state: "busy" });
  feedback.onStatus({ message: "Erro genérico", state: "error" });
  assert.equal(feedback.region.items.length, 1, "falha genérica não compete com a mensagem tipada");
  feedback.dispose();
});

test("badge mantém rótulo e banner oferece ação/fechamento sem repetir callback", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const badge = createBadge(doc, { label: "Pronto", tone: "success" });
  assert.match(badge.element.allText, /✓ Pronto/);
  badge.setLabel("Atenção");
  badge.setTone("warning");
  assert.match(badge.element.allText, /! Atenção/);
  assert.throws(() => badge.setLabel(""), /label/);
  let dismissed = 0;
  let updated = 0;
  const banner = createAlert(doc, {
    title: "A seleção mudou", description: "Os ajustes foram mantidos", tone: "warning",
    dismissLabel: "Fechar aviso", onDismiss() { dismissed++; }, scheduler: timer.api,
    actions: [{ label: "Atualizar", onPress() { updated++; } }]
  });
  assert.equal(banner.element.getAttribute("role"), "status");
  assert.match(banner.element.getAttribute("aria-labelledby"), /-title$/);
  banner.setDescription("");
  assert.equal(banner.element.getElementsByTagName("div").find((n) => n.className === "ch-alert__description").getAttribute("data-hidden"), "true");
  banner.element.getElementsByTagName("button")[0].click();
  banner.element.getElementsByTagName("button")[0].click();
  banner.dismiss();
  timer.tick(140);
  assert.equal(updated, 1);
  assert.equal(dismissed, 1);
  assert.equal(banner.element.hidden, true);
  banner.dispose();
  assert.equal(timer.size, 0);
});

afterEach(() => {
  for (const name of ["HTMLElement", "customElements", "document", "window"]) delete globalThis[name];
});

test("ação anexada vale só para o próximo sucesso; falha a descarta", () => {
  const doc = createFakeDocument();
  const timer = clock();
  const feedback = createFeedbackController(doc, { labels: () => pt, scheduler: timer.api });
  let pressed = 0;
  feedback.onStatus({ message: "Aplicando", state: "busy" });
  feedback.attachToNextSuccess([{ label: "Ajustar", onPress: () => { pressed += 1; } }]);
  feedback.onStatus({ message: "Wiggle aplicado", state: "ok" });
  const toast = feedback.region.items[0];
  const adjust = toast.element.getElementsByTagName("button").find((button) => button.allText === "Ajustar");
  assert.ok(adjust, "o sucesso traz o botão Ajustar");
  adjust.emit("click");
  assert.equal(pressed, 1);

  feedback.onStatus({ message: "Aplicando", state: "busy" });
  feedback.onStatus({ message: "Outro aplicado", state: "ok" });
  const all = () => [...feedback.region.items, ...(feedback.region.pending ?? [])];
  const plain = all().find((item) => /Outro aplicado/.test(item.element.allText));
  assert.equal(plain.element.getElementsByTagName("button").some((button) => button.allText === "Ajustar"), false);

  feedback.attachToNextSuccess([{ label: "Ajustar", onPress() {} }]);
  feedback.reportError("Falhou");
  feedback.onStatus({ message: "Aplicando", state: "busy" });
  feedback.onStatus({ message: "Terceiro", state: "ok" });
  const third = all().find((item) => /Terceiro/.test(item.element.allText));
  assert.equal(third.element.getElementsByTagName("button").some((button) => button.allText === "Ajustar"), false);
});
