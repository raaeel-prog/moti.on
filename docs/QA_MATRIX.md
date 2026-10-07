# QA Matrix — Moti.on

Este arquivo registra gates de implementação que complementam
`docs/VERIFICATION_GATES.md`. `PASS` automatizado não substitui execução dentro
do After Effects ou Premiere Pro; tudo que não foi observado no host permanece
`NOT RUN`.

## Paleta grafite — 2026-09-28

| Gate | Estado | Evidência e limite |
|---|---|---|
| Tema escuro `#1D1D1D`, superfícies `#262626` e hover `#303030` | `PASS` automatizado | `npm run check` passou com 1.702/1.702 testes; contraste passou em 88 pares. O navegador confirmou a base `#1D1D1D`. |
| Tema claro, idiomas, layouts e altura reduzida | `PASS` no navegador | QA 25/25; 103 capturas/métricas de layout, nenhum transbordamento nas 80 combinações inspecionadas: 280/360/480/720 px, altura de 320 px, claro/escuro e pt-BR/en-US. |
| Nome do efeito no cartão de Ferramentas | `PASS` no navegador | Nome contido dentro do quadrado ao passar o cursor. Uma observação anterior no AE real confirmou a posição antes da troca de paleta; não valida as novas cores no host. |
| After Effects 2026 26.5x89/macOS | `PASS` parcial no host | Build atual instalado e AE reiniciado; painel Moti.on carregou e mostrou conexão no tema escuro, com aparência grafite. O SHA-256 do `styles/theme.css` instalado é igual ao do build. Cor de pixel no host não foi medida; Aplicar/Ajustar/Remover/Undo e demais fluxos não foram repetidos nesta rodada. |
| Premiere Pro 2026 26.5.1/macOS: instalação | `PASS` | A instalação do build atual pelo UPIA foi concluída; Moti.on 0.1.0 aparece como `Enabled`. |
| Premiere Pro 2026 26.5.1/macOS: painel | `NOT RUN` para esta paleta | O runtime do painel e as novas cores não foram observados no Premiere nesta rodada; instalação habilitada não confirma renderização. |

## Redesign dos painéis — checkpoint 2026-09-27

Esta seção descreve o checkpoint visual de 27/09. As seções `CHMS-UX-*` abaixo
registram outros checkpoints históricos; seus resultados não descrevem
automaticamente o build atual.

| Gate | Estado | Evidência e limite |
|---|---|---|
| Sistema visual `#212529`, temas e controles | `PASS` automatizado | `npm run check`: lint, typecheck, build, validação, 88 pares de contraste e 1.695/1.695 testes. Aliases existentes e contratos Adobe preservados. |
| Ferramentas, Presets Navegar/Editar e Configurações | `PASS` no navegador | Componentes de apresentação reais com dados de fixture explícitos; recuperação, rascunhos inválidos, foco, seleção desatualizada e respostas antigas: 24/24 verificações. Nenhum sucesso de comando Adobe é inferido. |
| Layouts, idiomas e temas | `PASS` no navegador | 103 combinações de layout/escala, incluindo 280/360/480/720 px, 280 × 320 px, claro/escuro e pt-BR/en-US. Sem transbordamento horizontal observado. Capturas PNG no diretório `artifacts/product-ui-20260927/`. |
| Escala ampliada e movimento reduzido | `PASS` no navegador | Escalas de 125/150/200% sem transbordamento; preferência de movimento reduzido exercitada no navegador. Isso não mede o renderer Adobe. |
| After Effects 2026 26.5.0.89/macOS | `PASS` parcial no host | Painel carregou e foi reaberto no app real; Ferramentas, Presets Navegar/Editar sem composição, Configurações, temas claro/escuro e pt-BR/en-US foram observados. Após a correção, Editar em inglês mostrou “Open a composition.” no host. O build final foi reinstalado e reiniciado; painel voltou conectado em pt-BR/Escuro. A tentativa de criar composição temporária encontrou timeouts no controle do aplicativo, sem salvar projeto. Aplicar, Ajustar, Remover, Undo, seleção de camada e persistência dos dados do projeto: `NOT RUN` nesta revisão. |
| Premiere Pro 2026 26.5.1.1/macOS: instalação | `PASS` | UPIA informou `Installation Successful` para Moti.on 0.1.0; extensão `Enabled` no Premiere. UXPLogs confirmou status enabled, mas não registrou `panel.started` ou `panel.shown`. |
| Premiere Pro 2026: painel e fluxos | `NOT RUN` no host | Um diálogo Adobe de erro de cobrança/atualização de pagamento bloqueou a inicialização. A automação de interface expirou sem recuperar o estado; painel, aparência, idiomas, temas e comandos não foram observados. Isto não estabelece falha do plugin. |
| Tecnologia assistiva, filtros de daltonismo e outros hosts | `NOT RUN` | Foco/contraste automatizados e capturas de navegador não substituem leitor de tela, filtros ou medição no host. |

