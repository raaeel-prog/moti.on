# QA Matrix — Moti.on

Este arquivo registra gates de implementação que complementam
`docs/VERIFICATION_GATES.md`. `PASS` automatizado não substitui execução dentro
do After Effects ou Premiere Pro; tudo que não foi observado no host permanece
`NOT RUN`.

## CHMS-UX-001 — UI tokens

| Gate | Estado | Evidência |
|---|---|---|
| Addendum anexado sem perda de conteúdo | `PASS` automatizado | `tests/addendum.test.mjs`; SHA-256 byte a byte `7BE27FB642B5346A797AD28F8C90371311A90F50B1A138CF00C68B1463D01A1D` |
| Package `@motion/ui-tokens` | `PASS` automatizado | TypeScript build e testes de contrato do CSS/JSON |
| Drift package → tema CEP/UXP → shared | `PASS` automatizado | `packages/ui-tokens/tests/tokens.test.mjs` |
| Contraste escuro/claro | `PASS` automatizado | 68 pares; texto 4,5:1, componentes/foco 3:1 |
| Base Adobe | `PASS` automatizado | alias de canvas fixado em `#1D1D1D` no tema escuro |
| Tema claro selecionado pelo host | `NOT RUN` | CSS existe; integração/observação em runtime de host ainda não executada |
| 280 / 360 / 480 / 720 px | `NOT RUN` | capturas após a troca de tokens ainda não produzidas |
| Escala 100 / 125 / 150 / 200 % | `NOT RUN` | requer execução visual |
| NVDA / Narrator / VoiceOver | `NOT RUN` | ARIA/CSS automatizados não provam anúncio real |
| Filtros de daltonismo | `NOT RUN` | capturas ainda pendentes |
| After Effects real | `NOT RUN` | nenhum smoke deste patch visual foi executado |
| Premiere Pro real | `NOT RUN` | nenhum smoke deste patch visual foi executado |

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## CHMS-UX-002 — movimento

| Gate | Estado | Evidência |
|---|---|---|
| Package `@motion/ui-motion` | `PASS` automatizado | TypeScript build; API pública e CSS canônico em `packages/ui-motion/` |
| Catálogo A6.2 completo | `PASS` automatizado | 25 IDs na ordem normativa, propriedades, tokens, duração e fallback reduzido verificados por `catalog.test.mjs` |
| `transition: all` e animação de layout proibidos | `PASS` automatizado | `css.test.mjs` inspeciona transições e keyframes |
| Preferência efetiva SO `OR` toggle interno | `PASS` automatizado | controller puro, listeners moderno/legado, falhas de storage e getters hostis cobertos |
| Settings → Interface → Reduzir movimento | `PASS` automatizado | view e controle presentes nos clientes AE/CEP e Premiere/UXP; persistência `localStorage` feature-detected |
| CSS distribuído nos dois hosts | `PASS` automatizado | build concatena `theme.css` + `motion.css` antes de gerar ambos os painéis |
| Cobertura do package | `PASS` automatizado | 20/20; 100 % linhas/funções e 97,78 % branches |
| After Effects real | `NOT RUN` | toggle, persistência, `matchMedia` e render visual ainda não observados em CEP |
| Premiere Pro real | `NOT RUN` | toggle, persistência e descarte do listener ainda não observados em UXP |
| 0 quadros perdidos / 200 tools / até 40 nós | `NOT RUN` | pertence ao harness de performance CHMS-UX-017 |
| Informação preservada em movimento reduzido | `NOT RUN` | contrato CSS passa; revisão visual e leitor de tela no host continuam pendentes |

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## CHMS-UX-003 — kit de componentes

