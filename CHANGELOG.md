# Changelog

## Não lançado

Fase P0 (fundação) conforme `docs/MASTER_BUILD_SPEC.md` §39. Ainda não é release: `package.json` e os dois manifests continuam em `0.1.0`. A versão só sobe quando houver o que numerar, e a sincronização entre os quatro lugares que hoje repetem a versão à mão chega no CHMS-002.

### CHMS-001 — Baseline e rebranding

- **Baseline do starter registrado** em `docs/BASELINE_STARTER_0.1.0.md`: saída verbatim de `npm run check` (exit 0, 6/6 testes), ambiente, e inventário de `dist/` com SHA-256. Tag `starter-0.1.0` criada. A forma legível por máquina está em `tests/fixtures/dist-baseline-pre-rebrand.json`.
- **Renomeado de "CrossHost Toolkit" para "Moti.on".** Namespace `com.example.crosshosttoolkit.*` → `com.motion.plugin.*`; globais `CrossHostAE` → `MotionAE` e `CrossHostProtocol` → `MotionProtocol`; pacote npm `adobe-crosshost-plugin-starter` → `motion-plugin`. Prefixos reservados para os rigs que chegam no CHMS-009: `[MOTION_META_V1]`, `// MOTION_EXPRESSION v1 |`, `MOTION | `. Registrado em `docs/adr/0001-marca-e-namespace.md`.
- **Corrigido: o arquivo `.debug` do CEP ia parar em `dist/`.** `scripts/build.mjs` copiava a árvore de `src/` sem lista de exclusão, então a porta de depuração remota (8091) entrava no output de build. Agora é excluído, e `scripts/validate.mjs` falha se voltar.
- **Corrigido: `BUILD_INFO.json` podia mentir.** `name` e `version` eram literais hardcoded em `scripts/build.mjs`; agora vêm de `package.json`.
- **Corrigido: `scripts/validate.mjs` escrevia na raiz do repositório.** A cópia temporária usada para checar a sintaxe do `.jsx` era gravada como `.tmp-index-jsx-check.js` na raiz e removida num `finally` — se o processo morresse no meio, o arquivo ficava. Agora usa `os.tmpdir()`.
- **Removidos os `console.log` do ciclo de vida do plugin UXP**, proibidos pela §34. Os hooks continuam existindo porque o UXP os exige; o logger estruturado chega no CHMS-007.
- **Novas proteções:** `tests/brand.test.mjs` varre a árvore inteira contra os identificadores antigos, com allowlist documental que exige motivo escrito por entrada. `scripts/validate.mjs` assere os IDs definitivos nos manifests construídos. `tests/manifests.test.mjs`, que antes **fixava** os placeholders `com.example`, agora fixa os IDs reais.
- **`.gitattributes` adicionado** normalizando fim de linha, necessário porque o gate de paridade de bytes do CHMS-002 roda em Linux e Windows. `dist/` entrou no `.gitignore`: é saída derivada, reproduzível por `npm run build` a partir da tag.

### CHMS-002 — npm workspaces sem regressão

- **Migrado para npm workspaces.** `src/after-effects-cep` e `src/premiere-uxp` viraram `apps/*`; `src/shared/protocol.js` virou `packages/contracts/legacy/protocol.js`; `src/shared/theme.css` virou `packages/ui-core/src/theme.css`. `src/` deixou de existir. Foram criados **2 packages, não os 14** que a §7 prevê: um diretório vazio é o placeholder que a §0.5 proíbe. `docs/ARCHITECTURE.md` traz a tabela mapeando cada diretório adiado à issue CHMS que o cria.
- **TypeScript 6.0.3, ESLint 10.9.0, typescript-eslint 8.67.0**, sem nenhuma dependência de runtime. A escolha do TypeScript 6 e não do 7 é forçada: `typescript-eslint` declara peer `typescript <6.1.0` e não existe major mais nova, então o 7 custaria o lint com reconhecimento de tipos.
- **`npm run typecheck` verifica a camada ExtendScript de verdade.** `apps/after-effects-cep/tsconfig.host.json` roda `checkJs` com `lib: ["ES5"]` sobre o host, tipado por JSDoc mais `host/types/extendscript.d.ts`. O typecheck já encontrou 17 problemas reais na primeira execução.
- **`scripts/check-extendscript.mjs`**, novo: varre 17 construtos fora do subconjunto ExtendScript, normalizando comentários e literais antes para não gerar falso positivo. Tem teste positivo e negativo próprio em `tests/extendscript-subset.test.mjs` — um scanner sem teste protege menos do que aparenta.
- **`scripts/build-extendscript.mjs`**, novo: monta o host e emite `#target aftereffects` exatamente uma vez. A diretiva saiu do arquivo-fonte porque não é JavaScript válido e impedia `tsc` e `node --check` de lerem o host. É também o mecanismo de concatenação por ordem explícita que o CHMS-004 vai usar.
- **`tests/build-parity.test.mjs`**, novo: gate de aceite do CHMS-002. Compara o conjunto de caminhos e o SHA-256 de `dist/` contra `tests/fixtures/dist-baseline.json`. Arquivos que mudaram de propósito entram num mapa `ALLOWED_DIVERGENCE` que exige motivo escrito de no mínimo 40 caracteres, e um terceiro teste falha se uma divergência declarada voltar a ser idêntica — permissão morta esconderia a próxima mudança de verdade.

#### Mudança de comportamento neste commit

Removido o ramo `if (!app.project) { app.newProject(); }` de `createDemoComposition`. `app.newProject()` descarta o projeto aberto, não entra no histórico de Undo, e estava sendo chamado de dentro de um grupo de Undo. Na prática o ramo nunca disparava, porque o After Effects sempre expõe um `app.project`; era um risco latente de perda de dados sem nenhum ganho.

#### Correções de ferramenta encontradas durante a migração

- `scripts/build.mjs` copiava `.tsbuildinfo` para `dist/`; agora exclui artefatos do compilador por extensão, e o `tsc` foi reconfigurado para gravá-los fora da árvore dos apps.
- `packages/contracts/legacy/` recebeu um marcador `"type": "commonjs"`: o package declara `"type": "module"` para o código do CHMS-003, e sem o escopo o Node passava a interpretar o protocolo UMD como ESM, quebrando `root.MotionProtocol = factory()`.
- Duas correções apontadas pelo ESLint no host: escape desnecessário numa regex, e `hasOwnProperty` acessado direto do objeto em vez de `Object.prototype.hasOwnProperty.call` — um objeto vindo de dados pode mascarar o método.

## 0.1.0 — 2026-08-24

- Starter Premiere Pro UXP funcional para leitura do projeto e da sequência ativa.
- Starter After Effects CEP/ExtendScript funcional para leitura do contexto e criação de composição de teste.
- Contrato compartilhado de respostas, build sem dependências, validação, testes e CI.
