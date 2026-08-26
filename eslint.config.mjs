import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import premierepro from "@adobe/eslint-plugin-premierepro";

/**
 * Configuracao flat do ESLint.
 *
 * Duas coisas que esta configuracao precisa fazer e que nao sao obvias:
 *
 * 1. `no-console` como erro. A secao 34 do master spec proibe console.log em
 *    release; o logger estruturado chega no CHMS-007. Ate la, a regra impede que
 *    novos console apareçam por habito.
 *
 * 2. Fronteira de camadas. A camada de apresentacao nao pode falar com o host
 *    direto. Hoje `packages/` ainda nao tem codigo TypeScript, entao a regra
 *    existe com o alvo ja definido e passa a morder assim que o CHMS-008 criar
 *    ui-core. Declarar a fronteira antes de haver o que a violar e barato;
 *    descobrir a violacao depois de pronta, nao.
 */
export default [
  {
    ignores: [
      "dist/**",
      "packages/*/dist/**",
      "packages/contracts/src/generated/**",
      "apps/*/dist/**",
      "node_modules/**",
      "artifacts/**",
      "coverage/**",
      // Codigo gerado. A checagem dele e feita por
      // packages/contracts/tests/generated-drift.test.mjs, que roda o mesmo
      // scanner de subconjunto ExtendScript usado nos fontes escritos a mao.
      "apps/*/host/generated/**",
      // CSInterface.js e codigo de terceiros, distribuido pela Adobe.
      // Reformata-lo dificultaria comparar com a versao oficial.
      "apps/after-effects-cep/client/lib/**"
    ]
  },

  js.configs.recommended,

  // TypeScript. Sem checagem com informacao de tipo (projectService) de
  // proposito: `npm run typecheck` roda o tsc completo e e a autoridade sobre
  // tipos. Duplicar isso no lint dobraria o tempo sem encontrar nada novo.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["packages/**/*.ts", "apps/**/*.ts"]
  })),

  // Scripts de build e testes: Node moderno, ESM.
  {
    files: [
      "scripts/**/*.mjs",
      "tests/**/*.mjs",
      "packages/*/scripts/**/*.mjs",
      "packages/*/tests/**/*.mjs",
      "apps/*/tests/**/*.mjs"
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node }
    },
    rules: {
      // Os scripts de build e o runner de testes se comunicam por stdout.
      "no-console": "off"
    }
  },

  // Cliente do painel CEP (After Effects): navegador embutido do CEP 12.
  {
    files: ["apps/after-effects-cep/client/**/*.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        ...globals.browser,
        CSInterface: "readonly",
        MotionProtocol: "readonly",
        cep: "readonly",
        __adobe_cep__: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-var": "off",
      "prefer-const": "off"
    }
  },

  // Camada de host do After Effects: ExtendScript, ES5, sem modulos.
  // A restricao de sintaxe real vem de scripts/check-extendscript.mjs; aqui o
  // ESLint so precisa conseguir parsear o arquivo sem reclamar de ES5 idiomatico.
  {
    files: ["apps/after-effects-cep/host/src/**/*.jsx"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        // Fornecidos pelo After Effects.
        $: "readonly",
        app: "readonly",
        CompItem: "readonly",
        File: "readonly",
        ParagraphJustification: "readonly",
        PropertyType: "readonly",
        PropertyValueType: "readonly",
        TextDocument: "readonly",
        // Fornecidos pelos proprios modulos do host. O ExtendScript nao tem
        // sistema de modulos: cada arquivo se pendura em $.global e os
        // seguintes o enxergam como identificador nu. A ordem de carregamento
        // esta em HOST_SOURCE_ORDER, e os tipos em host/types/motion-host.d.ts.
        MotionContracts: "readonly",
        MotionDescriptors: "readonly",
        MotionJson: "readonly",
        MotionExpressions: "readonly",
        MotionUndo: "readonly",
        MotionRegistry: "readonly",
        MotionAE: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-var": "off",
      "prefer-const": "off",
      // `for (key in obj)` com hasOwnProperty e o unico jeito de iterar objeto em
      // ExtendScript; Object.keys nao existe.
      "guard-for-in": "off",
      // O ExtendScript e ES5 e nao tem optional catch binding: `catch {}` e erro
      // de sintaxe la. Um binding sem uso e imposto pela linguagem, nao
      // descuido, entao acusa-lo obrigaria a escrever codigo pior so para
      // silenciar a regra.
      "no-unused-vars": ["error", { caughtErrors: "none" }]
    }
  },

  // Premiere Pro: regras oficiais da Adobe.
  //
  // Sao elas que impedem os erros mais caros da API do Premiere — mutar fora de
  // uma transacao, trabalho assincrono dentro dos callbacks sincronos de
  // lockedAccess e executeTransaction, e referencia de Action escapando do
  // escopo da trava. A secao 7 do master spec exige "ESLint incl. official
  // Premiere rules", e uma regra oficial acompanha as mudancas da API; uma regra
  // caseira envelhece em silencio.
  //
  // Config sintatica, nao recommendedTypeChecked: as variantes com informacao de
  // tipo exigem projectService, que faz o ESLint carregar o programa TypeScript
  // inteiro a cada execucao. `npm run typecheck` ja roda o tsc completo.
  //
  // tests/premiere-eslint-rules.test.mjs prova que as regras funcionam com o
  // ESLint 10 apesar do peer ^9 declarado pelo plugin.
  {
    ...premierepro.configs.recommended,
    files: ["apps/premiere-uxp/**/*.ts"]
  },

  {
    files: ["apps/premiere-uxp/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser }
    },
    rules: {
      "no-console": "error"
    }
  },

  // Protocolo legado: UMD, precisa rodar em Node, no CEP e no UXP.
  {
    files: ["packages/contracts/legacy/**/*.js"],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        define: "readonly"
      }
    },
    rules: {
      "no-var": "off",
      "prefer-const": "off"
    }
  },

  // Fronteira de camadas: nada em packages/ pode falar com host, filesystem ou
  // rede diretamente. Somente apps/*/client/src/host-adapter.* tem esse direito.
  {
    files: ["packages/**/*.{ts,js,mjs}"],
    ignores: ["packages/*/tests/**", "packages/contracts/legacy/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "uxp", message: "Apenas o host adapter do app pode falar com o UXP." },
            { name: "premierepro", message: "Apenas o host adapter do app pode falar com o Premiere." },
            { name: "fs", message: "Acesso a arquivos passa pelo host adapter." },
            { name: "node:fs", message: "Acesso a arquivos passa pelo host adapter." },
            { name: "os", message: "Acesso ao sistema passa pelo host adapter." },
            { name: "node:os", message: "Acesso ao sistema passa pelo host adapter." }
          ]
        }
      ],
      "no-restricted-globals": [
        "error",
        { name: "CSInterface", message: "Apenas o host adapter do app pode usar o CEP." },
        { name: "__adobe_cep__", message: "Apenas o host adapter do app pode usar o CEP." },
        { name: "cep", message: "Apenas o host adapter do app pode usar o CEP." }
      ]
    }
  }
];