Resultado deste redesign: implementação e navegador `PASS`; host Adobe `PARTIAL`.
Evidência detalhada em [entrega do redesign](../artifacts/product-ui-20260927/ENTREGA.md).

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

## CHMS-UX-007 — ponte interna de Live Controls no Premiere

| Gate | Estado | Evidência |
|---|---|---|
| Inspect/read/update/reveal em parâmetros existentes | `PASS` automatizado | 37/37 testes em `apps/premiere-uxp/tests/live-controls.test.mjs` |
| Paridade de ids, ordem, rótulos e slots | `PASS` automatizado | manifesto versionado; mismatch/duplicatas recusados antes de mutation |
| Valores suportados | `PASS` automatizado | slider, angle, color RGBA, checkbox, dropdown e point em dois slots escalares X/Y; PointF incompatível vira fallback |
| Preservação de animação | `PASS` automatizado | streams animados legíveis; update misto com alteração animada não escreve nada |
| Conflito e fila | `PASS` automatizado | fingerprint obrigatório; pedidos por Project serializados; payload capturado e fila recuperada após falha |
| Troca de componente após leitura | `PASS` automatizado | wrapper reobtido sob lock; identidade/contagens diferentes abortam sem transação |
| Transação/no-op/readback | `PASS` automatizado | Actions sob lock/transaction; no-op sem Undo; clamp informado; falha após commit diferenciada |
| Fallback e seleção | `PASS` automatizado | texto normativo, botão condicionado a APIs/sequence, Promise legado e boolean desde 26.3 |
| Cobertura do módulo compilado | `PASS` automatizado | 90,91 % linhas, 82,25 % branches, 98,04 % funções |
| Check integrado final | `PASS` automatizado | `npm.cmd run check`: 1035/1035 testes, lint, types, build, validate, 68 pares de contraste e 42 routing evals |
| Renderer/fixtures MOGRT CHMS-045 | `NOT RUN` | nenhum template real com versão/preset interno validado nesta fatia |
| Dispatcher e Inspector consumidores | `NOT RUN` | módulo interno não é importado pelo painel distribuído; fallback ainda não tem ligação na UI |
| Sincronização UX-008 e Undo por gesto | `NOT RUN` | ponte fornece leitura/fingerprint e transação por chamada, não polling/coalescing |
| Identidade/versão, domínio TickTime e wrappers reais | `NOT RUN` | wrapper diferente bloqueia conservadoramente; comportamento de UXP real precisa de fixture |
| Premiere 25.6/26.2/26.3+ Windows/macOS | `NOT RUN` | plugin fechado, Undo, localização e seleção ainda sem prova de host |
| Leitura 40 ms / commit 120 ms | `NOT RUN` | sem medição no host/dispatch real |

Pesquisa: `docs/research/premiere-live-controls.md`.

Evidência detalhada e roteiro real: `docs/evidence/CHMS-UX-007_TDD_EVIDENCE.md`.

Status agregado: `PARTIAL`; verificação do produto: `NOT READY`.

## Premiere — proteção de respostas por ciclo de vida

