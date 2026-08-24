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

### CHMS-004 — Dispatcher único do After Effects

O commit crítico de segurança do P0. `evalScript` recebe uma **string de código** que o After Effects avalia com acesso total ao projeto e ao sistema de arquivos do usuário; o starter montava essa string por concatenação. Funcionava porque não havia argumento — no primeiro comando com parâmetro, viraria injeção de código.

- **`MotionAE.dispatch` é o único ponto de entrada.** `scripts/validate.mjs` verifica no build: exatamente um `evalScript(` no bundle do cliente e exatamente um `global.MotionAE =` no host. Um teste adicional fixa o conjunto completo de globais do host, para que um caminho paralelo ao dispatcher não apareça sem justificativa.
- **`encodeForEvalScript` produz sempre ASCII imprimível.** Escapa `\`, `"`, **todo** caractere abaixo de U+0020 e **todo** caractere acima de U+007E — inclusive acentos comuns. Este último ponto é o menos óbvio: o canal do `evalScript` não tem codificação garantida e no Windows o ExtendScript decodifica pela codepage do sistema, então `"Composição"` atravessaria corrompido em máquinas com codepage diferente — e corrompido de um jeito que só aparece na máquina do usuário. A função tem pós-condição assertada: se um caractere escapar da regra, ela lança em vez de emitir código.
- **`MotionJson`**, parser e serializador JSON em ES5 para o host, sem `eval`. Profundidade máxima 64 (o ExtendScript não tem proteção de pilha útil: profundo o bastante derruba o aplicativo em vez de lançar erro reportável), entrada máxima 4 MB, e recusa `__proto__`, `constructor` e `prototype` como chave. Aplica a **mesma** tabela de escape do painel, e um teste compara as duas saídas caractere a caractere.
- **Ordem de validação da §8, imposta pela estrutura.** Parse → versão de protocolo → descriptor → consentimento para operação destrutiva → `preflight` → grupo de Undo → `run`. Toda validação acontece com o projeto ainda intacto: um comando que valida no meio da execução já alterou o projeto quando descobre que não devia ter começado.
- **A regra do `ok` é do dispatcher, não de cada comando.** A §8 diz que `ok: true` nunca acompanha ausência de alteração; aqui isso é `ok = !descriptor.mutates || result.changed === true`. Um comando que ache que fez algo não consegue afirmar sucesso sozinho.
- **Registry separado dos descriptors.** O comando registra `preflight` e `run`; se é destrutivo, se muta e qual o rótulo de Undo vem do descriptor gerado. Um comando que declarasse a própria destrutividade colocaria `destructive: false` a um caractere de distância do código que apaga dado do usuário.
- **Cliente com correlação por `requestId`.** Resposta com id desconhecido é **descartada** com log — acontece de verdade, porque um `evalScript` que estourou o timeout ainda chama o callback depois, e entregá-la mostraria ao usuário o resultado da operação errada. O timeout **nunca afirma que nada aconteceu**: `evalScript` não tem cancelamento, então a mensagem manda conferir o histórico de Desfazer.
- **Três comandos reais**: `ae.context.read`, `ae.demo.createComposition` e `ae.diagnostics.echo`. O terceiro é o botão **Verificar ponte com o host** em System Check: manda um valor com acento, CJK, emoji e aspas e confere a volta. É a única forma de saber se os escapes estão íntegros *naquela máquina, com aquela codepage*. Sem ele, um usuário com o painel quebrado só teria "não funciona" para relatar.
- **O cliente passou a ser empacotado** pelo esbuild a partir de TypeScript. Não foi para "ter um bundler": a alternativa era reimplementar o escape dentro do painel, e uma segunda cópia da única função que impede injeção de código no host é exatamente a duplicação que este projeto não pode ter.
- **`context.locale`**, campo opcional novo, para que o rótulo em `Edit > Undo` saia no idioma do usuário — o rótulo é escrito pelo host, que não alcança a i18n do painel. Campo opcional não sobe `PROTOCOL_VERSION`, conforme `docs/adr/0002`.
- **`docs/HOST_LIMITATIONS.md`**, novo: os 12 itens `IMPLEMENTED_NOT_HOST_VERIFIED`, o que já está verificado e por qual mecanismo, e o roteiro de 5 passos que fecha os itens 1, 2, 4 e 9 numa única sessão dentro do After Effects.

101 testes passando. Nenhum deles prova que o painel carrega no After Effects — isso está na página de limitações, e continua aberto.

### CHMS-003 — Package `contracts`

- **`packages/contracts`** define o contrato de comandos da §8: `CommandRequest`, `CommandResponse`, `CommandWarning`, `CommandFailure`, `CommandContext`, `CommandOptions` e `CommandTiming`, mais `HostCapabilities` (§9) e `RigMetadata` (§11).
- **Os 22 códigos de erro da §8** como tupla `readonly` com união derivada — não `const enum`, que quebra com `isolatedModules` e não é consumível pelo módulo ES5 do ExtendScript. `ERROR_META` é `Record<ErrorCode, …>`, então acrescentar um código sem decidir se é recuperável e qual a ação corretiva não compila.
- **Dois apertos em relação ao texto da especificação**, ambos estreitando o contrato: `CommandFailure.code` é a união fechada `ErrorCode` e não `string`, então um comando não consegue inventar um código na hora em que falha; e `CommandFailure.action` é chave i18n e não frase, sem o que todo erro seria monolíngue apesar de a §22.3 exigir pt-BR e en-US desde o início.
- **Ponte para o envelope legado**: `fromLegacy`, `toLegacy` e `LEGACY_CODE_MAP` traduzem os códigos que os dois hosts inventavam (`AE_CONTEXT_ERROR`, `PREMIERE_CONTEXT_ERROR`, `SELF_TEST_FAILED` e os três de resposta malformada) para a lista fechada. Quando a tradução perde informação — `AE_CREATE_COMP_ERROR` e `AE_CONTEXT_ERROR` viram ambos `HOST_OPERATION_FAILED` — o código original sobrevive em `details`, porque os dois pedem investigação diferente.
- **Módulo ES5 gerado** em `apps/after-effects-cep/host/generated/motion-contracts.jsx`. O ExtendScript não importa TypeScript e não tem módulos, então o contrato existe duas vezes; a segunda cópia é gerada e nunca escrita à mão. `generated-drift.test.mjs` falha se sair de sincronia, e roda o mesmo scanner de subconjunto ExtendScript usado nos fontes escritos à mão — código gerado não está acima da regra.
- **`docs/adr/0002-versionamento-do-protocolo.md`**: o que faz e o que não faz `PROTOCOL_VERSION` subir, e a regra de que envelope de versão diferente é **recusado**, nunca interpretado da melhor forma possível — adivinhação é o que produz corrupção silenciosa de projeto.
- **ESLint passou a analisar TypeScript** via `typescript-eslint`, sem checagem com informação de tipo: `npm run typecheck` já roda o `tsc` completo e é a autoridade sobre tipos; duplicar isso no lint dobraria o tempo sem achar nada novo.

**Adiado com motivo:** JSON Schema e validadores Ajv. Nada valida pedido até o dispatcher do CHMS-004 existir, e schema sem ponto de chamada é código que o `check` carrega mas não exercita. Quando entrar, terá de ser codegen standalone em tempo de build — a §24 proíbe `allowCodeGenerationFromStrings` e o compilador padrão do Ajv usa `new Function`.

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
