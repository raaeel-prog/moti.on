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
  // Vazia. `ae.audio.beat` foi implementado em 2026-09-05 lendo a camada de
  // amplitude que o assistente nativo do After Effects gera, e não o native
  // audio analyzer que o §13 exige — que depende do CHMS-036/037 e não existe.
  // A divergência está registrada no §13 e a escolha foi do dono do produto.
]);

/**
 * Comandos que existem e o §13 não cataloga de propósito. O catálogo descreve
 * o que o usuário pede; estes são infraestrutura ou variações de um comando já
 * catalogado, e listá-los inflaria a tabela sem informar ninguém.
 */
const IMPLEMENTADOS_FORA_DO_CATALOGO = new Map([
  ["ae.quick-tools.apply", "Atalhos migrados do FX Studio a pedido do usuario em 2026-09-14; contrato em docs/research/fx-studio-quick-actions.md."],
  ["ae.quick-tools.save-frame", "Exportacao PNG do FX Studio, separada por nao alterar o projeto nem criar Undo; contrato em docs/research/fx-studio-quick-actions.md."],
  ["ae.effect.gradient.read", "Leitura auxiliar dos controles, selecao e capacidades de Gradientes; consumida pelo editor."],
  ["ae.context.read", "Leitura de contexto que o painel faz sozinho; não é uma ferramenta."],
  ["ae.text.vertical-pulse.read", "Leitura auxiliar do Pulso selecionado, com controles, geometria, migração e estado de atualização; consumida pelo painel ao abrir ou ajustar."],
  ["ae.text.word-reveal.read", "Leitura auxiliar dos controles da revelação selecionada; consumida pelo painel ao abrir ou reaplicar a ferramenta."],
  ["ae.text.variable-morph.read", "Leitura auxiliar do morph selecionado, com controles, capacidades e estado de atualização; consumida pelo painel e pelo cartão rápido."],
  ["ae.capability.probe", "Sonda de capacidades do host; não é uma ferramenta."],
  ["ae.diagnostics.echo", "Eco de diagnóstico usado pelo System Check."],
  ["ae.ui.color-picker", "Diálogo de cor do sistema usado pelo seletor de cor do painel; não muta o projeto."],
  ["ae.layer.list", "Leitura auxiliar consumida pelos seletores de camada do painel."],
  ["ae.keys.paste", "Metade de `ae.keys.copy`, catalogado como Copy Keys."],
  ["ae.keys.reverse", "Mirror de keyframes, coberto pela §15.5 em vez do §13."],
  ["ae.keys.reverse-values", "Inversão de valores, coberta pela §15.5."],
  ["ae.keys.clone", "Duplicar/Duplicar+Inverter, cobertos pela §15.5."],
  ["ae.keys.send-to-edge", "Enviar ao começo/final, cobertos pela §15.5."],
  ["ae.keys.ease.apply", "Editor de curva da §15, coberto lá."],
  ["ae.anchor.align", "Alinhador de âncora da §14, coberto lá."],
  ["ae.camera.transition", "Transições de câmera da §17, cobertas lá."],
  ["ae.parallax.create", "Nucleo Parallax v2 solicitado em MOTION_PARALLAX_IMPLEMENTACAO_IA.md, setembro de 2026."],
  ["ae.parallax.adjust", "Nucleo Parallax v2 solicitado em MOTION_PARALLAX_IMPLEMENTACAO_IA.md, setembro de 2026."],
  ["ae.parallax.move", "Nucleo Parallax v2 solicitado em MOTION_PARALLAX_IMPLEMENTACAO_IA.md, setembro de 2026."],
  ["ae.parallax.remove", "Nucleo Parallax v2 solicitado em MOTION_PARALLAX_IMPLEMENTACAO_IA.md, setembro de 2026."],
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

/**
 * O §17.1 cataloga onze transições de câmera por id. Elas não são comandos —
 * são presets dentro de `ae.camera.transition` — então o teste de catálogo
 * acima não as alcança, e por isso a divergência ficou invisível até uma
 * auditoria manual em 2026-09-04.
 *
 * `ae.camera.transition` registra onze presets, mas são **movimentos** de
 * câmera, não as transições do §17.1. Os dois conjuntos têm onze itens por
 * coincidência — foi essa coincidência que fez o comentário do comando afirmar
 * que o critério de aceite do CHMS-024 estava cumprido.
 */
const TRANSICOES_SEM_IMPLEMENTACAO = new Map();

/** Ids do catálogo do §17.1, lidos dos blocos de código da seção. */
async function catalogoDeTransicoes() {
  const texto = await readFile(SPEC_URL, "utf8");
  const inicio = texto.indexOf("### 17.1 Catálogo");
  assert.ok(inicio > 0, "o §17.1 sumiu do MASTER_BUILD_SPEC.");
  const fim = texto.indexOf("### 17.2", inicio);
  assert.ok(fim > inicio, "o fim do §17.1 não foi encontrado.");

  const ids = [...texto.slice(inicio, fim).matchAll(/^(camera\.[a-z-]+)$/gm)].map((m) => m[1]);
  assert.equal(ids.length, 11, `o §17.1 rendeu ${ids.length} ids; o parser da seção quebrou.`);
  return ids;
}

test("o parser lê o catálogo do §17.1, e não prosa da seção", async () => {
  const ids = await catalogoDeTransicoes();
  assert.ok(ids.includes("camera.blur-lens"), "um id conhecido do §17.1 não foi lido.");
  assert.ok(
    !ids.includes("camera.transition"),
    "o parser leu algo que não é um id do catálogo."
  );
  assert.deepEqual([...new Set(ids)], ids, "o §17.1 tem id repetido.");
});

test("toda transição do §17.1 está implementada ou declarada pendente, com motivo", async () => {
  const ids = await catalogoDeTransicoes();
  const { MOTION_LIBRARY_CAMERA_PRESETS } = await import("../packages/contracts/dist/motion-library-camera.js");
  const executaveis = new Set(MOTION_LIBRARY_CAMERA_PRESETS.map(p => p.cameraSpec?.id).filter(Boolean));
  const implementados = ids.filter(id => executaveis.has(id));
  const pendentes = ids.filter((id) => !implementados.includes(id));

  assert.deepEqual(
    pendentes.slice().sort(),
    [...TRANSICOES_SEM_IMPLEMENTACAO.keys()].sort(),
    "a lista de transições pendentes do §17.1 saiu de sincronia com a implementação"
  );

  for (const [id, motivo] of TRANSICOES_SEM_IMPLEMENTACAO) {
    assert.ok(
      typeof motivo === "string" && motivo.length > 20,
      `${id}: a justificativa está vazia ou curta demais para explicar a decisão.`
    );
  }
});
