import type { MotionEnv } from "./env.js";

/**
 * Reflow glide: quando o painel ou um divisor muda de largura, itens que *saltam*
 * de lugar (mudam de coluna/linha, ou um botão pula para outra posição num
 * breakpoint) deslizam da posição antiga para a nova, em vez de teleportar.
 *
 * Diferente de `flip()`, a mudança aqui não passa por um callback nosso: quem
 * reorganiza é o layout do navegador. Por isso medimos com offsetLeft/offsetTop
 * (posição de layout, que ignora o transform de uma animação em curso) e
 * comparamos com a última medida a cada ResizeObserver.
 *
 * Deslocamentos pequenos (o item só acompanha a largura que cresce aos poucos)
 * não animam; só saltos acima de `threshold`. Itens fora da área visível do
 * `viewport` só são medidos. Reduzir movimento: só mede, nunca anima.
 */
export interface ReflowGlideOptions {
  /** Itens a acompanhar; consultado de novo a cada medida (listas redesenham). */
  nodes(): readonly HTMLElement[];
  /** Área visível usada para descartar itens fora da tela (padrão: o contêiner). */
  viewport?: HTMLElement;
  /** Salto mínimo, em px, para animar. */
  threshold?: number;
  duration?: number;
  /** No máximo quantos itens animam por mudança (custo previsível em listas longas). */
  cap?: number;
}

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

type Point = { x: number; y: number };

/**
 * Posição de layout do item *relativa ao contêiner*: soma os offsets subindo a
 * cadeia de offsetParent até o contêiner (ou até o offsetParent dele, e então
 * desconta o contêiner). Offsets ignoram transforms, então uma animação em curso
 * — do próprio item ou de um grupo pai que também desliza — não contamina a
 * medida, e grupos aninhados não andam em dobro.
 */
function layoutPoint(node: HTMLElement, container: HTMLElement): Point {
  let x = 0, y = 0, current: HTMLElement | null = node;
  const stop = container.offsetParent as HTMLElement | null;
  while (current && current !== container && current !== stop) {
    x += current.offsetLeft; y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  if (current === stop && stop !== container) { x -= container.offsetLeft ?? 0; y -= container.offsetTop ?? 0; }
  return { x, y };
}

export function attachReflowGlide(env: MotionEnv, container: HTMLElement, options: ReflowGlideOptions): () => void {
  const view = container.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
  const Observer = view?.ResizeObserver;
  if (!Observer) return () => {};
  const threshold = options.threshold ?? 16, duration = options.duration ?? 200, cap = options.cap ?? 48;
  const last = new WeakMap<HTMLElement, Point>();
  const running = new WeakMap<HTMLElement, Animation>();

  const visible = (node: HTMLElement, area: DOMRect | undefined): boolean => {
    if (!area || typeof node.getBoundingClientRect !== "function") return true;
    const box = node.getBoundingClientRect();
    return box.bottom >= area.top && box.top <= area.bottom && box.right >= area.left && box.left <= area.right;
  };

  const measure = (animate: boolean): void => {
    const nodes = options.nodes();
    const area = (options.viewport ?? container).getBoundingClientRect?.();
    let budget = animate && !env.reduced() ? cap : 0;
    for (const node of nodes) {
      const now = layoutPoint(node, container), before = last.get(node);
      last.set(node, now);
      if (!before || budget <= 0 || typeof node.animate !== "function") continue;
      const dx = before.x - now.x, dy = before.y - now.y;
      if (Math.hypot(dx, dy) < threshold || !visible(node, area)) continue;
      // Continua de onde a animação anterior estava, sem pulo visual.
      running.get(node)?.cancel();
      const animation = node.animate(
        [{ transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px)` }, { transform: "translate(0, 0)" }],
        { duration, easing: EASE }
      );
      running.set(node, animation);
      budget--;
    }
  };

  // Medida inicial sem animar; depois, cada mudança de tamanho compara com a anterior.
  measure(false);
  let first = true;
  const observer = new Observer(() => {
    if (first) { first = false; measure(false); return; }
    measure(true);
  });
  observer.observe(container);
  return () => observer.disconnect();
}

/**
 * Liga o reflow glide em todo contêiner de `selectors` que aparecer sob `root`
 * (as abas redesenham as views): um MutationObserver agrupa as mudanças num
 * frame, liga os contêineres novos e desliga os que saíram do documento.
 * Os itens de cada contêiner são os filhos visíveis.
 */
export function attachReflowGlideTree(env: MotionEnv, root: HTMLElement, selectors: readonly string[], options: Omit<ReflowGlideOptions, "nodes" | "viewport"> = {}): () => void {
  const view = root.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
  if (!view?.MutationObserver || !view.ResizeObserver) return () => {};
  const attached = new Map<HTMLElement, () => void>();
  const selector = selectors.join(",");
  const children = (container: HTMLElement) => (): HTMLElement[] =>
    Array.from(container.children).filter(child => (child as HTMLElement).offsetParent !== null) as HTMLElement[];
  let pending: number | null = null;
  const sync = (): void => {
    pending = null;
    for (const [container, stop] of attached) if (!container.isConnected) { stop(); attached.delete(container); }
    for (const container of Array.from(root.querySelectorAll<HTMLElement>(selector)))
      if (!attached.has(container)) attached.set(container, attachReflowGlide(env, container, { ...options, nodes: children(container) }));
  };
  const schedule = (): void => {
    if (pending !== null) return;
    pending = env.frame(sync);
    if (pending === null) sync();
  };
  sync();
  const mutations = new view.MutationObserver(schedule);
  mutations.observe(root, { childList: true, subtree: true });
  return () => {
    mutations.disconnect();
    if (pending !== null) env.cancelFrame(pending);
    for (const stop of attached.values()) stop();
    attached.clear();
  };
}
