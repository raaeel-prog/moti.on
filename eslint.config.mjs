import js from "@eslint/js";
import globals from "globals";

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
      "node_modules/**",
      "artifacts/**",
      "coverage/**",
      // CSInterface.js e codigo de terceiros, distribuido pela Adobe.
      // Reformata-lo dificultaria comparar com a versao oficial.
      "apps/after-effects-cep/client/lib/**"
    ]
  },

  js.configs.recommended,

  // Scripts de build e testes: Node moderno, ESM.
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "packages/*/tests/**/*.mjs", "apps/*/tests/**/*.mjs"],
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
        $: "readonly",
        app: "readonly",
        CompItem: "readonly",
        File: "readonly",
        ParagraphJustification: "readonly",
        TextDocument: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-var": "off",
      "prefer-const": "off",
      // `for (key in obj)` com hasOwnProperty e o unico jeito de iterar objeto em
      // ExtendScript; Object.keys nao existe.
      "guard-for-in": "off"
    }
  },

  // Cliente do painel UXP (Premiere Pro).
  {
    files: ["apps/premiere-uxp/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        require: "readonly",
        module: "writable",
        MotionProtocol: "readonly"
      }
    },
    rules: {
      "no-console": "error",
      "no-var": "off",
      "prefer-const": "off"
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
