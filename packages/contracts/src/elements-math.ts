/* eslint-disable no-var -- Serialized verbatim into the ES3 Adobe host. */
/**
 * Valor de uma trilha no tempo `time` de uma pre-comp de `duration` segundos,
 * com Entrada e Saida de `anim` segundos. ES3 de proposito: o host serializa
 * esta funcao dentro das expressoes, e a previa do painel chama a mesma.
 * Antes do primeiro trecho vale o `from` dele; entre trechos, o `to` do anterior.
 */
export function elementTrack(time: number, duration: number, anim: number, data: number[]): number {
  var a = Math.max(0, Math.min(anim, duration / 2)), value = data.length >= 6 ? data[3]! : 0;
  for (var i = 0; i + 6 <= data.length; i += 6) {
    var w = data[i]!, origin = w === 1 ? duration - a : 0, span = w === 2 ? duration : a;
    var t0 = origin + data[i + 1]! * span, t1 = origin + data[i + 2]! * span;
    if (time < t0) break;
    var x = t1 > t0 ? Math.min(1, (time - t0) / (t1 - t0)) : 1, k = data[i + 5]!, y = x, b = x - 1;
    if (x <= 0 || x >= 1) y = x <= 0 ? 0 : 1;
    else if (k === 1) y = 1 - (1 - x) * (1 - x) * (1 - x) * (1 - x);
    else if (k === 2) y = x * x * x;
    else if (k === 3) y = x < .5 ? 4 * x * x * x : 1 - 4 * (1 - x) * (1 - x) * (1 - x);
    else if (k === 4) y = 1 + 2.70158 * b * b * b + 1.70158 * b * b;
    value = data[i + 3]! + (data[i + 4]! - data[i + 3]!) * y;
  }
  return value;
}