| Gate | Estado | Evidência |
|---|---|---|
| Tickets únicos, invalidate/dispose e busy | `PASS` automatizado | 11/11; cobertura 100 % no módulo puro |
| Bundle realmente consome a proteção | `PASS` automatizado | 8/8 em `panel-async-lifetime.test.mjs`; três falhas reproduzidas antes da correção |
| Contexto/probe/autoteste/export obsoletos | `PASS` automatizado | resultados/erros antigos não repopulam estado nem encerram operação atual |
| Exportação já autorizada | `PASS` automatizado | invalidar UI não finge cancelar gravação; status antigo é descartado |
| Check integrado do checkpoint | `PASS` automatizado | 1102/1102 testes, lint, typecheck, build, validate, contraste e skills |
| Reabertura/troca de projeto no Premiere real | `NOT RUN` | nenhum smoke ou captura deste patch no host |
| Polling/Inspector UX-008 | `NOT RUN` | este patch só corrige o ciclo de vida do painel existente |

Evidência e roteiro: `docs/evidence/PREMIERE_PANEL_ASYNC_LIFETIME.md`.

Status da correção: `IMPLEMENTED_NOT_HOST_VERIFIED`; UX-007/008 não são concluídos por este gate.
# Atualização incremental — 2026-09-10

Tema, densidade, favoritos, recentes, ações de configuração e grade 2/3/4:
build `PASS`; matriz visual e persistência nos hosts `NOT RUN`. O responsável
pediu priorizar implementação e reduzir testes. Evidências anteriores não
aprovam automaticamente estas adições. Ver [checkpoint macOS](HANDOFF_MACOS_2026-09-10.md).

## Motion Flow — 2026-09-13

37/37 testes focados, 29/29 verificações no After Effects 26.5x89 e arraste/aplicação real no CEP: PASS. Prévia, favoritos, persistência e responsividade: PASS em browser. Atalho Undo: NOT RUN. Check geral: FAIL (3 lint e 22 testes fora do Flow). Escopo e evidências em [Motion Flow](research/fxflow-motion.md).

## Dicas ancoradas — 2026-09-14

Build, lint dos arquivos alterados, 8/8 testes focados, validação estrutural, contraste e skills: PASS. Prévia da biblioteca real em 280/360/480/720 px: PASS (distância medida de 6 px). AE: NOT RUN para interação controlada após atualização; o usuário estava operando o aplicativo. Check geral: FAIL nos mesmos 3 erros iniciais de lint; suíte geral: 1188/1210 PASS, 22 falhas fora do tooltip. [Relatório](evidence/TOOLTIP_ANCHOR_2026-09-14.md).


## Lote nativo de 21/09/2026

Glitch, Wave, quatro presets nativos e Texture local: validação real AE26.5x89/macOS arm64 PASS. Build universal e 55 testes focados PASS. Bypass Wave comparado pixel a pixel em 8/16bits PASS; Undo Wave e save/reopen PASS. Suite geral:1283/1291, oito falhas de UI ainda abertas. Relatório e limites em `implementation/2026-09-20-native-core/entrega-2026-09-21.md`. Evidências em `artifacts/native-suite/`. GPU/MFR/32bits nativo, runtime Intel e Windows: NOT RUN/NOT SUPPORTED nesta entrega.

## Revisão de ferramentas — 21/09/2026

