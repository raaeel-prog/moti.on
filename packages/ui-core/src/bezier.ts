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
 * 3. **Nenhum listener no `document`.** A versão anterior registrava
 *    `mousemove`/`mouseup` no documento e tentava removê-los com um
 *    `MutationObserver` que só via remoção direta do container — quando a view
 *    era remontada trocando um ancestral, os listeners e o próprio observer
 *    ficavam para trás, a cada redesenho. Aqui o arrasto usa captura de ponteiro
 *    no próprio elemento, que o navegador libera sozinho.
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
  onChange: (x1: number, y1: number, x2: number, y2: number) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Lado útil do gráfico, em unidades do viewBox. */
const LADO = 200;
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
  const lado = LADO + FOLGA * 2;
  svg.setAttribute("viewBox", `0 0 ${lado} ${lado}`);
  svg.setAttribute("class", "ch-bezier__grafico");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", options.label);

  const moldura = doc.createElementNS(SVG_NS, "rect");
  moldura.setAttribute("x", String(FOLGA));
  moldura.setAttribute("y", String(FOLGA));
  moldura.setAttribute("width", String(LADO));
  moldura.setAttribute("height", String(LADO));
  moldura.setAttribute("class", "ch-bezier__moldura");
  svg.appendChild(moldura);

  const haste1 = doc.createElementNS(SVG_NS, "line");
  haste1.setAttribute("class", "ch-bezier__haste");
  const haste2 = doc.createElementNS(SVG_NS, "line");
  haste2.setAttribute("class", "ch-bezier__haste");

  const curva = doc.createElementNS(SVG_NS, "path");
  curva.setAttribute("class", "ch-bezier__curva");

  svg.appendChild(haste1);
  svg.appendChild(haste2);
  svg.appendChild(curva);

  let x1 = limitar(options.x1, 0, 1);
  let y1 = limitar(options.y1, Y_MIN, Y_MAX);
  let x2 = limitar(options.x2, 0, 1);
  let y2 = limitar(options.y2, Y_MIN, Y_MAX);

  const alca1 = criarAlca(1, options.outHandleLabel);
  const alca2 = criarAlca(2, options.inHandleLabel);
  svg.appendChild(alca1);
  svg.appendChild(alca2);

  function paraTela(valor: number): number {
    return FOLGA + valor * LADO;
  }

  function criarAlca(indice: 1 | 2, rotulo: string): SVGElement {
    const alca = doc.createElementNS(SVG_NS, "circle");
    alca.setAttribute("r", "7");
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
    }
    return alca;
  }

  function redesenhar(): void {
    const inicioX = FOLGA;
    const inicioY = FOLGA + LADO;
    const fimX = FOLGA + LADO;
    const fimY = FOLGA;

    const a1x = paraTela(x1);
    const a1y = paraTela(1 - y1);
    const a2x = paraTela(x2);
    const a2y = paraTela(1 - y2);

    curva.setAttribute("d", `M ${inicioX},${inicioY} C ${a1x},${a1y} ${a2x},${a2y} ${fimX},${fimY}`);

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
    redesenhar();
    options.onChange(x1, y1, x2, y2);
  }

  function aoTeclado(evento: KeyboardEvent, indice: 1 | 2): void {
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

  let arrastando: 1 | 2 | null = null;

  function aoApontar(evento: PointerEvent, indice: 1 | 2): void {
    arrastando = indice;
    const alvo = evento.target as unknown as { setPointerCapture?: (id: number) => void };
    // Captura de ponteiro em vez de listener no documento: o arrasto continua
    // fora do SVG e o navegador libera a captura sozinho no pointerup, sem
    // deixar listener pendurado quando a view e remontada.
    if (typeof alvo?.setPointerCapture === "function") alvo.setPointerCapture(evento.pointerId);
    evento.preventDefault();
  }

  function aoMover(evento: PointerEvent, indice: 1 | 2): void {
    if (arrastando !== indice) return;
    const caixa = svg.getBoundingClientRect();
    if (!caixa || caixa.width === 0 || caixa.height === 0) return;

    // O SVG escala com o painel (280 a 720 px), entao a conversao passa pela
    // largura medida, e nao pelas unidades do viewBox.
    const unidadeX = caixa.width / (LADO + FOLGA * 2);
    const unidadeY = caixa.height / (LADO + FOLGA * 2);
    const x = (evento.clientX - caixa.left) / unidadeX - FOLGA;
    const y = (evento.clientY - caixa.top) / unidadeY - FOLGA;

    mover(indice, x / LADO, 1 - y / LADO);
  }

  function aoSoltar(evento: PointerEvent): void {
    arrastando = null;
    const alvo = evento.target as unknown as { releasePointerCapture?: (id: number) => void };
    if (typeof alvo?.releasePointerCapture === "function") alvo.releasePointerCapture(evento.pointerId);
  }

  redesenhar();
  container.appendChild(svg);
  return container;
}