| Gate | Estado | Evidência |
|---|---|---|
| Tile, botão, slider, chip, popover, gaveta e toast | `PASS` automatizado | API pública em `packages/ui-core/src/components.ts`; 37/37 testes focados |
| Estados `default/loading/empty/success/warning/error/unsupported` | `PASS` automatizado | estado não padrão exige texto; indisponibilidade exige motivo e permanece bloqueada em runtime |
| Quick / Advanced / preview e grid roving | `PASS` automatizado | clique/`Alt`+clique, `Enter`, `Alt+Enter`, preview remapeável/desligável, setas, `Home` e `End` cobertos sem dupla ativação |
| Feedback do tile | `PASS` automatizado | spinner após 180 ms, confirmação por 700 ms, marca aplicada `●` em accent e indisponibilidade com forma |
| Slider acessível sem gesto obrigatório | `PASS` automatizado | range + número + unidade; passo, passo grosso, 10 %, limites e reset cobertos |
| Popover/gaveta e retorno de foco | `PASS` automatizado | `Esc`, trap somente em overlay, ordem DOM e timeout sem `animationend` cobertos |
| Toast | `PASS` automatizado | ação ≥ 8 s, pin por foco, erro recuperável indefinido, máximo 3 e timeout sem animação |
| Compatibilidade CSS documentada para UXP | `PASS` automatizado | folha sem CSS Grid, `:is`, `:focus-visible`, `:focus-within`, shorthand `font` ou dependência de transition; layout Flexbox |
| CSS distribuído nos dois hosts | `PASS` automatizado | `scripts/build.mjs` concatena `components.css`; temas AE/Premiere idênticos no SHA-256 `3853C5ADA91D6CFA27717F0C712757320F973BAE8A2443D8DF82C863BA6EDD52` |
| Cobertura de `components.js` | `PASS` automatizado | 98,90 % linhas, 93,67 % branches, 97,73 % funções |
| ARIA no Premiere UXP | `PARTIAL` documentado | Adobe marca `aria*` sem suporte; texto, forma, controle nativo e teclado são fallback, sem promessa de leitor de tela |
| Tela de produto consumindo o kit | `NOT RUN` | esta issue entrega as primitivas; migrações/fluxos concretos entram nas issues UX consumidoras |
| 280 / 360 / 480 / 720 px e escala 100–200 % | `NOT RUN` | nenhum render/captura deste kit foi executado |
| NVDA / Narrator / VoiceOver e `axe-core` | `NOT RUN` | contrato DOM não substitui tecnologia assistiva nem auditoria da tela final |
| Filtros de daltonismo | `NOT RUN` | dependem das capturas das telas consumidoras |
| After Effects real | `NOT RUN` | nenhum smoke CEP deste kit foi executado |
| Premiere Pro real | `NOT RUN` | Flexbox, foco, tabindex, overlays e timeouts ainda não foram observados no UXP |

Pesquisa: `docs/research/premiere-uxp-component-dom-capabilities.md`.

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## CHMS-UX-004 — QuickProfile e preset schema v2

| Gate | Estado | Evidência |
|---|---|---|
| Tipos `QuickProfile`, `QuickContext` e `LiveControlBinding` | `PASS` automatizado | exports públicos de `@motion/contracts`; compilação TypeScript estrita |
| Registry por comando/host | `PASS` automatizado | perfil imutável, destrutivos/duplicatas recusados e ordem preservada; 5/5 testes focados |
| Paridade adapter ↔ perfil | `PASS` automatizado | comparação exige `paramId` e `order` na mesma sequência |
| Schemas de preset v1/v2 | `PASS` automatizado | JSON Schema Draft 2020-12, Ajv standalone e teste de drift CSP-safe |
| Preview v2 obrigatório | `PASS` automatizado | preset sem `poster`, `loop`, fixture ou checksum é recusado |
| Migração v1→v2 | `PASS` automatizado | não muta origem, converte preview legado, exige enriquecimento e não reaproveita assinatura/checksum |
| Round-trip v1→v2→v1 | `PASS` automatizado | fixture legada restaurada integralmente com material criptográfico explícito por versão |
| Preset remoto | `PASS` automatizado | assinatura presente não basta; verificador confiável é obrigatório e campos executáveis são recusados |
| Opções Quick no cliente/AE/Premiere | `PASS` automatizado | defaults no cliente e gates simétricos; harnesses 19/19, 23/23 e 29/29 |
| Cobertura dos módulos novos | `PASS` automatizado | validators 85,32 % e registry 80,74 % de linhas |
| Perfis concretos por comando | `NOT RUN` | cadastro depende de derivação/presets/previews das issues UX-005 e UX-011 |
| After Effects real | `NOT RUN` | envelope ampliado ainda não foi enviado por CEP real |
| Premiere Pro real | `NOT RUN` | envelope ampliado ainda não foi enviado por UXP real |

Evidência detalhada: `packages/contracts/CHMS-UX-004_TDD_EVIDENCE.md`.

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## CHMS-UX-005 — derivador contextual de defaults Quick

