import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const RAIZ = new URL("../", import.meta.url);

async function fonte(caminho) {
  return readFile(new URL(caminho, RAIZ), "utf8");
}

/**
 * Comandos que existem de proposito sem ferramenta propria no painel.
 *
 * A regra e a mesma da allowlist de branding: entrar aqui exige motivo escrito.
 * Um comando esquecido e um comando que ninguem consegue executar — e sem
 * justificativa nao da para distinguir "interno" de "esqueceram de ligar".
 */
const SEM_FERRAMENTA_PROPRIA = new Map([
  // Nenhum por enquanto: toda previa (`*.preview`) e chamada pelo gancho `load`
  // da ferramenta correspondente, entao aparece como referenciada.
]);

test("todo comando do After Effects e alcancavel pelo painel", async () => {
  const descriptors = await fonte("packages/command-registry/src/descriptors.ts");
  const painel = await fonte("apps/after-effects-cep/client/src/main.ts");

  // Este teste existe por um caso real: uma reescrita do painel removeu 19
  // ferramentas de uma vez. O host continuou registrando os comandos, os
  // descriptors continuaram declarando-os, o typecheck passou e a suite ficou
  // verde — porque nada, ate aqui, ligava o registro de comandos ao registro de
  // ferramentas. As ferramentas simplesmente sumiram da interface.
  const declarados = [...descriptors.matchAll(/^ {4}id: "(ae\.[^"]+)"/gm)].map((m) => m[1]);

  // Procura o id como literal em qualquer lugar do painel, e nao so dentro de
  // `execute("...")`: uma ferramenta com varias operacoes guarda os ids num mapa
  // e despacha por variavel, e continua sendo alcancavel.
  const citados = new Set([...painel.matchAll(/"(ae\.[a-zA-Z0-9._-]+)"/g)].map((m) => m[1]));

  assert.ok(declarados.length > 0, "nenhum descriptor de After Effects foi encontrado");

  const inalcancaveis = declarados.filter(
    (id) => !citados.has(id) && !SEM_FERRAMENTA_PROPRIA.has(id)
  );

  assert.deepEqual(
    inalcancaveis,
    [],
    "estes comandos existem no host e no registro, mas nenhuma tela do painel os executa"
  );
});

test("toda excecao da allowlist tem motivo escrito e ainda existe", async () => {
  // Espelha o guarda da allowlist de branding: uma excecao sem motivo, ou que
  // sobreviveu ao comando que a justificava, vira permissao permanente.
  const descriptors = await fonte("packages/command-registry/src/descriptors.ts");
  const declarados = new Set(
    [...descriptors.matchAll(/^ {4}id: "(ae\.[^"]+)"/gm)].map((m) => m[1])
  );

  for (const [id, motivo] of SEM_FERRAMENTA_PROPRIA) {
    assert.ok(declarados.has(id), `${id} esta na allowlist mas nao e mais um descriptor`);
    assert.ok(
      typeof motivo === "string" && motivo.trim().length >= 20,
      `${id} precisa de um motivo escrito, nao de uma linha em branco`
    );
  }
});

test("toda chamada de comando e registrada no log de diagnostico", async () => {
  // A view de Diagnostico se alimenta de `recordResponse`, e e justamente
  // quando algo falha que o usuario vai olhar ali. Onze chamadas nao
  // registravam — inclusive as cinco previas e o Kinetic —, entao um erro nelas
  // nao deixava rastro nenhum.
  const painel = await fonte("apps/after-effects-cep/client/src/main.ts");
  const linhas = painel.split("\n");

  const semRegistro = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const m = linhas[i].match(/^(?:async )?function (\w+)\(/);
    if (!m) continue;

    let fim = linhas.length;
    for (let j = i + 1; j < linhas.length; j += 1) {
      if (linhas[j].startsWith("}")) {
        fim = j;
        break;
      }
    }
    const corpo = linhas.slice(i, fim).join("\n");
    const executa = (corpo.match(/\.execute(?:<[^>]*>)?\(/g) ?? []).length;
    if (executa === 0) continue;

    // Uma funcao que devolve `{ command, response }` entrega o registro a quem
    // chamou — e o padrao do Parallax completo, onde cada ramo tem seu id
    // literal ao lado do payload.
    const devolveParaQuemChama = /return \{\s*command:/.test(corpo);
    if (devolveParaQuemChama) continue;

    const registra = (corpo.match(/\.recordResponse\(/g) ?? []).length;
    if (registra < executa) semRegistro.push(`${m[1]}: ${executa} execute, ${registra} recordResponse`);
  }

  assert.deepEqual(semRegistro, [], "estas telas chamam o host sem registrar a resposta");
});

test("toda ferramenta do painel aponta para um comando que existe", async () => {
  // A direcao oposta: uma tela que chama um id errado so falha quando o usuario
  // clica, e o erro que volta e "comando desconhecido" — dificil de ligar a um
  // erro de digitacao no cliente.
  const descriptors = await fonte("packages/command-registry/src/descriptors.ts");
  const painel = await fonte("apps/after-effects-cep/client/src/main.ts");

  const declarados = new Set([...descriptors.matchAll(/^ {4}id: "([^"]+)"/gm)].map((m) => m[1]));
  const citados = [...painel.matchAll(/"(ae\.[a-zA-Z0-9._-]+)"/g)].map((m) => m[1]);

  const desconhecidos = [...new Set(citados)].filter((id) => !declarados.has(id));

  assert.deepEqual(desconhecidos, [], "o painel executa comandos que nenhum descriptor declara");
});