| Gate | Estado | Evidência e limite |
|---|---|---|
| Órbita: identidade, fase, parent, bake e rollback | `PASS` automatizado; host `PASS` parcial | Duas shapes em composição descartável: controller criado, camadas distribuídas e movimento observado ao mudar CTI; um Undo removeu o rig. Reuse, bake, save/reopen e conflitos no host: `NOT RUN`. |
| Cilindro | `PASS` automatizado; host `PASS` parcial | Uma shape duplicada em oito faces, câmera e controller visíveis; um Undo restaurou a fonte. Adjust, save/reopen e variações: `NOT RUN`. |
| Cubo | `PASS` automatizado; host `PASS` parcial | A primeira execução real recusou a shape Moti.on porque o código confundia bounds visíveis com tamanho da composição. Após correção e reinstalação, criou seis faces, preservou a fonte e um Undo restaurou a composição. Adjust, save/reopen e outras fontes: `NOT RUN`. |
| AI/Text to Vector: comando de menu e shape resultante | `PASS` automatizado; host `NOT RUN` | Seleção e rollback cobertos por doubles; conversão real pendente. |
| Partículas | `BLOCKED_BY_CAPABILITY`; host `NOT RUN` | O comando recusa de forma explícita até confirmar no AE os matchNames internos do CC Particle World; não informa sucesso fictício. |
| Clean | `PASS` automatizado; host `NOT RUN` | Prévia de leitura, token de scan, seleção explícita e remoção limitada a itens gerenciados; projeto real pendente. |
| Parallax Adjust e ordem seleção/timeline | `PASS` automatizado; host `NOT RUN` | Adjust envia modo avançado mutante; ordenação coberta por teste. |
| Look At: seis eixos e correção angular | `PASS` automatizado; host `PASS` parcial | Câmera selecionada, alvo shape, eixo `+Y` e offset X de 45°: o AE aceitou a expressão, Orientation mostrou valores avaliados não nulos; um Undo voltou a zero. Outros eixos, câmera de dois nós/um nó e persistência: `NOT RUN`. |
| §16 `create-null` / `set-focus` | `NOT IMPLEMENTED` | Exigem migração de identidade e reparo seguro; decisão proposta em `docs/adr/0004-identidade-e-reparo-do-rig-parallax.md`. |
| Check integrado deste build | `PASS` automatizado | `npm run check`: lint, typecheck, build, validação, 88 pares de contraste, 1364/1364 testes e validação das 14 skills. |
| AE 26.5.0.89 / macOS 27.2 arm64: painel inicial | `PASS` | A extensão abriu conectada em projeto vazio, antes e depois da instalação final. |
| AE 26.5.0.89: criar composição descartável | `PASS` pelo menu; falha inicial registrada | O botão de onboarding causou uma queda inicial no fluxo nativo `CProject::DoNewComp`, antes de invocar o Moti.on; depois, criar pelo menu Composição funcionou duas vezes. Causalidade da queda não estabelecida. Relatório: `~/Library/Logs/DiagnosticReports/After Effects-2026-09-21-210830.ips`. |

Status agregado desta revisão: `PARTIAL`. Órbita e Cilindro receberam smoke real no build anterior à correção final do Cubo; o código deles não mudou entre as duas instalações. Cubo e Look At receberam smoke real após a correção. Os testes reais citados não substituem bake, Adjust, persistência, outras versões/SO ou toda a cobertura do MD. Evidência de versões/builds anteriores não é transferida automaticamente para estas alterações.


## Efeitos de texto — 2026-09-24

| Caso | Resultado | Evidência |
|---|---|---|
| Word Box Reveal: Apply/Adjust/Remove, rejeição de parágrafo, expressões e renders | PASS — AE 26.5x89/macOS 27.2 | `artifacts/video-effects-2026-09-24/word-reveal-host-results.json` |
| Variable Morph: eixo real, nulo selecionado no centro, proximidade, ajuste/remoção, fonte incompatível | PASS — AE 26.5x89/macOS 27.2 | `artifacts/text-effects-20260924/morph-host-results.json` |
| Style Swap: alinhamento, caractere/palavra, ajuste/remoção, originais | PASS — AE 26.5x89/macOS 27.2 | `artifacts/text-style-swap-20260924/host-results.json` |
| Undo de um passo | PASS — as três funções | `undo-results-initial.json` (Word/Swap) e `undo-results.json` (Morph), em `artifacts/text-effects-20260924/` |
| Painel 280/360/480/720 px | PASS — 12 cenários | `artifacts/text-effects-20260924/ui-results.json` |
| Salvar/reabrir projeto com os novos rigs | NOT RUN | Não foi substituído o projeto aberto do usuário. |

[Relatório desta entrega](implementation/2026-09-24-text-effects/verification.md).

## Suavização dedicada — 02/10/2026

