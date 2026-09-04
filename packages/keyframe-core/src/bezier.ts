import type { CubicBezierCurve, TemporalEasePoint } from "./types.js";

/**
 * Converte uma curva cúbica Bézier padronizada (0..1 no eixo X)
 * para os valores de velocidade e influência do After Effects.
 * 
 * @param curve A curva Bézier com x1, y1, x2, y2.
 * @param durationSeconds Duração do segmento entre os dois keyframes.
 * @param valueDifference Diferença de valor entre o keyframe final e o inicial (key2.value - key1.value).
 * @returns Um objeto contendo o easing de saída (out) do primeiro keyframe e o de entrada (in) do segundo.
 */
export function curveToTemporalEase(
  curve: CubicBezierCurve,
  durationSeconds: number,
  valueDifference: number
): { outPoint: TemporalEasePoint; inPoint: TemporalEasePoint } {
  for (const [nome, valor] of [
    ["x1", curve.x1],
    ["y1", curve.y1],
    ["x2", curve.x2],
    ["y2", curve.y2],
    ["durationSeconds", durationSeconds],
    ["valueDifference", valueDifference]
  ] as const) {
    if (!Number.isFinite(valor)) {
      throw new Error(`Curva de ease invalida: ${nome} precisa ser numero finito (recebido: ${valor})`);
    }
  }
  if (durationSeconds <= 0) {
    throw new Error(`A duração do segmento não pode ser <= 0 (recebido: ${durationSeconds})`);
  }

  // Influence is expressed as a percentage (0.1 to 100)
  const outInfluence = Math.max(0.1, Math.min(curve.x1 * 100, 100));
  const inInfluence = Math.max(0.1, Math.min((1 - curve.x2) * 100, 100));

  let outSpeed = 0;
  let inSpeed = 0;

  if (valueDifference !== 0) {
    // Handle vertical (x1 = 0, ou x2 = 1) pede velocidade maxima, nao zero.
    // Devolver zero ali transformava a arrancada numa pausa em silencio. A
    // influencia ja esta limitada ao piso de 0,1% do After Effects; usa-la como
    // denominador mantem velocidade e influencia descrevendo a mesma curva.
    const outSlope = curve.y1 / (outInfluence / 100);
    const inSlope = (1 - curve.y2) / (inInfluence / 100);

    const unitSpeed = valueDifference / durationSeconds;
    outSpeed = outSlope * unitSpeed;
    inSpeed = inSlope * unitSpeed;
  }

  return {
    outPoint: { speed: outSpeed, influence: outInfluence },
    inPoint: { speed: inSpeed, influence: inInfluence },
  };
}

/**
 * Aplica a curva Bézier sobre um conjunto de dimensões.
 * @param curve A curva Bézier.
 * @param durationSeconds Duração do segmento (key2.time - key1.time).
 * @param valueDifferences Array com a diferença de valor para cada dimensão.
 * @returns Tupla com os pontos de ease de saída (key1) e entrada (key2).
 */
export function applyCurveToDimensions(
  curve: CubicBezierCurve,
  durationSeconds: number,
  valueDifferences: readonly number[]
): { outEase: readonly TemporalEasePoint[]; inEase: readonly TemporalEasePoint[] } {
  const outEase: TemporalEasePoint[] = [];
  const inEase: TemporalEasePoint[] = [];

  for (const dv of valueDifferences) {
    const { outPoint, inPoint } = curveToTemporalEase(curve, durationSeconds, dv);
    outEase.push(outPoint);
    inEase.push(inPoint);
  }

  return { outEase, inEase };
}
