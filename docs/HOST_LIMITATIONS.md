# Limitações verificadas e o que ainda não foi executado em host real

> Entregável 10 da §39 do master spec. Nada nesta página é descrito como funcionando em host real sem execução observada. `npm run check`, pesquisa oficial e testes com doubles não substituem After Effects ou Premiere Pro abertos com **este build**.

## Como ler os status

Há dois eixos independentes:

- implementação: `IMPLEMENTED_AND_VERIFIED`, `IMPLEMENTED_NOT_HOST_VERIFIED`, `PARTIAL`, `BLOCKED_BY_CAPABILITY`, `BLOCKED_BY_PRODUCT_DECISION` ou `NOT_IMPLEMENTED`;
- execução: `PASS` (executado e aprovado), `FAIL` (executado e reprovado) ou `NOT RUN` (não executado no escopo declarado).

Uma pesquisa oficial pode sustentar uma API e continuar `NOT RUN` no host. Uma medição feita com extensão equivalente pode ser `PASS` ou `FAIL` para aquele experimento e continuar `NOT RUN` para o build atual.

## Resumo do build atual

| Gate | Implementação | Execução neste build | Evidência disponível |
|---|---|---|---|
| Contrato v1: JSON Schemas/validadores | `IMPLEMENTED_AND_VERIFIED` | `PASS` automatizado | Quatro schemas Draft 2020-12, geração standalone e guards profundos no check integrado de 2026-08-25 |
| After Effects: carregamento/bootstrap | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | AE 26.3x87/CEP 12.0.1/Windows 11: `<ScriptPath>` falhou com modal; depois da remoção, inicialização limpa e `$.evalFile` passaram |
| After Effects: round-trip Unicode | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Botão do build atual preservou português, japonês, emoji, aspas e barras |
| After Effects: Undo da composição de teste | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Um único Ctrl+Z removeu `Moti.on Demo`; menu exibiu o rótulo pt-BR esperado após correção de locale |
| After Effects: Smooth (`ae.expression.smooth`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Aplicou, reaplicou como no-op e substituiu tokens numa propriedade com 3 keyframes; Ctrl+Z de um passo para este comando: `NOT RUN` |
| After Effects: Wiggle (`ae.expression.wiggle`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Aplicou em propriedade **sem keyframes**, reaplicou como no-op e trocou a semente; reprodutibilidade entre camadas e Ctrl+Z deste comando: `NOT RUN` |
| After Effects: Flicker (`ae.expression.flicker`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Aplicou em 1D e 2D na mesma seleção sem `expressionError`; valor avaliado saiu escalar e array respectivamente. Cor e 3D em host: `NOT RUN` |
| After Effects: payload acima de 60.000 caracteres codificados | `PARTIAL` | `NOT RUN` | Rejeição tipada implementada; transporte por arquivo temporário ausente |
| After Effects: Caixa de texto (`ae.text.box`) | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | 15 testes de host em doubles cobrem criação, idempotência estrutural, rollback e recusa de argumento; nada executado no After Effects (item 16) |
| Premiere: painel, contexto e capabilities | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | APIs verificadas em documentação e doubles |
| Premiere: versão/locale do host | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | `require("uxp").host.version`/`.uiLocale` documentados para 25.6+ |
| Premiere: transações/Undo | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | Ordem `lockedAccess` → `executeTransaction` coberta por doubles |
| Premiere: exportação de diagnóstico | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | Picker e `File.write` documentados; host real não executado |
| CHMS-009: núcleo puro de metadata de rigs | `IMPLEMENTED_NOT_HOST_VERIFIED` | `PASS` automatizado / host `NOT RUN` | 24/24 testes focados; sem integração `Layer.comment`, filesystem ou Undo real |
| UI responsiva e visual | `IMPLEMENTED_NOT_HOST_VERIFIED` | `PASS` parcial | Captura/interação no AE em largura compacta próxima de 280 px; matriz restante `NOT RUN` |
| Acessibilidade no runtime | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | Sem teste real de teclado, foco ou leitor de tela nos hosts |
| Convivência da instalação dev com outros hosts CEP | — | `INCONCLUSIVO` | Premiere 26.3.2.2 falhou uma vez e abriu outra com a extensão presente; sem causa estabelecida (item 14) |
| `npm.cmd run check` integrado | — | `PASS` | Gate final: lint, typecheck, build, validate, 326/326 testes e skills validate |

## Detalhes e limites conhecidos

### 1. Carregamento do host ExtendScript no After Effects

Em 2026-08-25, numa extensão CEP equivalente em **After Effects 26.3x87, Windows 11, CEP 12.0.1**, o painel renderizou, mas `typeof $.global.MotionAE` devolveu `"undefined"`. O `<ScriptPath>` do manifest não foi avaliado automaticamente; comandos voltaram `"EvalScript error."`. `$.evalFile` sobre o mesmo host script funcionou.

O build Moti.on atual revelou um sintoma ainda mais forte: com `<ScriptPath>`, mostrou o modal `Não é possível executar o script na linha 1. Erro de sintaxe`. Depois de fechar o modal, o adapter carregou o mesmo arquivo por `$.evalFile` e os comandos passaram. O elemento opcional foi removido; após rebuild, reinstalação e reinício, o painel abriu sem modal, mostrou `Conectado` e respondeu a `ae.context.read`: `PASS` no ambiente acima.

O adapter atual carrega obrigatoriamente o `host/index.jsx` corrente por `$.evalFile` uma vez por instância, serializa bootstraps concorrentes e permite uma única retentativa apenas para comando read-only quando o engine some. O caminho passa pelo encoder ASCII e não é registrado nos logs. Ainda falta repetir em AE 25.x, outros patches 26.x e macOS.

### 2. Round-trip Unicode do `evalScript`

No build atual, o botão **Verificar ponte com o host** devolveu “Ponte com o host íntegra” com português, japonês, emoji, aspas e barra invertida. Resultado: `PASS` em AE 26.3x87/CEP 12.0.1/Windows 11. O payload acima de 60.000 caracteres permanece fora do escopo deste teste.

A hipótese de corrupção por codepage não reproduziu nessa máquina; isso não aprova macOS nem Windows com outra codepage. O escape ASCII continua necessário porque o custo de uma suposição errada é corrupção silenciosa.

### 3. Runtime Chromium do CEP

O runtime medido reportou Chrome 99.0.4844.84 / AdobeCEP 12.0.1; lookbehind e `crypto.randomUUID` executaram. Resultado do experimento: `PASS`. O build continua com alvo conservador `chrome88`; uma combinação não aprova toda a matriz.

### 4. Undo do After Effects

Testes automatizados cobrem preflight antes de mutação e equilíbrio de `beginUndoGroup`/`endUndoGroup`, inclusive com exceção. No host real, `Moti.on Demo` foi criada e um único Ctrl+Z removeu toda a composição: `PASS` para o agrupamento da demo no ambiente medido. Depois de corrigir a normalização de `pt_BR`, `Edit > Undo` exibiu `Desfazer Moti.on: criar composição de teste`: `PASS` para o rótulo nessa combinação. Persistência/reabertura e qualquer Undo da futura integração CHMS-009 continuam `NOT RUN`.

### 5. Seleção e tempo corrente

`captureState`/`restoreState` ainda não existem. Nenhum comando P0 muda seleção ou CTI. Status: `NOT_IMPLEMENTED`; o gate torna-se obrigatório junto do primeiro comando que tocar esse estado.

### 6. Probes reais do After Effects

A sonda do After Effects existe e preserva valores desconhecidos como `unknown`; não inventa JavaScript por versão. No build atual, o System Check passou e mostrou projeto, escrita, rede e motor de expressões disponíveis, mantendo capacidades não empacotadas ou exclusivas do Premiere indisponíveis. A string crua devolvida por `app.project.expressionEngine` ainda não foi anotada.

A leitura da preferência **Allow Scripts To Write Files And Access Network** usa `Main Pref Section`/`Pref_SCRIPTING_FILE_NETWORK_SECURITY`, nomes encontrados em material comunitário e ainda não confirmados em documentação oficial. Exceção vira `unknown` com motivo `couldNotReadHostPreference`, nunca uma falsa afirmação de indisponibilidade. A sonda retornou escrita e rede disponíveis neste ambiente; a validade dos nomes em outras versões continua uma incerteza documentada.

### 7. Premiere: ambiente, capabilities e transações

As assinaturas de `lockedAccess`, `executeTransaction` e `CompoundAction.addAction` foram verificadas contra a referência oficial em [`research/premiere-uxp-transactions.md`](research/premiere-uxp-transactions.md). O helper aninha a transação dentro da trava e não conserva objetos `Action` depois do callback.

A fonte oficial da versão e do locale é `require("uxp").host.version` e `.uiLocale`; a decisão está em [`research/premiere-uxp-host-environment-and-diagnostics-export.md`](research/premiere-uxp-host-environment-and-diagnostics-export.md). Quando a versão estiver ausente, o estado correto é `unknown`/`Não verificado`, nunca `unsupported` inventado.

As capabilities de MOGRT, transcript e caption tracks usam os símbolos públicos mapeados em [`research/premiere-uxp-capability-probes.md`](research/premiere-uxp-capability-probes.md). Sem sequência ativa ou quando getter/factory lança, a implementação mantém `unknown`.

Ainda `NOT RUN` no Premiere real: carregamento, valores de versão/locale, retorno `false` de `executeTransaction`, comportamento de exceção, Undo e objetos stale. O P0 não possui comando mutante no Premiere, então o autoteste só confirma presença de símbolo; a execução da fronteira fica sem consumidor real até uma feature posterior ou um fixture de host explicitamente aprovado.

### 8. Permissão, CSP e exportação de diagnóstico no Premiere

O manifest declara apenas `localFileSystem: "request"`. A exportação abre `storage.localFileSystem.getFileForSaving(...)` após clique explícito e grava com `File.write(...)`; cancelamento não é erro. O logger não deve conservar `nativePath`, nome escolhido, nomes de projeto/sequência, credenciais ou payload criativo.

Pesquisa/API: documentada. Carregamento, aceitação da permissão, comportamento da CSP, picker, cancelamento e escrita no Premiere real: `NOT RUN`.

### 9. Locale da interface do After Effects

Na extensão equivalente, `appUILocale` e `appLocale` foram `"pt_BR"`. `normalizeLocale` aceita underscore e faz fallback por idioma. O build atual renderizou o painel em pt-BR no mesmo host: `PASS` para essa combinação; en-US e outros locales reais continuam `NOT RUN`.

### 10. Payload grande no After Effects

O teto canônico é 60.000 caracteres do JSON **já codificado** para o `evalScript`. Acima dele, o adapter falha fechado antes até da sonda de presença, com `INTERNAL_ERROR`, motivo `INLINE_PAYLOAD_TOO_LARGE`, `encodedChars`, `maxInlineChars` e `mayHaveMutated: false`.

Não existe transporte por arquivo temporário, checksum nem limpeza de temporário. Status: `PARTIAL`; host: `NOT RUN`. O botão Unicode comum não fecha este gate porque seu payload fica abaixo do limite.

### 11. QA visual

O shell compartilhado, a base `#1D1D1D`, uma tarefa dominante por view e os modos 280/360/480/720 px estão implementados e testados em DOM falso. O build foi visto e operado dentro do AE numa largura compacta próxima de 280 px, sem overflow horizontal aparente: `PASS` parcial. 360/480/720 px, 100/125/150/200% de escala, Premiere e macOS continuam `NOT RUN`.

### 12. Acessibilidade

O shell declara relações ARIA, foco visível e navegação de abas por teclado, com testes automatizados. Ordem de foco completa, contraste renderizado e leitor de tela em CEP/UXP reais: `NOT RUN`.

### 13. Metadata de rigs

O package puro `@motion/rig-metadata` cria, lê, atualiza, remove e migra o bloco `[MOTION_META_V1]`. Ele preserva byte a byte o texto do usuário fora do span gerenciado, exige um único bloco válido, usa JSON recursivamente canônico, UTF-8 estrito, base64url sem padding e SHA-256, e falha fechado em corrupção ou migração não registrada. O limite inline é fornecido pelo adapter; o retorno é um plano inline/sidecar, sem I/O dentro do package.

Evidência automatizada: **24/24 testes focados `PASS`**, incluídos no check integrado de 2026-08-25. Evidência no After Effects: `NOT RUN`. Ainda não existem neste slice o adapter de `Layer.comment`, escrita/rename/remoção atômicos do sidecar, fronteira de Undo, teste de limite real do comentário, reabertura/persistência no `.aep` ou um rig visual aplicado. O status agregado de CHMS-009 é `IMPLEMENTED_NOT_HOST_VERIFIED`.

### 14. A instalação de desenvolvimento coincidiu com o Premiere Pro não inicializar

`FAIL` observado em **2026-08-25**, Windows 11, Premiere Pro **26.3.2.2**.

`%APPDATA%\Adobe\CEP\extensions` **não é uma pasta do After Effects**: é compartilhada por todos os hosts CEP da máquina, e cada um a varre na inicialização. Com `com.motion.plugin.ae` presente ali, o Premiere Pro não concluiu a abertura.

| Tentativa | Extensão na pasta CEP | Resultado |
|---|---|---|
| 1 | ausente (movida para quarentena) | abriu; projeto carregado e utilizável |
| 2 | presente, **sem** `.debug` | travou ~60 s, caiu, reabriu, travou de novo e morreu; não abriu em 3 min |
| 3 | removida | abriu e respondeu |
| 4 | presente, **com** `.debug` | **abriu e respondeu**; projeto carregado, 14,7 GB; fechado depois sem evento de crash |

O Windows registrou `Application Hang` para `Adobe Premiere Pro.exe 26.3.2.2` no episódio original. O log de licenciamento (NGL) completou com status 200 — não é licença.

**A tentativa 4 contradiz a leitura simples de "extensão presente ⇒ Premiere trava".** Com a extensão instalada — e desta vez inclusive com `.debug` —, o Premiere abriu normalmente. A tentativa 2 aconteceu logo depois de um ciclo de queda e recuperação do próprio Premiere, o que é explicação ao menos tão boa quanto a presença da extensão. O projeto usado nas medições ocupa cerca de 14 GB de RAM, e este Premiere já foi observado caindo na inicialização **sem** extensão nenhuma (tentativa 3).

Conclusão honesta do conjunto: **não há causa estabelecida.** Duas aberturas com a extensão ausente, uma falha e uma abertura com ela presente. O que existe é uma correlação observada uma única vez, mais o relato do usuário, contra um contraexemplo direto.

**O que está descartado:**

- não é o `.debug`: a tentativa 2 rodou sem ele e falhou do mesmo jeito;
- não é o painel carregando e quebrando: o manifest declara `AEFT` como único host, e **não existe log `CEPHtmlEngine*-PPRO-*` do episódio**. O Premiere nunca criou renderer CEP para esta extensão. A falha acontece antes disso;
- não é `PlayerDebugMode`: a chave já estava em `1` para CSXS.11 e CSXS.12 antes de qualquer instalação deste projeto;
- não é plugin UXP: nenhum estava instalado (`%APPDATA%\Adobe\UXP\Plugins` inexistente).

**O que NÃO está provado:** que a extensão cause o travamento. A amostra é de quatro execuções, com um contraexemplo direto (tentativa 4), e o mecanismo nunca foi identificado.

**Regra operacional, agora por precaução e não por causa estabelecida:** o desinstalador `scripts/uninstall-ae-dev.ps1` / `.sh` existe e a remoção é um comando. Ele deve ser usado quando o Premiere apresentar problema de inicialização, para eliminar a variável rapidamente — não como ritual a cada sessão. Os scripts de instalação avisam que a pasta é compartilhada, o que continua sendo verdade e continua valendo como cuidado.

**O que fecha este item:** um experimento controlado, com o mesmo projeto e a mesma máquina em estado limpo, alternando só a presença da extensão por três execuções de cada lado. Se a correlação não se sustentar, este item vira uma nota sobre a instabilidade do Premiere com projetos grandes. Se sustentar, `Process Monitor` ou o log CEP do Premiere mostram em que passo da varredura ele para.

### 15. Reprodutibilidade do Wiggle entre camadas

`IMPLEMENTED_NOT_HOST_VERIFIED` / execução `NOT RUN`.

O template emite `seedRandom(<semente>)` antes de `wiggle(...)` porque a referência afirma que o offset controla o valor inicial do wiggle. Isso está medido: aplicar, reaplicar e trocar a semente funcionam, e a fonte gerada é canônica.

**O que NÃO está medido:** se duas camadas diferentes, com a mesma semente e os mesmos parâmetros, produzem movimento idêntico. A documentação diz que o seed padrão é função do identificador da camada, da propriedade e do tempo, e que o offset entra nessa composição — o offset pode igualar apenas a fase, e não a trajetória inteira.

Até que isso seja medido, o produto **não promete** "mesma semente, mesmo movimento" entre camadas. O texto da interface descreve o efeito por propriedade.

**O que fecha este item:** duas camadas na mesma composição, mesma semente e mesmos parâmetros, comparando o valor da propriedade quadro a quadro. Se divergirem, a semente é controle de variação por propriedade e o rótulo precisa dizer isso; se coincidirem, o produto ganha uma promessa que hoje não pode fazer.

### 16. Caixa de texto: o rig inteiro está sem medição em host

`IMPLEMENTED_NOT_HOST_VERIFIED` / execução `NOT RUN`.

Este é o primeiro comando que **cria camadas** em vez de anotar propriedades existentes, e por isso a distância entre "os testes passam" e "funciona no After Effects" é maior do que nos comandos de expressão. Os `matchName` foram sondados no host real (registro em `docs/research/after-effects-text-box-rig.md`), mas o rig montado com eles não foi.

**O que está medido:** os identificadores existem e a árvore de conteúdo de uma shape layer tem a forma esperada; `sourceRectAtTime` devolve o retângulo no espaço da camada de texto, com `top` negativo, e colapsa para zero em texto vazio.

**O que NÃO está medido, em ordem de risco:**

1. **O alinhamento espacial.** A caixa só cai no lugar se a origem da camada de forma coincidir com a origem do texto. O comando parenteia e depois zera âncora e posição justamente para não depender da semântica de `layer.parent = x` — mas que o resultado seja o esperado é raciocínio, não medição.
2. **A cor.** `hexToChannels` divide por 255 e entrega sRGB direto. Com gerenciamento de cor ativo no projeto, o After Effects pode interpretar esses números no espaço de trabalho e a cor exibida divergir do seletor.
3. **A ordem do preenchimento.** O retângulo é adicionado antes do fill, que é a ordem que o próprio After Effects cria — mas se estiver invertida, a caixa fica invisível.
4. **Undo de um passo.** Como em todos os outros comandos, `NOT RUN`.
5. **`moveAfter` com várias camadas selecionadas**, onde os índices mudam a cada criação.

**O que fecha este item:** criar a caixa sobre uma camada de texto real e conferir posição, cor e ordem; editar o texto e ver a caixa acompanhar; reaplicar e observar no-op; desfazer com um Ctrl+Z.

## Controles automatizados existentes

Em **2026-08-25**, o gate final integrado concluiu `npm.cmd run check` com `PASS`: lint, typecheck, build, validate, **326/326 testes** e skills validate. O check cobre:

- quatro JSON Schemas Draft 2020-12, geração standalone CSP-safe e guards profundos de request, response, capabilities e rig metadata;
- escape ASCII, fuzz e limite inclusivo do `evalScript`;
- parser JSON ES5, chaves perigosas, profundidade e teto de entrada;
- preflight, protocolo, allowlist, Undo e semântica `changed` do dispatcher;
- correlação, timeout, callback tardio e descriptor do `CommandClient`;
- bootstrap e rejeição de payload acima de 60.000 caracteres sem chamar `evalScript`;
- transações do Premiere com doubles e regras ESLint oficiais;
- probes por símbolo, estados `unknown` e tiers sem `parseFloat`;
- redaction na escrita, rotação por bytes UTF-8 e bundles imutáveis;
- create/read/update/remove/migrate do núcleo puro de metadata, incluindo canonicalização, base64url, SHA-256 e planos sidecar sem I/O;
- shell, i18n, larguras e semântica de foco/ARIA em DOM falso;
- manifests, permissões, CSP, build, subconjunto ExtendScript e drift do código gerado.

Esse `PASS` é automatizado. Ele não aprova carregamento, UI, filesystem, Undo, persistência nem comportamento dos hosts Adobe reais.

## Como fechar os itens

Siga [`INSTALLATION.md`](INSTALLATION.md) e registre para cada execução: commit/build, sistema, versão do host, versão do runtime, data e `PASS`/`FAIL`. O mínimo restante é:

1. carregar o artefato atual no Premiere real e reinstalar o AE em cada combinação adicional da matriz;
2. no After Effects, repetir a matriz em AE 25.x/outros 26.x/macOS e fechar diagnóstico, DPI, teclado e acessibilidade;
3. integrar CHMS-009 à camada de host e então testar `Layer.comment`, limite real, sidecar atômico, corrupção, migração, Undo e reabertura;
4. no Premiere, testar contexto, versão/locale, System Check, picker salvo/cancelado e conteúdo redigido; testar transação/Undo quando houver um consumidor real;
5. nos dois hosts, repetir 280/360/480/720 px, 100/125/150/200% de escala, teclado, foco, estados, overflow e screenshots;
6. repetir a matriz necessária em Windows e macOS — aprovação numa plataforma não fecha a outra.