Check completo PASS: 1.881/1.881 testes. Chromium com bundle de produção PASS: 21 cenários e 22 capturas, incluindo grade retirada do Quick, oito ações, curva por arraste/teclado, responsividade e recuperação de falhas. AE 26.5x89/macOS 27.2 PASS: dez cenários de ações, sete de suavização e dois de Undo nativo em uma etapa. Instalação PASS: 43 arquivos iguais ao build, com backup. Outras versões/SO e salvar/reabrir: NOT RUN. [Relatório e evidências](implementation/2026-10-02-smoothing-tool.md).


## Evolução Onyx — 03/10/2026

Check integrado PASS (1.906 testes); browser com fronteiras Adobe simuladas PASS; comandos de easing e ações de keyframes no AE26.5x89 PASS. Interface de Suavização após recarga no AE PASS visual. Undo nativo e Premiere real NOT RUN. Último check do workspace FAIL (1.905/1.906): mudança concorrente no host Encarar aplica o próprio alvo quando misturado com outra camada; fonte não editada nesta entrega. Evidências e delimitação: [entrega Onyx](implementation/2026-10-03-onyx-components.md).


## Encarar compartilhado — 03/10/2026

Check completo PASS: 1.913 testes. Quick PT-BR/inglês PASS: clique e teclado sem editor, uma ativação e seleção vazia bloqueada. AE 26.5x89/macOS 27.2 PASS: oito cenários de alvo compartilhado, cinco seguidores 2D, correção de 90°, seletor no nulo, reaplicação, parents e 3D, sem conversão indevida. Instalação PASS: 43 arquivos iguais ao build. Undo nativo NOT RUN (menu indisponível durante a fixture); rollback e grupo único PASS no harness. A falha de Encarar registrada na entrega Onyx anterior foi corrigida. [Relatório e evidências](implementation/2026-10-03-look-at-controller.md).


## Órbita compartilhada — 03/10/2026

Check completo PASS: 1.961 testes. Chromium PASS: dez grupos em PT-BR/inglês e quatro larguras. AE 26.5x89/macOS 27.2 arm64 PASS: nove cenários de órbita/controles/reaplicação/Bake, mais duas provas de rollback nativo. Seleção/CTI preservados; composições temporárias removidas. Instalação PASS: 43 arquivos iguais ao build. Preview/clique após recarga e Undo nativo NOT RUN porque o Mac ficou bloqueado; persistência e outras versões/SO NOT RUN. [Relatório e evidências](implementation/2026-10-03-orbit-controller.md).

## Morph por proximidade — fontes comuns e variáveis — 04/10/2026

