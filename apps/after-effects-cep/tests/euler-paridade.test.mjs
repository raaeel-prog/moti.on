/**
 * Paridade entre a decomposição do host e a da expressão.
 *
 * `MotionTransform.eulerFromMatrix` roda no host; a versão embutida na expressão
 * do Look At roda dentro do After Effects, porque `lookAt` depende das posições
 * do frame e a conta precisa acontecer na avaliação. São duas implementações da
 * mesma fórmula, e por isso podem divergir — foi assim que a conversão de curva
 * do CHMS-018 ficou errada nos dois lados sem ninguém notar.
 *
 * Aqui a versão da expressão é extraída do próprio template e executada, e o
 * resultado é comparado com o do host. Se alguém corrigir uma e esquecer a
 * outra, este teste cai.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { loadHostModules } from "./host-harness.mjs";

/** Auxiliares que o After Effects fornece às expressões e o Node não tem. */
const AMBIENTE_DE_EXPRESSAO = `
  function degreesToRadians(g) { return g * Math.PI / 180; }
  function radiansToDegrees(r) { return r * 180 / Math.PI; }
`;

/**
 * Extrai as funções que o template embute na expressão e as torna chamáveis.
 *
 * Ler do template, e não copiar o texto para cá, é o que faz o teste medir o que
 * o plugin realmente aplica.
 */
async function decomposicaoDaExpressao() {
  const scope = await loadHostModules(
    ["generated/motion-contracts.jsx", "src/expression-templates.jsx"],
    {}
  );

  const expressao = scope.MotionExpressions.renderLookAt({
    targetLayerName: "Alvo",
    forwardAxis: "+y",
    offsetOrientation: [0, 0, 0],
    constrainAxes: { x: false, y: false, z: false }
  });

  const inicio = expressao.indexOf("function motionEuler(");
  const fim = expressao.indexOf("var origem =");
  assert.ok(inicio >= 0 && fim > inicio, "as funcoes de matriz nao foram encontradas na expressao");
  const fonte = expressao.slice(inicio, fim);

  // `new Function` e restrito a este harness: a fonte vem do proprio
  // repositorio, nunca de dado externo, e nada disto entra no bundle.
  const fabrica = new Function(
    `${AMBIENTE_DE_EXPRESSAO}\n${fonte}\nreturn { motionEuler, motionMul, motionRotX, motionFromEuler };`
  );
  return fabrica();
}

async function decomposicaoDoHost() {
  const scope = await loadHostModules(["src/transform-math.jsx"], {});
  return scope.MotionTransform;
}

const CASOS = [
  [0, 0, 0],
  [30, 45, 60],
  [-30, -45, -60],
  [120, 30, -170],
  [-179, 12, 179],
  [15, 89.9, -33],
  [15, -89.9, -33],
  [45, 90, 0],
  [45, -90, 0],
  [7.5, -12.25, 133.75]
];

test("as duas decomposicoes concordam em toda a tabela", async () => {
  const expressao = await decomposicaoDaExpressao();
  const host = await decomposicaoDoHost();

  for (const angulos of CASOS) {
    const matriz = host.matrixFromEuler(angulos);
    const doHost = host.eulerFromMatrix(matriz);
    const daExpressao = expressao.motionEuler(matriz);

    for (let i = 0; i < 3; i += 1) {
      assert.ok(
        Math.abs(doHost[i] - daExpressao[i]) < 1e-9,
        `[${angulos.join(", ")}] componente ${i}: host ${doHost[i]}, expressao ${daExpressao[i]}`
      );
    }
  }
});

test("as duas multiplicacoes de matriz concordam", async () => {
  const expressao = await decomposicaoDaExpressao();
  const host = await decomposicaoDoHost();

  const a = host.matrixFromEuler([25, -40, 15]);
  const b = host.rotX(90);

  const doHost = host.multiply(a, b);
  const daExpressao = expressao.motionMul(a, b);

  for (let i = 0; i < 9; i += 1) {
    assert.ok(Math.abs(doHost[i] - daExpressao[i]) < 1e-12, `entrada ${i} divergiu`);
  }
});

test("a correcao do eixo vertical aponta o eixo pedido, calculada pela expressao", async () => {
  const expressao = await decomposicaoDaExpressao();
  const host = await decomposicaoDoHost();

  // Reproduz o que a expressão faz em runtime, com uma orientação de lookAt
  // qualquer, e confere que +Y acaba onde +Z estaria.
  const base = [22, -63, 0];
  const combinado = expressao.motionMul(expressao.motionFromEuler(base), expressao.motionRotX(90));
  const euler = expressao.motionEuler(combinado);

  const destinoY = host.apply(host.matrixFromEuler(euler), [0, 1, 0]);
  const referenciaZ = host.apply(host.matrixFromEuler(base), [0, 0, 1]);

  for (let i = 0; i < 3; i += 1) {
    assert.ok(
      Math.abs(destinoY[i] - referenciaZ[i]) < 1e-9,
      `componente ${i}: +Y foi para ${destinoY[i]}, +Z estaria em ${referenciaZ[i]}`
    );
  }
});

test("o guarda de paridade pega uma divergencia real", async () => {
  const expressao = await decomposicaoDaExpressao();
  const host = await decomposicaoDoHost();

  // Prova que a comparação tem poder: uma fórmula ligeiramente diferente
  // precisa ser detectada, senão o teste passaria por acidente.
  const matriz = host.matrixFromEuler([30, 45, 60]);
  const correto = expressao.motionEuler(matriz);
  const adulterado = [correto[0] * 1.0001, correto[1], correto[2]];

  assert.ok(
    Math.abs(host.eulerFromMatrix(matriz)[0] - adulterado[0]) > 1e-9,
    "uma divergencia de 0,01% precisa ser visivel"
  );
});
