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
| After Effects: Caixa de texto (`ae.text.box`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | AE 26.3x87: caixa criada, `size` e `position` avaliados exatamente nos valores esperados, sem `expressionError`; texto vazio recolheu para `[0, 0]`; seleção restaurada e reaplicação devolveu no-op. Ctrl+Z de um passo e cor não-preta pelo painel: `NOT RUN` (item 16) |
| After Effects: Parentesco (`ae.layer.parent`, `ae.layer.list`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | AE 26.3x87: `preserveWorldTransform` preservou o mundo exatamente; desligado, a camada pulou como pedido; ciclo e nome divergente recusados sem mutação; encadeamento seguiu a ordem do timeline; desparentear preservou o mundo. Painel: `NOT RUN` (item 17) |
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

`captureState`/`restoreState` genéricos ainda não existem. Status: `PARTIAL`.

O gate previsto neste item foi acionado: **`ae.text.box` é o primeiro comando que altera seleção**, porque o After Effects seleciona toda camada recém-criada. Ele restaura a seleção por conta própria — mede as camadas de texto antes, devolve a seleção a elas depois — e isso está verificado em host (item 16).

O que continua faltando é a versão **genérica**: um par `captureState`/`restoreState` no dispatcher, que valeria para qualquer comando futuro em vez de cada um resolver sozinho. Nenhum comando toca o CTI até agora.

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

### 16. Caixa de texto: verificada em host depois de dois defeitos medidos

`IMPLEMENTED_AND_VERIFIED` num ambiente / execução `PASS`.

**Medido em AE 26.3x87, Windows 11, 2026-08-26.** O comando falhou quatro vezes em host antes de passar. As duas causas valem registro porque nenhuma delas era detectável por leitura de código ou por teste com doubles ingênuos.

#### Defeito 1 — expressão escrita antes do parentesco

O template dereferencia `thisLayer.parent`. Numa camada ainda sem parent isso é `null`, e o After Effects rejeita a expressão no instante da atribuição. Parentear passou a vir antes.

#### Defeito 2 — handle de propriedade envelhecido

Este é o que importa para todo o resto do projeto. Uma referência de propriedade no ExtendScript é presa ao índice dentro do grupo: **acrescentar um irmão invalida as referências já entregues**, e usá-las levanta "O objeto é inválido". O código guardava o `rect` devolvido por `addProperty` e adicionava o fill em seguida — o handle morria ali.

Os `matchName` estiveram corretos o tempo todo. A sonda que "confirmou" os identificadores no slice anterior não reproduziu isso porque não inseria nada depois de obter a referência.

**Regra que sai daí:** nunca segure referência de propriedade atravessando uma mutação estrutural do grupo que a contém. Releia pelo grupo.

#### Defeito 3 — o comando deixava a caixa selecionada

O After Effects seleciona toda camada recém-criada. Sem restaurar a seleção, a segunda aplicação via painel encontrava a **caixa** na seleção e recusava com `INVALID_SELECTION_TYPE` em vez de dar no-op. Ver também o item 5: este é o primeiro comando do projeto que altera seleção.

#### Evidência da execução aprovada

| Verificação | Medido |
|---|---|
| criação | `ok: true`, `createdCount: 1` |
| `sourceRectAtTime` do texto | `top=-24.3809 left=0.2813 w=43.0664 h=32.1504` |
| `Rect Size` avaliado | `[91.0664, 60.1504]` — exatamente `w+2·24`, `h+2·14` |
| `Rect Position` avaliada | `[21.8145, -8.3057]` — exatamente o centro do bounding box |
| `expressionError` | vazio nas duas propriedades, ambas habilitadas |
| âncora e posição da camada | `[0, 0, 0]` e `[0, 0, 0]` |
| ordem no grupo | `ADBE Vector Shape - Rect` antes de `ADBE Vector Graphic - Fill` |
| ordem na timeline | caixa no índice 2, texto no índice 1 |
| texto apagado | `Rect Size` recolheu para `[0, 0]` |
| seleção após o comando | `[Ag]` — só o texto |
| reaplicação sem tocar na seleção | `ok: true`, `createdCount: 0`, `unchangedCount: 1`, uma única caixa |

#### O que continua `NOT RUN`

- **Ctrl+Z de um passo** para este comando.
- **Cor não-preta pelo painel.** O host foi exercitado com `[0, 0, 0]`; a conversão `hexToChannels` do painel e a interpretação sob gerenciamento de cor do projeto não foram medidas.
- Aplicação com **várias camadas de texto selecionadas** em host real.
- Comportamento com texto de múltiplas linhas e com `paddingX`/`paddingY` extremos.
- macOS e AE 25.x.

### 17. Parentesco: comando verificado, painel ainda não

`IMPLEMENTED_AND_VERIFIED` num ambiente / execução `PASS` para o comando.

**Medido em AE 26.3x87, 2026-08-26.** O ponto que exigia medição, e que teria sido invertido por um palpite, está em `docs/research/after-effects-parenting.md`: **`layer.parent = alvo` preserva o world transform e `setParentWithJump` não.** O nome da API sugere o contrário.

| Verificação | Medido |
|---|---|
| `preserveWorldTransform: true` | mundo `[60, 60]` antes e depois |
| `preserveWorldTransform: false` | `[120, 80]` → `[473.923, 311.962]` — pulou, como pedido |
| reaplicar o mesmo parentesco | `appliedCount: 0`, `unchangedCount: 1` |
| ciclo | `INVALID_SELECTION_TYPE`, pai do alvo intocado |
| nome do alvo divergente | `INVALID_SELECTION_TYPE` |
| encadear | topo→meio→base→alvo, na ordem do timeline |
| desparentear | mundo preservado |
| seleção após o comando | só a camada originalmente selecionada |

#### O que continua `NOT RUN`

- **O painel.** O comando foi exercitado pelo dispatcher, não pela interface: o seletor de alvo, o cache da lista e o botão Atualizar não foram usados em host.
- **Parents aninhados de mais de dois níveis** com transform em cada nível — o critério de aceite do CHMS-015 os menciona.
- **Camadas com expressão na posição.** Se o After Effects não conseguir reescrever um valor governado por expressão, `preserveWorldTransform` pode falhar em silêncio nessas camadas.
- **Composição acima de 500 camadas**, onde a lista trunca.
- Ctrl+Z de um passo para este comando; macOS; AE 25.x.

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
