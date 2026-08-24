import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import premierepro from "@adobe/eslint-plugin-premierepro";

/**
 * Prova que o plugin oficial da Adobe realmente funciona nesta instalacao.
 *
 * O motivo de este arquivo existir: `@adobe/eslint-plugin-premierepro@26.3.0`
 * declara peer `eslint@^9.0.0`, e o repositorio usa o 10. A resolucao foi
 * destravada por um `override` dirigido em package.json — o que faz o npm parar
 * de reclamar, mas nao prova nada sobre o comportamento.
 *
 * Um override sem verificacao e so uma forma de silenciar o instalador. Se o
 * plugin carregasse mas nao produzisse diagnostico algum, `npm run lint` ficaria
 * verde para sempre e ninguem notaria que a protecao contra o erro mais caro do
 * Premiere — mutar fora de uma transacao — deixou de existir.
 *
 * Cada teste tem par positivo e negativo: a regra dispara no codigo errado e
 * fica calada no codigo certo.
 */

const RULE_NAMESPACE = "@adobe/premierepro";

async function lint(code, rules) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      files: ["**/*.ts"],
      plugins: { [RULE_NAMESPACE]: premierepro },
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        parser: (await import("@typescript-eslint/parser")).default
      },
      rules
    }
  });

  const [result] = await eslint.lintText(code, { filePath: "fixture.ts" });
  return result.messages;
}

test("o plugin oficial expoe as sete regras sintaticas documentadas", () => {
  // Se a Adobe renomear ou remover uma regra, o `rules` da config abaixo passaria
  // a referenciar um nome inexistente, e o ESLint falharia de forma obscura.
  for (const rule of [
    "require-action-lock-scope",
    "require-execute-transaction",
    "no-async-in-locked-access",
    "no-async-in-execute-transaction",
    "no-action-scope-escape",
    "prefer-locked-access-wrapper",
    "prefer-undo-string"
  ]) {
    assert.ok(premierepro.rules[rule], `A regra ${rule} não existe mais no plugin.`);
  }

  assert.ok(premierepro.configs.recommended, "A config recommended não existe mais.");
});

test("no-async-in-execute-transaction acusa await dentro da transacao", async () => {
  // O erro que a pesquisa mostrou que eu teria cometido: o plano previa
  // withTransaction como async. lockedAccess e executeTransaction sao sincronas,
  // e trabalho assincrono dentro delas quebra a garantia de que o estado do
  // projeto nao muda durante o callback.
  const messages = await lint(
    `
    declare const project: any;
    declare function slow(): Promise<number>;
    project.executeTransaction(async (compound: any) => {
      await slow();
      compound.addAction({} as any);
    }, "rotulo");
    `,
    { [`${RULE_NAMESPACE}/no-async-in-execute-transaction`]: "error" }
  );

  assert.ok(
    messages.length > 0,
    "A regra não acusou await dentro de executeTransaction. O plugin não está funcionando."
  );
});

test("no-async-in-execute-transaction fica calada num callback sincrono", async () => {
  const messages = await lint(
    `
    declare const project: any;
    project.executeTransaction((compound: any) => {
      compound.addAction({} as any);
    }, "rotulo");
    `,
    { [`${RULE_NAMESPACE}/no-async-in-execute-transaction`]: "error" }
  );

  assert.deepEqual(
    messages.map((m) => m.message),
    [],
    "A regra acusou código correto: falso positivo."
  );
});

test("no-async-in-locked-access acusa async no callback da trava", async () => {
  const messages = await lint(
    `
    declare const project: any;
    declare function slow(): Promise<void>;
    project.lockedAccess(async () => {
      await slow();
    });
    `,
    { [`${RULE_NAMESPACE}/no-async-in-locked-access`]: "error" }
  );

  assert.ok(messages.length > 0, "A regra não acusou async dentro de lockedAccess.");
});

test("prefer-locked-access-wrapper acusa transacao fora da trava", async () => {
  // O padrao que a documentacao da Adobe recomenda e lockedAccess envolvendo
  // executeTransaction. Sem a trava, o estado do projeto pode mudar entre a
  // leitura que decide o que fazer e a escrita que faz.
  const messages = await lint(
    `
    declare const project: any;
    project.executeTransaction((compound: any) => {
      compound.addAction({} as any);
    }, "rotulo");
    `,
    { [`${RULE_NAMESPACE}/prefer-locked-access-wrapper`]: "error" }
  );

  assert.ok(messages.length > 0, "A regra não acusou executeTransaction fora de lockedAccess.");
});

test("prefer-locked-access-wrapper fica calada no padrao aninhado correto", async () => {
  const messages = await lint(
    `
    declare const project: any;
    project.lockedAccess(() => {
      project.executeTransaction((compound: any) => {
        compound.addAction({} as any);
      }, "rotulo");
    });
    `,
    { [`${RULE_NAMESPACE}/prefer-locked-access-wrapper`]: "error" }
  );

  assert.deepEqual(
    messages.map((m) => m.message),
    [],
    "A regra acusou o padrão que a própria Adobe recomenda."
  );
});
