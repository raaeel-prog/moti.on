/**
 * Paridade do easing entre a referencia e o host.
 *
 * `packages/keyframe-core/src/easing.ts` desenha a curva no painel;
 * `host/src/keyframe-operations.jsx` repete a conta em ES3 para assar os
 * keyframes dentro do After Effects. O que o usuario ve no editor precisa ser
 * o que o host escreve, numero por numero — este teste compara as duas numa
 * tabela com tolerancia 1e-12.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  bezierValueAt,
  easingValue,
  normalizeCurveSegments
} from "../../../packages/keyframe-core/dist/index.js";
import { loadHostModules } from "./host-harness.mjs";

const TOL = 1e-12;

async function host() {
  const scope = await loadHostModules(
    [
      "generated/motion-contracts.jsx",
      "generated/motion-descriptors.jsx",
      "src/json.jsx",
      "src/undo.jsx",
      "src/registry.jsx",
      "src/keyframe-operations.jsx"
    ],
    { PropertyType: { PROPERTY: 1 }, PropertyValueType: { OneD: 1 } }
  );
  return scope.MotionKeyframes;
}

const T_VALUES = [0, 0.001, 0.1, 0.25, 0.3333, 0.5, 0.5001, 0.7, 0.9, 0.999, 1, -0.2, 1.4];
const CURVES = [
  { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  { x1: 0, y1: 0, x2: 1, y2: 1 },
  { x1: 0.68, y1: -0.56, x2: 0.32, y2: 1.56 },
  { x1: 1, y1: 0, x2: 0, y2: 1 },
  { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }
];
const OSCILLATIONS = [
  { amp: 1, freq: 3.3, decay: 6.9, start: 0 },
  { amp: 0.5, freq: 3, decay: 1.2, start: 0 },
  { amp: 2.5, freq: 0.7, decay: 0, start: 0.4 },
  { amp: 0, freq: 8.4, decay: 30, start: 0.99 },
  { amp: 4, freq: 20, decay: 15, start: 0.2 }
];

test("bezierValueAt: host e referencia coincidem", async () => {
  const hostMath = await host();
  for (const curve of CURVES) {
    for (const t of T_VALUES) {
      assert.ok(
        Math.abs(hostMath.bezierValueAt(curve, t) - bezierValueAt(curve, t)) <= TOL,
        `curva ${JSON.stringify(curve)} em x=${t}`
      );
    }
  }
});

test("easingValue: elastic e bounce em todas as direcoes, com e sem metades bezier", async () => {
  const hostMath = await host();
  let comparacoes = 0;
  for (const mode of ["elastic", "bounce"]) {
    for (const direction of ["in", "out", "inOut"]) {
      for (const inParams of OSCILLATIONS) {
        for (const outParams of OSCILLATIONS) {
          for (const halves of [
            {},
            { inCurve: CURVES[0] },
            { outCurve: CURVES[2] },
            { inCurve: CURVES[3], outCurve: CURVES[4] },
            { inCurve: null, outCurve: null }
          ]) {
            const params = { in: inParams, out: outParams, ...halves };
            for (const t of T_VALUES) {
              const esperado = easingValue(mode, params, direction, t);
              const obtido = hostMath.easingValue(mode, params, direction, t);
              assert.ok(
                Math.abs(obtido - esperado) <= TOL,
                `${mode}/${direction} t=${t} params=${JSON.stringify(params)}: host ${obtido} vs ref ${esperado}`
              );
              comparacoes += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(comparacoes > 5000, "a tabela precisa ser grande o bastante para pegar um desvio");
});

test("normalizeCurveSegments: nos e segmentos identicos", async () => {
  const hostMath = await host();
  const pointSets = [
    [{ x: 0.5, y: 0.8, inX: 0.4, inY: 0.7, outX: 0.6, outY: 0.9 }],
    [
      { x: 0.2, y: 0.9, inX: 0.1, inY: 0.5, outX: 0.3, outY: 1.3 },
      { x: 0.5, y: 0.9, inX: 0.45, inY: 0.9, outX: 0.55, outY: 0.9 },
      { x: 0.8, y: -0.5, inX: 0.7, inY: 0.2, outX: 0.95, outY: -1 }
    ],
    []
  ];
  for (const curve of CURVES) {
    for (const points of pointSets) {
      const esperado = normalizeCurveSegments(curve, points);
      const obtido = hostMath.normalizeCurveSegments(curve, points);
      assert.equal(obtido.knots.length, esperado.knots.length);
      assert.equal(obtido.segments.length, esperado.segments.length);
      for (let i = 0; i < esperado.knots.length; i += 1) {
        assert.ok(Math.abs(obtido.knots[i].x - esperado.knots[i].x) <= TOL);
        assert.ok(Math.abs(obtido.knots[i].y - esperado.knots[i].y) <= TOL);
      }
      for (let i = 0; i < esperado.segments.length; i += 1) {
        for (const campo of ["x1", "y1", "x2", "y2"]) {
          assert.ok(
            Math.abs(obtido.segments[i][campo] - esperado.segments[i][campo]) <= TOL,
            `segmento ${i}.${campo} com ${points.length} pontos e curva ${JSON.stringify(curve)}`
          );
        }
      }
    }
  }
});
