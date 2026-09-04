/**
 * O §13 do MASTER_BUILD_SPEC é o catálogo normativo de comandos. Este teste
 * mantém esse catálogo e o registro executável (`COMMAND_DESCRIPTORS`) presos
 * um ao outro.
 *
 * Por que isso precisa de teste: um id de comando é contrato entre painel e
 * host, e a divergência não faz barulho. Ela foi encontrada por auditoria
 * manual — o catálogo listava `ae.animate.wiggle` e `ae.animate.flicker`
 * enquanto o host registrava `ae.expression.wiggle` e `ae.expression.flicker`
 * desde sempre. Nada quebrou, porque o painel só chama o que existe; o que
 * quebrou foi a spec deixar de descrever o produto. Sem um teste, a próxima
 * divergência também só aparece quando alguém for ler as duas listas lado a
 * lado.
 *
 * A direção "catalogado mas não implementado" é permitida, porque o catálogo
 * também descreve fases futuras — mas apenas pela lista fixa abaixo, com o
 * motivo escrito. A direção oposta, "implementado e fora do catálogo", também
 * exige entrada explícita: um comando que existe e não está documentado é uma
 * feature que ninguém sabe pedir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { COMMAND_DESCRIPTORS } from "../packages/command-registry/dist/index.js";

const SPEC_URL = new URL("../docs/MASTER_BUILD_SPEC.md", import.meta.url);

/**
 * Ids que o §13 cataloga e o registro ainda não tem. Cada entrada precisa do
 * motivo: "ainda não fizemos" é uma decisão, e uma decisão sem motivo escrito
 * vira um item que ninguém sabe se é dívida ou escopo descartado.
 */
const CATALOGADOS_SEM_IMPLEMENTACAO = new Map([
  [
    "ae.audio.beat",
    "P5. Exige o native audio analyzer (CHMS-036/037), que ainda não existe; a spec proíbe explicitamente contornar isso com app.executeCommand."
  ]
]);

/**
 * Comandos que existem e o §13 não cataloga de propósito. O catálogo descreve
 * o que o usuário pede; estes são infraestrutura ou variações de um comando já
 * catalogado, e listá-los inflaria a tabela sem informar ninguém.
 */
const IMPLEMENTADOS_FORA_DO_CATALOGO = new Map([
  ["ae.context.read", "Leitura de contexto que o painel faz sozinho; não é uma ferramenta."],
  ["ae.capability.probe", "Sonda de capacidades do host; não é uma ferramenta."],
  ["ae.diagnostics.echo", "Eco de diagnóstico usado pelo System Check."],
  ["ae.layer.list", "Leitura auxiliar consumida pelos seletores de camada do painel."],
  ["ae.keys.paste", "Metade de `ae.keys.copy`, catalogado como Copy Keys."],
  ["ae.keys.reverse", "Mirror de keyframes, coberto pela §15.5 em vez do §13."],
  ["ae.keys.reverse-values", "Inversão de valores, coberta pela §15.5."],
  ["ae.keys.clone", "Duplicar/Duplicar+Inverter, cobertos pela §15.5."],
  ["ae.keys.send-to-edge", "Enviar ao começo/final, cobertos pela §15.5."],
  ["ae.keys.ease.apply", "Editor de curva da §15, coberto lá."],
  ["ae.anchor.align", "Alinhador de âncora da §14, coberto lá."],
  ["ae.camera.transition", "Transições de câmera da §17, cobertas lá."],
  ["ae.parallax.auto-focus", "Parallax avançado da §16, coberto lá."],
  ["ae.parallax.zoom", "Parallax avançado da §16, coberto lá."],
  ["ae.parallax.wiggle", "Parallax avançado da §16, coberto lá."],
  ["ae.parallax.bake", "Parallax avançado da §16, coberto lá."],
  [
    "ae.demo.createComposition",
    "Comando de fumaça que cria composição e camada de texto; existe para provar a ponte ponta a ponta, não é ferramenta do produto."
  ],
  // Os três `pr.*` abaixo não estão fora do §13 por decisão de escopo: o
  // MASTER_BUILD_SPEC não tem catálogo de comandos do Premiere em lugar nenhum.
  // A §13 é declaradamente do After Effects, e o Premiere aparece só como
  // arquitetura (§4.2, §22) e como limites de API (§20.3). Enquanto esse
  // catálogo não existir, as três entradas registram a lacuna em vez de
  // fingirem que ela foi decidida.
  [
    "pr.context.read",
    "Leitura de contexto do Premiere. Sem catálogo de comandos do Premiere na spec — lacuna registrada na nota do §13."
  ],
  [
    "pr.capability.probe",
    "Sonda de capacidades do Premiere. Mesma lacuna de catálogo que pr.context.read."
  ],
  [
    "pr.diagnostics.selfTest",
    "Autoteste do adapter UXP, consumido pelo System Check. Mesma lacuna de catálogo."
  ]
]);

