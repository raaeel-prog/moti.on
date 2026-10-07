/**
 * Editor de curva Bézier cúbica (CHMS-018).
 *
 * Três decisões que valem registro, porque a versão anterior errava nas três:
 *
 * 1. **Cor e espaçamento saem dos tokens**, não de literais. O `#0078D7` da
 *    versão anterior é o azul de sistema do Windows: dentro de um painel Adobe
 *    ele lê como elemento estranho, e não acompanha o tema.
 * 2. **A curva é operável pelo teclado.** Uma alça que só responde ao mouse
 *    exclui quem navega por teclado e falha o critério de acessibilidade do
 *    CHMS-018. Cada alça é uma parada de Tab, com `role="slider"` e
 *    `aria-valuetext` dizendo onde ela está.
 * 3. **Listeners de mouse somente durante o arrasto.** A versão anterior registrava
 *    `mousemove`/`mouseup` no documento e tentava removê-los com um
 *    `MutationObserver` que só via remoção direta do container — quando a view
 *    era remontada trocando um ancestral, os listeners e o próprio observer
 *    ficavam para trás. Pointer capture é preferido; o fallback CEP registra
 *    mousemove/mouseup somente durante o gesto e os remove no fim/dispose.
 */

export interface BezierEditorOptions {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Nome do gráfico para leitores de tela. */
  label: string;
  /** Nome da alça de saída do primeiro keyframe. */
  outHandleLabel: string;
  /** Nome da alça de entrada do segundo keyframe. */
  inHandleLabel: string;
  onDisposeReady?: (dispose: () => void) => void;
  onReady?: (setCurve: (x1: number, y1: number, x2: number, y2: number) => void) => void;
  /** Optional in-plot motion demonstration. Never changes the curve or the host. */
  preview?: { progress(time: number): number; label: string; durationMs?: number };
  onPreviewReady?: (play: () => void, cancel: () => void) => void;
  onChange: (x1: number, y1: number, x2: number, y2: number) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Landscape plot keeps the curve readable in a narrow dock without a tall card. */
const LARGURA = 280;
const ALTURA = 144;
/** Folga para a alça poder sair do quadrado 0..1 sem ser cortada. */
const FOLGA = 24;

/** Passo fino e passo grosso do teclado, em unidades normalizadas. */
const PASSO_FINO = 0.01;
const PASSO_GROSSO = 0.1;

/**
 * O eixo Y aceita ultrapassagem porque overshoot é curva legítima; o X não,
 * porque o After Effects não representa alça temporal fora do segmento.
 */
const Y_MIN = -1;
const Y_MAX = 2;

function limitar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  if (valor < minimo) return minimo;
  if (valor > maximo) return maximo;
  return valor;
}

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