| Gate | Estado | Evidência |
|---|---|---|
| Derivador puro e API pública | `PASS` automatizado | `deriveQuickDefaults` recebe snapshot explícito e não usa host, storage, relógio ou estado global |
| Matriz FPS × resolução | `PASS` automatizado | fixtures em 24/25/29,97/60 fps e 1080×1920/1920×1080/3840×2160 |
| CTI, duração e stagger | `PASS` automatizado | janela limitada pela composição/seleção; span do stagger nunca excede os frames disponíveis |
| Seleção, keyframes e eixos | `PASS` automatizado | texto/shape/AV, ordem estável, modo de animação e 2D/3D cobertos |
| Fallback de preset | `PASS` automatizado | projeto → global → fábrica; ids fora do catálogo nunca são escolhidos |
| Intenção de rig | `PASS` automatizado | `create`, `adjust` com id único e `ambiguous` para ids distintos |
| Fronteira de entrada | `PASS` automatizado | accessors não executados; Proxy, arrays esparsos/decorados, Symbols, protótipos e campos extras recusados |
| Cobertura de `quick-defaults.js` | `PASS` automatizado | 13/13; 95,31 % linhas, 87,34 % branches e 100 % funções |
| Check integrado do worktree | `PASS` automatizado | `npm.cmd run check`; 941/941 testes, além de lint, typecheck, build, validação, contraste e skills |
| Perfis Quick concretos | `NOT RUN` | publicação depende de presets e previews reais de UX-011 |
| Produtor de `QuickContext` nos hosts | `NOT RUN` | integração fica para os fluxos consumidores; médias não substituem out-points individuais |
| After Effects real | `NOT RUN` | nenhuma aplicação Quick deste derivador foi observada em CEP real |
| Premiere Pro real | `NOT RUN` | nenhuma aplicação Quick deste derivador foi observada em UXP real |

Evidência detalhada: `packages/command-registry/CHMS-UX-005_TDD_EVIDENCE.md`.

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## CHMS-UX-006 — Live Controls no After Effects

| Gate | Estado | Evidência |
|---|---|---|
| Writer dos seis tipos A2.3 | `PASS` automatizado | 14/14 em `apps/after-effects-cep/tests/live-controls.test.mjs`; criação por matchName e propriedade `(1)` |
| Ordem, nome localizado e unidade | `PASS` automatizado | bindings fora de ordem, unidade e colisão com sufixo de rig cobertos |
| Dropdown e fallback | `PASS` automatizado | handle retornado obrigatório; capability ausente troca para Slider e emite warning |
| Reader e fingerprint | `PASS` automatizado | vetor por paramId; nome + matchName antes de índice + matchName |
| Reorder e rename/relink | `PASS` automatizado | reorder atualiza índice; rename só atualiza nome após Religar explícito |
| Adjust e overrides | `PASS` automatizado | valor manual e keyframes preservados; missing recriado isoladamente |
| Órfãos | `PASS` automatizado | efeito e registro preservados; `CONTROLS_ORPHANED`, sem remoção silenciosa |
| Rollback | `PASS` automatizado | writer, updater e relink cobertos; falha da restauração vira `ROLLBACK_FAILED` |
| Limites 12/24 e promoção | `PASS` automatizado | plano layer/controller/Control Room/câmera e recusa pré-mutation |
| Entrada hostil | `PASS` automatizado | tipos, opções, pipe, duplicatas, caracteres de controle e ids de prototype recusados |
| Bundle e subset ExtendScript | `PASS` automatizado | módulo em `HOST_SOURCE_ORDER`, ES3 scanner, typecheck e build verdes |
| Check integrado do worktree | `PASS` automatizado | `npm.cmd run check`; 966/966 testes, contraste e skills incluídos |
| Cobertura numérica do `.jsx` | `NOT MEASURED` | harness usa `new Function`; V8 não atribui linhas do fonte avaliado |
| After Effects 25/26 real | `NOT RUN` | criação/leitura/relink ainda não executados no host |
| Plugin fechado e host localizado | `NOT RUN` | editabilidade e independência de idioma exigem projeto real |
| Undo em um passo | `NOT RUN` | requer comando consumidor dentro do dispatcher real |
| 300 ms criação / 40 ms leitura | `NOT RUN` | precisa da máquina de referência e composição real |

Pesquisa: `docs/research/after-effects-live-controls.md`.

Evidência detalhada: `docs/evidence/CHMS-UX-006_TDD_EVIDENCE.md`.

Status agregado: `IMPLEMENTED_NOT_HOST_VERIFIED`.
