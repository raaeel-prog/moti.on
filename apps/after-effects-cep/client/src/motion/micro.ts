import type { MotionEnv } from "./env.js";

/**
 * Micro-interações que o CSS sozinho não resolve:
 *
 * 1. Trilho preenchido dos sliders: `--ch-slider-progress` (a mesma variável que o
 *    ch-number-disclosure já usa) acompanha o valor de todo `input[type=range]`,
 *    no arraste, no teclado e quando um slider novo aparece.
 * 2. "Pop" de toggle: ao *clicar* num botão que alterna (aria-pressed/aria-checked)
 *    e ele ficar ligado, ganha `data-pop` só pela duração da animação. Redesenhar a
 *    lista nunca dispara o pop — só a ação do usuário.
 *
 * Movimento reduzido: o preenchimento continua (é informação), o pop não.
 */
const POP_MS = 360;

export function rangeProgress(input: HTMLInputElement): number {
  const min = Number(input.min || 0), max = Number(input.max || 100), value = Number(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function paint(input: HTMLInputElement): void {
  input.style.setProperty("--ch-slider-progress", `${rangeProgress(input).toFixed(2)}%`);
}

const isRange = (node: unknown): node is HTMLInputElement =>
  Boolean(node && (node as HTMLInputElement).tagName === "INPUT" && (node as HTMLInputElement).type === "range");

export function attachMicroInteractions(root: HTMLElement, env: MotionEnv): () => void {
  const doc = root.ownerDocument, view = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
  if (!doc || !view) return () => {};
  const paintAll = (scope: ParentNode): void => { for (const input of Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="range"]'))) paint(input); };

  const onInput = (event: Event): void => { if (isRange(event.target)) paint(event.target); };
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const onClick = (event: MouseEvent): void => {
    const toggle = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("button[aria-pressed], [role='menuitemradio'], [role='switch']");
    if (!toggle || env.reduced()) return;
    // O handler do botão roda antes (bubble); lê o estado já alternado no próximo frame.
    const settle = (): void => {
      if (!toggle.isConnected) return;
      const on = toggle.getAttribute("aria-pressed") === "true" || toggle.getAttribute("aria-checked") === "true";
      if (!on) return;
      toggle.removeAttribute("data-pop"); void toggle.offsetWidth; toggle.setAttribute("data-pop", "true");
      clearTimeout(timers.get(toggle));
      timers.set(toggle, setTimeout(() => { toggle.removeAttribute("data-pop"); timers.delete(toggle); }, POP_MS));
    };
    if (env.frame(settle) === null) settle();
  };

  // Sliders criados depois (abas, editores) recebem o preenchimento ao entrar no DOM.
  let pending: number | null = null;
  const mutations = view.MutationObserver ? new view.MutationObserver(() => {
    if (pending !== null) return;
    pending = env.frame(() => { pending = null; paintAll(root); });
    if (pending === null) paintAll(root);
  }) : null;

  paintAll(root);
  doc.addEventListener("input", onInput, true);
  doc.addEventListener("change", onInput, true);
  doc.addEventListener("click", onClick);
  mutations?.observe(root, { childList: true, subtree: true });
  return () => {
    doc.removeEventListener("input", onInput, true);
    doc.removeEventListener("change", onInput, true);
    doc.removeEventListener("click", onClick);
    mutations?.disconnect();
    if (pending !== null) env.cancelFrame(pending);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