export function bezierEditor(doc: Document, options: BezierEditorOptions): HTMLElement {
  const container = doc.createElement("div");
  container.className = "ch-bezier";

  // Sem createElementNS não há SVG — o mesmo fallback que o shell usa para os
  // ícones. O editor não é a única forma de definir a curva: os campos numéricos
  // continuam valendo, então some o gráfico, não a função.
  if (typeof doc.createElementNS !== "function") {
    return container;
  }

  const svg = doc.createElementNS(SVG_NS, "svg");
  const largura = LARGURA + FOLGA * 2;
  const altura = ALTURA + FOLGA * 2;
  svg.setAttribute("viewBox", `0 0 ${largura} ${altura}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("class", "ch-bezier__grafico");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", options.label);

  const moldura = doc.createElementNS(SVG_NS, "rect");
  moldura.setAttribute("x", String(FOLGA));
  moldura.setAttribute("y", String(FOLGA));
  moldura.setAttribute("width", String(LARGURA));
  moldura.setAttribute("height", String(ALTURA));
  moldura.setAttribute("class", "ch-bezier__moldura");
  svg.appendChild(moldura);
  for (const fraction of [0.25, 0.5, 0.75]) {
    for (const vertical of [true, false]) {
      const line = doc.createElementNS(SVG_NS, "line");
      line.setAttribute("class", "ch-bezier__grid");
      line.setAttribute("x1", String(FOLGA + (vertical ? fraction * LARGURA : 0)));
      line.setAttribute("x2", String(FOLGA + (vertical ? fraction * LARGURA : LARGURA)));
      line.setAttribute("y1", String(FOLGA + (vertical ? 0 : fraction * ALTURA)));
      line.setAttribute("y2", String(FOLGA + (vertical ? ALTURA : fraction * ALTURA)));
      svg.appendChild(line);
    }
  }

  const haste1 = doc.createElementNS(SVG_NS, "line");
  haste1.setAttribute("class", "ch-bezier__haste");
  const haste2 = doc.createElementNS(SVG_NS, "line");
  haste2.setAttribute("class", "ch-bezier__haste");

  const curva = doc.createElementNS(SVG_NS, "path");
  curva.setAttribute("class", "ch-bezier__curva");

  const reference = doc.createElementNS(SVG_NS, "line");
  reference.setAttribute("class", "ch-bezier__reference");
  reference.setAttribute("aria-hidden", "true");
  svg.appendChild(reference);

  svg.appendChild(haste1);
  svg.appendChild(haste2);
  svg.appendChild(curva);

  const endpoints = [0, 1].map(() => {
    const endpoint = doc.createElementNS(SVG_NS, "path");
    endpoint.setAttribute("class", "ch-bezier__endpoint");
    endpoint.setAttribute("aria-hidden", "true");
    svg.appendChild(endpoint);
    return endpoint;
  });

  let yLow = 0, yHigh = 1;
  let gesturePointer: number | null = null;
  let arrastando: 1 | 2 | null = null;
  let removeMouseListeners: (() => void) | null = null;

  let x1 = limitar(options.x1, 0, 1);
  let y1 = limitar(options.y1, Y_MIN, Y_MAX);
  let x2 = limitar(options.x2, 0, 1);
  let y2 = limitar(options.y2, Y_MIN, Y_MAX);
  let previewFrame = 0;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const win = doc.defaultView;
  const previewDot = options.preview ? doc.createElementNS(SVG_NS, "circle") : null;
  if (previewDot) {
    previewDot.setAttribute("class", "ch-bezier__preview-dot");
    previewDot.setAttribute("r", "5");
    previewDot.setAttribute("aria-hidden", "true");
    previewDot.setAttribute("cy", String(FOLGA + ALTURA / 2));
    previewDot.setAttribute("cx", String(FOLGA));
    container.setAttribute("data-motion", "curve-preview");
  }
  function reduced(): boolean {
    return doc.documentElement.getAttribute("data-reduced-motion") === "true" || Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }
  function cancelPreview(): void {
    clearTimeout(previewTimer); previewTimer = undefined;
    if (previewFrame) win?.cancelAnimationFrame?.(previewFrame);
    previewFrame = 0;
    container.removeAttribute("data-preview");
  }
  function playPreview(): void {
    cancelPreview();
    if (!options.preview || !previewDot || !win?.requestAnimationFrame || disposed || reduced() || doc.hidden || arrastando !== null) return;
    container.setAttribute("data-preview", "playing");
    const paint = (time: number): void => {
      const value = options.preview!.progress(time);
      const low = Math.min(0, y1, y2), high = Math.max(1, y1, y2);
      previewDot.setAttribute("cx", String(FOLGA + (value - low) / (high - low) * LARGURA));
    };
    paint(0);
    let start: number | undefined;
    const tick = (now: number): void => {
      if (disposed || doc.hidden || reduced() || arrastando !== null) { cancelPreview(); return; }
      start ??= now;
      const time = Math.min(1, (now - start) / (options.preview?.durationMs ?? 1100));
      paint(time);
      if (time < 1) previewFrame = win.requestAnimationFrame(tick);
      else { previewFrame = 0; previewTimer = setTimeout(cancelPreview, 140); }
    };
    previewFrame = win.requestAnimationFrame(tick);
  }
  function schedulePreview(): void {
    cancelPreview();
    if (options.preview && arrastando === null && !disposed && !reduced()) previewTimer = setTimeout(playPreview, 350);
  }

  const alca1 = criarAlca(1, options.outHandleLabel);
  const alca2 = criarAlca(2, options.inHandleLabel);
  svg.appendChild(alca1);
  svg.appendChild(alca2);
  if (previewDot) svg.appendChild(previewDot);
  options.onPreviewReady?.(playPreview, cancelPreview);
  // A new gesture always takes priority over the demonstration.
  svg.addEventListener("mouseenter", () => { if (container.getAttribute("data-preview")) cancelPreview(); });
  svg.addEventListener("mousedown", () => { if (container.getAttribute("data-preview")) cancelPreview(); });
  svg.addEventListener("pointerdown", () => { if (container.getAttribute("data-preview")) cancelPreview(); });
  svg.addEventListener("focusin", cancelPreview);

  function paraTela(valor: number): number {
    return FOLGA + valor * LARGURA;
  }

  function screenY(value: number): number { return FOLGA + (yHigh - value) / (yHigh - yLow) * ALTURA; }
  function fit(): void { yLow = Math.min(0, y1, y2); yHigh = Math.max(1, y1, y2); }

  function criarAlca(indice: 1 | 2, rotulo: string): SVGElement {
    const alca = doc.createElementNS(SVG_NS, "circle");
    alca.setAttribute("r", "4");
    alca.setAttribute("class", "ch-bezier__alca");
    // `slider` é o papel mais próximo de uma alça arrastável. Como ela tem dois
    // eixos, o valor lido é o texto de `aria-valuetext`, e não um número só.
    alca.setAttribute("role", "slider");
    alca.setAttribute("aria-label", rotulo);
    alca.setAttribute("tabindex", "0");
    alca.addEventListener("keydown", (evento) => aoTeclado(evento as KeyboardEvent, indice));
    if (typeof (alca as unknown as { addEventListener?: unknown }).addEventListener === "function") {
      alca.addEventListener("pointerdown", (evento) => aoApontar(evento as PointerEvent, indice));
      alca.addEventListener("pointermove", (evento) => aoMover(evento as PointerEvent, indice));
      alca.addEventListener("pointerup", (evento) => aoSoltar(evento as PointerEvent));
      alca.addEventListener("pointercancel", (evento) => aoSoltar(evento as PointerEvent));
      alca.addEventListener("lostpointercapture", endGesture);
      // Some CEP configurations expose PointerEvent without delivering it.
      // Mouse fallback is ignored when a real pointer gesture already owns it.
      alca.addEventListener("mousedown", e => mouseStart(e as MouseEvent, indice));
    }
    return alca;
  }

  function redesenhar(): void {
    const inicioX = FOLGA;
    const inicioY = screenY(0);
    const fimX = FOLGA + LARGURA;
    const fimY = screenY(1);

    const a1x = paraTela(x1);
    const a1y = screenY(y1);
    const a2x = paraTela(x2);
    const a2y = screenY(y2);

    curva.setAttribute("d", `M ${inicioX},${inicioY} C ${a1x},${a1y} ${a2x},${a2y} ${fimX},${fimY}`);
    reference.setAttribute("x1", String(inicioX));
    reference.setAttribute("y1", String(inicioY));
    reference.setAttribute("x2", String(fimX));
    reference.setAttribute("y2", String(fimY));
    endpoints.forEach((endpoint, index) => {
      const x = index ? fimX : inicioX, y = index ? fimY : inicioY;
      endpoint.setAttribute("d", `M${x} ${y - 3} L${x + 3} ${y} L${x} ${y + 3} L${x - 3} ${y} Z`);
    });

    haste1.setAttribute("x1", String(inicioX));
    haste1.setAttribute("y1", String(inicioY));
    haste1.setAttribute("x2", String(a1x));
    haste1.setAttribute("y2", String(a1y));

    haste2.setAttribute("x1", String(fimX));
    haste2.setAttribute("y1", String(fimY));
    haste2.setAttribute("x2", String(a2x));
    haste2.setAttribute("y2", String(a2y));

    alca1.setAttribute("cx", String(a1x));
    alca1.setAttribute("cy", String(a1y));
    alca1.setAttribute("aria-valuetext", `${arredondar(x1)}, ${arredondar(y1)}`);

    alca2.setAttribute("cx", String(a2x));
    alca2.setAttribute("cy", String(a2y));
    alca2.setAttribute("aria-valuetext", `${arredondar(x2)}, ${arredondar(y2)}`);
  }

  function mover(indice: 1 | 2, novoX: number, novoY: number): void {
    if (indice === 1) {
      x1 = arredondar(limitar(novoX, 0, 1));
      y1 = arredondar(limitar(novoY, Y_MIN, Y_MAX));
    } else {
      x2 = arredondar(limitar(novoX, 0, 1));
      y2 = arredondar(limitar(novoY, Y_MIN, Y_MAX));
    }
    if (arrastando === null) fit();
    redesenhar();
    options.onChange(x1, y1, x2, y2);
    if (arrastando === null) schedulePreview();
  }

  function aoTeclado(evento: KeyboardEvent, indice: 1 | 2): void {
    cancelPreview();
    const passo = evento.shiftKey ? PASSO_GROSSO : PASSO_FINO;
    const atualX = indice === 1 ? x1 : x2;
    const atualY = indice === 1 ? y1 : y2;

    switch (evento.key) {
      case "ArrowLeft":
        mover(indice, atualX - passo, atualY);
        break;
      case "ArrowRight":
        mover(indice, atualX + passo, atualY);
        break;
      case "ArrowUp":
        mover(indice, atualX, atualY + passo);
        break;
      case "ArrowDown":
        mover(indice, atualX, atualY - passo);
        break;
      case "Home":
        mover(indice, 0, atualY);
        break;
      case "End":
        mover(indice, 1, atualY);
        break;
      default:
        return;
    }
    evento.preventDefault();
  }


  function aoApontar(evento: PointerEvent, indice: 1 | 2): void {
    if (evento.button !== 0 || arrastando !== null) return;
    cancelPreview();
    arrastando = indice; gesturePointer = evento.pointerId;
    container.setAttribute("data-dragging", "true");
    const alvo = evento.currentTarget as Element;
    try { alvo.setPointerCapture?.(evento.pointerId); } catch { /* mouse fallback below */ }
    // Keeping this bounded fallback also covers CEP capture failures.
    attachMouseListeners();
    evento.preventDefault();
  }

  function point(evento: MouseEvent): { x: number; y: number } | null {
    // getScreenCTM includes panel zoom, SVG transforms and preserveAspectRatio.
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const source = svg.createSVGPoint(); source.x = evento.clientX; source.y = evento.clientY;
        const local = source.matrixTransform(matrix.inverse());
        return { x: (local.x - FOLGA) / LARGURA, y: yHigh - (local.y - FOLGA) / ALTURA * (yHigh - yLow) };
      }
    }
    const caixa = svg.getBoundingClientRect();
    if (!caixa || caixa.width <= 0 || caixa.height <= 0) return null;
    const scale = Math.min(caixa.width / largura, caixa.height / altura);
    const left = caixa.left + (caixa.width - largura * scale) / 2;
    const top = caixa.top + (caixa.height - altura * scale) / 2;
    return { x: ((evento.clientX - left) / scale - FOLGA) / LARGURA,
      y: yHigh - ((evento.clientY - top) / scale - FOLGA) / ALTURA * (yHigh - yLow) };
  }
  function moveEvent(evento: MouseEvent): void {
    if (arrastando === null) return;
    const value = point(evento);
    if (value) mover(arrastando, value.x, value.y);
  }
  function aoMover(evento: PointerEvent, indice: 1 | 2): void {
    if (arrastando !== indice || gesturePointer !== evento.pointerId) return;
    moveEvent(evento);
  }
  function endGesture(): void {
    const wasDragging = arrastando !== null;
    arrastando = null; gesturePointer = null;
    removeMouseListeners?.(); removeMouseListeners = null;
    container.removeAttribute("data-dragging"); fit(); redesenhar();
    if (wasDragging) schedulePreview();
  }
  function attachMouseListeners(): void {
    if (removeMouseListeners || typeof doc.addEventListener !== "function") return;
    const onMove = (e: MouseEvent): void => {
      if (!container.isConnected) { endGesture(); return; }
      moveEvent(e);
    };
    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mouseup", endGesture);
    doc.defaultView?.addEventListener("blur", endGesture);
    removeMouseListeners = () => {
      doc.removeEventListener("mousemove", onMove); doc.removeEventListener("mouseup", endGesture);
      doc.defaultView?.removeEventListener("blur", endGesture);
    };
  }
  function mouseStart(evento: MouseEvent, indice: 1 | 2): void {
    if (evento.button !== 0 || arrastando !== null) return;
    cancelPreview();
    arrastando = indice; container.setAttribute("data-dragging", "true");
    attachMouseListeners(); evento.preventDefault();
  }
  function aoSoltar(evento: PointerEvent): void {
    if (gesturePointer !== evento.pointerId) return;
    endGesture();
    const alvo = evento.currentTarget as Element;
    try { if (alvo.hasPointerCapture?.(evento.pointerId)) alvo.releasePointerCapture(evento.pointerId); } catch { /* already released */ }
  }
  // The curve itself and its stems are grab targets, as requested in the video.
  // Choose the nearest control; clicking empty graph space never changes it.
  function nearest(evento: MouseEvent): 1 | 2 {
    const p = point(evento);
    if (!p) return 1;
    return Math.hypot(p.x - x1, p.y - y1) <= Math.hypot(p.x - x2, p.y - y2) ? 1 : 2;
  }
  for (const target of [curva, haste1, haste2]) {
    target.addEventListener("mousedown", e => mouseStart(e as MouseEvent, nearest(e as MouseEvent)));
    target.addEventListener("pointerdown", e => aoApontar(e as PointerEvent, nearest(e as PointerEvent)));
    target.addEventListener("pointermove", e => { if (arrastando !== null) aoMover(e as PointerEvent, arrastando); });
    target.addEventListener("pointerup", e => aoSoltar(e as PointerEvent));
    target.addEventListener("pointercancel", e => aoSoltar(e as PointerEvent));
    target.addEventListener("lostpointercapture", endGesture);
  }
  options.onDisposeReady?.(() => { disposed = true; endGesture(); cancelPreview(); });

  options.onReady?.((a, b, c, d) => {
    x1 = limitar(a, 0, 1); y1 = limitar(b, Y_MIN, Y_MAX);
    x2 = limitar(c, 0, 1); y2 = limitar(d, Y_MIN, Y_MAX);
    fit(); redesenhar();
    schedulePreview();
  });
  fit(); redesenhar();
  container.appendChild(svg);
  return container;
}