| Gate | Estado | Evidência e limite |
|---|---|---|
| Check antes/depois | `PASS` automatizado | Baseline 2.008/2.008; final 2.053/2.053, com lint, tipos, build, contratos, contraste e skills. [Check final](../artifacts/proximity-morph-20261004/final-check.log). |
| Dois motores e oito presets | `PASS` no AE 26.5x89/macOS | Nove cenários principais; Arial, Times New Roman, Impact e Inter Tight, `B8OQ ação i.j`, múltiplas linhas, tracking negativo e parents 2D. [Matrix nativa](../artifacts/proximity-morph-20261004/native-results.json); [32/32 inspeções de presets](../artifacts/proximity-morph-20261004/native-visual-review.md). |
| Influência zero e live/Bake | `PASS` no host | 12/12 comparações de pixels: vetor com diferença restrita ao antialiasing, variável idêntico; amostras live/Bake conservaram suporte e aparência. A precisão entre quadros tem verificação de valores separada. [Medição](../artifacts/proximity-morph-20261004/pixel-results.json). |
| Compatibilidade v1, leitura, atualização e rollback | `PASS` no host | 9/9 cenários adicionais: Apply/Read/Remove legado, migração com easing/expressões, recusas 3D/paragraph/estilo misto/129 caracteres, sweep protegido, falha de extração e limite de vértices sem mudança parcial. [Relatório](../artifacts/proximity-morph-20261004/native-extras-results.json). |
| Posição separada, parent e conteúdo externo | `PASS` no host | 4/4 guards: origem com posição separada nos dois motores, nulo parentado e retenção por Layer Control externo. [Relatório](../artifacts/proximity-morph-20261004/native-guards-results.json). |
| Undo e persistência | `PASS` no host, escopo delimitado | Um Undo restaura origem, ID e CTI; dez rigs ao vivo da demo passaram em salvar/reabrir. Dois rigs baked também passaram: 18 propriedades no vetor e 17 no variável, com keyframes e valores de subquadros preservados. [Undo](../artifacts/proximity-morph-20261004/native-undo-results.json); [demo](../artifacts/proximity-morph-20261004/demo-results.json); [persistência baked 2/2](../artifacts/proximity-morph-20261004/native-persistence-results.json). |
| Atualização de família e base dos eixos | `PASS` no host | Arial → Times no vetor e Inter Tight Regular 400 → Bold 700 no variável; a base passou a 700, mantendo identidade do nulo e easing de 55%. [Relatório](../artifacts/proximity-morph-20261004/native-persistence-results.json). |
| Regressão da Revelação com caixas | `PASS` no host | 52/52 PNGs idênticos em RGBA ao baseline, cobrindo 13 endpoints/caixas/intermediários após compartilhar a extração. [Medição](../artifacts/proximity-morph-20261004/word-regression/pixel-results.json). |
| Aplicação, preview e Bake de 16/128 glifos | `PASS` nos lotes medidos | Quatro lotes dentro do orçamento, com duração registrada. Bake de 128 glifos variáveis passou em dois quadros; seis quadros excederam 120.000 amostras e foram recusados antes de criar animadores baked. Não aprova Bake longo nem preview em tempo real. [Desempenho](../artifacts/proximity-morph-20261004/performance-results.json); [diagnóstico de 128VF/6 quadros](../artifacts/proximity-morph-20261004/performance-128-diagnostic.json). |
| Painel, traduções e responsividade | `PASS` no Chromium | Cinco grupos: PT em 280/360/480/720 px e EN em 360 px, 20 capturas, oito presets, sweep, stale/baked, locks e eixos disponíveis, sem overflow ou erros. Transporte CEP simulado. [Relatório](../artifacts/proximity-morph-20261004/ui-results.json); [inspeção](../artifacts/proximity-morph-20261004/ui-visual-review.md). |
| Painel CEP real após instalação | `PASS: 7/7` | Quick Apply comum em Automático; varredura de 48 quadros com dois keyframes; Bake com estado baked; Atualizar com o mesmo nulo e dois keyframes, geometria reconstruída; Remover comum com origem visível; Apply variável em Automático com duas camadas e origem visível; Remover variável. [Registro](../artifacts/proximity-morph-20261004/installed-panel-results.json); [revisão do painel](../artifacts/proximity-morph-20261004/installed-panel-review.md). |
| Instalação e backup | `PASS` | 43/43 arquivos por SHA-256; extensão anterior em [backup](../artifacts/install-backups/ae-20261004-141459/previous/); presets extras antigos preservados. [Inventário](../artifacts/proximity-morph-20261004/installed-bundle-results.json); [instalação final e novo backup](../artifacts/proximity-morph-20261004/install-final.log). |
| Projeto e vídeo de demonstração | `PASS` | [Projeto `.aep`](../artifacts/proximity-morph-20261004/proximity-morph-demo.aep) com dois motores e oito presets editáveis, [vídeo](../artifacts/proximity-morph-20261004/proximity-morph-demo.mp4) exportado pelo render nativo. Os 180 quadros foram decodificados; três instantes foram inspecionados visualmente. Isso não constitui revisão visual de todos os quadros. [Render](../artifacts/proximity-morph-20261004/render-results.json); [verificação MP4](../artifacts/proximity-morph-20261004/video-verification.json). |
| Outras versões/SO e fontes fora do escopo | `NOT RUN` | A prova cobre AE 26.5x89/macOS e os fixtures registrados. Ligaturas, fontes coloridas/bitmap e textos complexos não têm suporte universal. Morph Regular/Bold entre arquivos separados permanece fora desta etapa. |

[Entrega e delimitação da compatibilidade](implementation/2026-10-04-proximity-morph.md).