/** Ids da tabela do §13, na ordem em que aparecem. */
async function catalogo() {
  const texto = await readFile(SPEC_URL, "utf8");
  const inicio = texto.indexOf("## 13. Catálogo de comandos");
  assert.ok(inicio > 0, "o §13 sumiu do MASTER_BUILD_SPEC.");
  const fim = texto.indexOf("\n### ", inicio);
  const tabela = texto.slice(inicio, fim);

  const ids = [...tabela.matchAll(/^\|\s*`([a-z0-9.-]+)`\s*\|/gm)].map((m) => m[1]);
  assert.ok(ids.length > 30, `o §13 rendeu só ${ids.length} ids; o parser da tabela quebrou.`);
  return ids;
}

test("o parser lê a tabela do §13, e não qualquer crase da spec", async () => {
  // Instrumento antes da medida: um parser que devolvesse lista vazia faria
  // todos os testes abaixo passarem sem verificar nada.
  const ids = await catalogo();
  assert.ok(ids.includes("ae.text.box"), "um id conhecido do §13 não foi lido.");
  assert.ok(
    !ids.includes("ae.keys.send-to-edge"),
    "o parser passou do fim da tabela e leu id de outra seção."
  );
  assert.deepEqual([...new Set(ids)], ids, "o §13 tem id repetido.");
});

test("todo id catalogado no §13 existe no registro, salvo os declarados pendentes", async () => {
  const ids = await catalogo();
  const registrados = new Set(COMMAND_DESCRIPTORS.map((d) => d.id));

  const ausentes = ids.filter((id) => !registrados.has(id));
  assert.deepEqual(
    ausentes.slice().sort(),
    [...CATALOGADOS_SEM_IMPLEMENTACAO.keys()].sort(),
    "o §13 cataloga um comando que não existe e não está na lista de pendentes — " +
      "ou o id do registro mudou, ou a implementação foi removida."
  );
});

test("todo comando do registro está no §13, salvo os declarados fora do catálogo", async () => {
  const ids = new Set(await catalogo());
  const foraDoCatalogo = COMMAND_DESCRIPTORS.map((d) => d.id)
    .filter((id) => !ids.has(id))
    // `.preview` é o par de leitura de um comando mutante já catalogado; o
    // catálogo descreve a ferramenta, não os dois lados dela.
    .filter((id) => !id.endsWith(".preview"));

  assert.deepEqual(
    foraDoCatalogo.slice().sort(),
    [...IMPLEMENTADOS_FORA_DO_CATALOGO.keys()].sort(),
    "um comando existe e não está no §13 nem declarado como fora do catálogo."
  );
});

test("toda pendência e toda exceção trazem o motivo escrito", () => {
  for (const [id, motivo] of [
    ...CATALOGADOS_SEM_IMPLEMENTACAO,
    ...IMPLEMENTADOS_FORA_DO_CATALOGO
  ]) {
    assert.ok(
      typeof motivo === "string" && motivo.length > 20,
      `${id}: a justificativa está vazia ou curta demais para explicar a decisão.`
    );
  }
});
