/**
 * Decomposição de Euler — a peça que faltava em `MotionTransform`.
 *
 * A propriedade que interessa não é "os ângulos batem com os que eu escrevi":
 * ângulos diferentes podem descrever a mesma rotação, e exigir igualdade
 * numérica testaria uma convenção em vez do comportamento. O que precisa valer
 * é o **round-trip da matriz**: decompor e recompor tem de devolver a mesma
 * rotação, e é isso que os comandos consomem.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

async function transform() {
  const scope = await loadHostModules(["src/transform-math.jsx"], {});
  return scope.MotionTransform;
}

/** Maior diferença entre duas matrizes 3x3, entrada a entrada. */
function maiorDiferenca(a, b) {
  let pior = 0;
  for (let i = 0; i < 9; i += 1) pior = Math.max(pior, Math.abs(a[i] - b[i]));
  return pior;
}

/** Ângulos que cobrem quadrantes, sinais e os dois polos de gimbal lock. */
const CASOS = [
  [0, 0, 0],
  [30, 0, 0],
  [0, 45, 0],
  [0, 0, 60],
  [30, 45, 60],
  [-30, -45, -60],
  [120, 30, -170],
  [-179, 12, 179],
  [15, 89.9, -33],
  [15, -89.9, -33],
  [0.0001, 0.0001, 0.0001],
  [45, 90, 0],
  [45, -90, 0]
];

for (const angulos of CASOS) {
  test(`decompor e recompor devolve a mesma rotacao: [${angulos.join(", ")}]`, async () => {
    const T = await transform();
    const original = T.matrixFromEuler(angulos);
    const decomposto = T.eulerFromMatrix(original);
    const recomposto = T.matrixFromEuler(decomposto);

    const erro = maiorDiferenca(original, recomposto);
    assert.ok(erro < 1e-9, `erro de ${erro} ao recompor [${angulos.join(", ")}] via [${decomposto.join(", ")}]`);
  });
}

test("no gimbal lock a convencao e fixar X em zero, e nao devolver NaN", async () => {
  const T = await transform();

  for (const b of [90, -90]) {
    const m = T.matrixFromEuler([40, b, 25]);
    const [rx, ry, rz] = T.eulerFromMatrix(m);

    assert.ok(Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz), "nenhum componente pode ser NaN");
    // Com cos(b) em zero só sobra a soma dos outros dois: a convenção joga tudo
    // em Z para o resultado ficar contínuo e reproduzível.
    assert.equal(rx, 0, "X vai a zero no polo");
    assert.ok(Math.abs(Math.abs(ry) - 90) < 1e-9, `Y deveria ser ±90, veio ${ry}`);
    assert.ok(maiorDiferenca(m, T.matrixFromEuler([rx, ry, rz])) < 1e-9, "e a rotacao continua a mesma");
  }
});

test("entrada fora de [-1, 1] por arredondamento nao vira NaN", async () => {
  const T = await transform();

  // Uma cadeia longa de multiplicações pode empurrar o seno para além de 1 por
  // erro de máquina; `asin` devolveria NaN e a camada sumiria.
  const quaseUm = T.matrixFromEuler([0, 90, 0]);
  quaseUm[2] = 1 + 1e-12;
  const [rx, ry, rz] = T.eulerFromMatrix(quaseUm);

  assert.ok(Number.isFinite(rx) && Number.isFinite(ry) && Number.isFinite(rz));
  assert.ok(Math.abs(ry - 90) < 1e-6);
});

test("a decomposicao preserva o quadrante, que atan simples perderia", async () => {
  const T = await transform();

  // O par (120, 30, -170) e (-60, 30, 10) descrevem rotações diferentes; um
  // `atan` sem os dois sinais confundiria as duas.
  const a = T.matrixFromEuler([120, 30, -170]);
  const b = T.matrixFromEuler([-60, 30, 10]);
  assert.ok(maiorDiferenca(a, b) > 0.1, "as duas rotacoes precisam ser mesmo distintas");

  const decompostoA = T.eulerFromMatrix(a);
  assert.ok(maiorDiferenca(a, T.matrixFromEuler(decompostoA)) < 1e-9);
  assert.ok(
    maiorDiferenca(b, T.matrixFromEuler(decompostoA)) > 0.1,
    "a decomposicao de A nao pode descrever B"
  );
});

test("compor uma correcao de eixo e decompor devolve os angulos que apontam o eixo pedido", async () => {
  const T = await transform();

  // É a conta que o Look At precisa para os eixos verticais: R' = R_lookAt · P,
  // onde P leva o eixo escolhido até +Z.
  const lookAt = T.matrixFromEuler([25, -40, 0]);

  for (const [eixo, correcao, esperado] of [
    ["+y", T.rotX(90), [0, 1, 0]],
    ["-y", T.rotX(-90), [0, -1, 0]]
  ]) {
    const combinado = T.multiply(lookAt, correcao);
    const euler = T.eulerFromMatrix(combinado);
    const reconstruido = T.matrixFromEuler(euler);

    // O eixo escolhido, girado pela orientação final, tem de cair exatamente
    // onde +Z cairia com a orientação do lookAt.
    const destino = T.apply(reconstruido, esperado);
    const referencia = T.apply(lookAt, [0, 0, 1]);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(
        Math.abs(destino[i] - referencia[i]) < 1e-9,
        `${eixo}: componente ${i} deu ${destino[i]}, esperava ${referencia[i]}`
      );
    }
  }
});
