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
| After Effects: Create Null (`ae.layer.create-null`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | AE 26.3x87: os três posicionamentos exatos, sonda temporária sempre apagada, e o critério de aceite cumprido — camadas rotacionadas e escaladas não se moveram ao serem parenteadas. Painel: `NOT RUN` (item 18) |
| After Effects: Flip (`ae.layer.flip`) | `PARTIAL` | `PASS` para o escopo entregue | AE 26.3x87: flip duplo voltou idêntico; o canto espelhou em torno do pivô com erro de 1,1e-13; a conta de limites bate com a do motor de expressões. Camadas 3D, com pai e shape paths: recusadas ou fora de escopo (item 19) |
| After Effects: Alinhador de âncora (`ae.anchor.align`) | `PARTIAL` | `PASS` para o escopo entregue | AE 26.3x87: pior erro visual de 1,2e-5 px contra o critério de 0,5 px da §14.6, incluindo camada parenteada e **camadas 3D**. Convex e Concave fora de escopo (item 21) |
| After Effects: matriz de transform 3D (`MotionTransform`) | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Composição medida contra o host com erro de 5,684e-14. Registro em `docs/research/after-effects-3d-transform.md` (item 22) |
| Premiere: painel, contexto e capabilities | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | APIs verificadas em documentação e doubles |
| Premiere: versão/locale do host | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | `require("uxp").host.version`/`.uiLocale` documentados para 25.6+ |
| Premiere: transações/Undo | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | Ordem `lockedAccess` → `executeTransaction` coberta por doubles |
| Premiere: exportação de diagnóstico | `IMPLEMENTED_NOT_HOST_VERIFIED` | `NOT RUN` | Picker e `File.write` documentados; host real não executado |
| CHMS-009: núcleo puro de metadata de rigs | `IMPLEMENTED_NOT_HOST_VERIFIED` | `PASS` automatizado / host `NOT RUN` | 24/24 testes focados; sem integração `Layer.comment`, filesystem ou Undo real |
| UI responsiva e visual | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | AE 26.3x87: as 12 ferramentas abrem pela grade, desenham campos e prévias com dados reais do host, e voltam. Sem exceção e sem rolagem horizontal em 280 e 480 px (item 20) |
| After Effects: CHMS-016 pelo painel | `IMPLEMENTED_AND_VERIFIED` em um ambiente | `PASS` | Prévia e aplicação de Renomear e Inverter ordem executadas pela interface, não pelo dispatcher: a prévia previu e o apply produziu exatamente aquilo (item 20) |
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

### 18. Create Null: a matemática de transform é a do próprio After Effects

`IMPLEMENTED_AND_VERIFIED` num ambiente / execução `PASS` para o comando.

**A decisão estrutural:** o posicionamento **não** é calculado no ExtendScript. Compor matrizes de transform a mão daria uma matemática impossível de verificar contra 3D, parents aninhados e camadas animadas — e que erraria em silêncio. O comando escreve uma expressão temporária na posição do null, lê o valor que o After Effects avaliou, apaga a expressão e assa o número.

A sonda nunca é persistida, e é apagada num `finally`: um null com expressão temporária sobrevivente seria pior que um null mal posicionado, porque o usuário teria uma camada com código que ele não escreveu.

#### Dois defeitos que a verificação em host encontrou

1. **`toComp` devolve DOIS componentes numa camada 2D e três numa 3D.** Ler `p[2]` sem guarda numa camada 2D produz "Valor indefinido usado na expressão" e o After Effects desabilita a expressão. Seleção mista de 2D e 3D é o caso comum.
2. **`toComp([0,0,0])` mapeia a origem do espaço da camada — o canto superior esquerdo da fonte, não a âncora.** Num sólido a âncora nasce no centro, então "média das âncoras" calculava a média dos cantos: `[215.835, 129.607]` em vez de `[260, 180]`. **Esse erro passou como sucesso** — o comando respondia `ok: true` e posicionava o null num lugar plausível. Só apareceu porque a sonda de verificação carregava o valor esperado ao lado do medido.

O segundo é o mais instrutivo do slice: um comando pode estar completamente verde, responder sucesso e estar computando a coisa errada. Verificação que só confirma "não deu erro" não teria pego.

#### Evidência da execução aprovada

| Verificação | Medido |
|---|---|
| `compCenter` sem seleção | `[320, 180]` numa comp 640×360 |
| `averageAnchor` | `[260.000, 180.000]` — exatamente a média das âncoras |
| `selectionBounds` em 3D | `[245.186, 159.607, 0]`, três componentes |
| sonda residual | vazia nos três casos |
| tamanho, cor de rótulo, dimensão | `150×150`, `label 9`, 2D/3D conforme pedido |
| **critério de aceite** | camada rotacionada 35° e escalada 180% não se moveu ao ser parenteada |
| seleção após o comando | só o null |

#### O que continua `NOT RUN`

- **O painel.** Nenhum dos dois comandos do CHMS-015 foi exercitado pela interface.
- Seleção com mais de 500 camadas, onde o comando recusa.
- Camadas com expressão na posição, onde a reescrita de `preserveWorldTransform` pode falhar em silêncio.
- Ctrl+Z de um passo; macOS; AE 25.x.

### 19. Flip: a derivação importa mais que o código

`PARTIAL` / execução `PASS` para o escopo entregue.

**Espelhar não é negar a escala.** Sendo `M` a reflexão, o transform da camada é `T(p)·R(t)·S`, e:

```text
M·T(p)·R(t)·S = T(Mp)·M·R(t)·S = T(Mp)·R(-t)·M·S = T(Mp)·R(-t)·S'
```

A posição reflete em torno do pivô, **a rotação troca de sinal**, e a escala do eixo espelhado
troca de sinal. Negar só a escala deixaria qualquer camada rotacionada no lugar errado, com o
erro crescendo com o ângulo — e passando despercebido em qualquer teste com rotação zero.

Como cada termo troca de sinal, aplicar duas vezes devolve o estado inicial exatamente.

#### Evidência da execução aprovada

| Verificação | Medido |
|---|---|
| flip duplo, camada rotacionada 35° e escalada 140×80 | voltou **idêntico** |
| estado intermediário | `pos=[490, 120] esc=[-140, 80] rot=-35` |
| canto medido por `toComp`, espelhado em torno de x=320 | erro de **1,137e-13** em x, **zero** em y |
| centro dos limites: conta do comando vs motor de expressões | `269,4468` nos dois, diferença 8,7e-7 |
| camada 3D e camada com pai | recusadas com `INVALID_SELECTION_TYPE` |
| texto com legibilidade preservada | mudou de lado, escala continuou `[100, 100]` |

A terceira linha é a que vale: a conta de limites que o comando faz à mão foi conferida contra a
matemática nativa do After Effects, e não contra a expectativa de quem a escreveu.

#### Escopo recusado, e por quê

- **Camadas com pai.** Com um pai rotacionado o eixo de espelhamento deixa de ser alinhado no
  espaço do pai, e a fórmula não vale. O comando recusa com erro tipado.
- **Camadas 3D.** São três rotações e a derivação é outra.
- **Shape paths.** A §7 diz "para paths, refletir vertices e tangents" — é uma segunda
  implementação inteira, sobre `Shape` em vez de transform. Não está neste slice.

Em todos os três a alternativa seria produzir silenciosamente um resultado errado, que é
exatamente o modo de falha deste comando.

#### O que continua `NOT RUN`

- **O painel.** Nenhum dos três comandos do CHMS-015 foi exercitado pela interface.
- Ctrl+Z de um passo; macOS; AE 25.x.

### 20. O painel, finalmente exercitado pela interface

`IMPLEMENTED_AND_VERIFIED` num ambiente / execução `PASS`.

Até aqui todos os comandos tinham sido exercitados **pelo dispatcher**, nunca pela interface. Essa
lacuna já havia cobrado o preço uma vez: o painel tipava `before`/`after` da prévia de
reverse-order como `string[]` quando o host devolve registros, e o guarda rejeitava a prévia em
silêncio.

#### Por que o painel não abria para inspeção

O `.debug` — o arquivo que declara a porta 8091 do inspetor remoto — só é instalado sob
`-EnableDebugMode`, e todas as instalações recentes rodaram sem a flag. O `PlayerDebugMode` do
registro continuava ligado, então a extensão carregava normalmente; só o inspetor ficava mudo.

O painel foi aberto por `app.executeCommand(app.findMenuCommandId("Moti.on"))`, sem depender de
clique manual.

#### Medido em AE 26.3x87

| Verificação | Medido |
|---|---|
| grade | 12 ladrilhos, todos com ícone SVG — nenhum caiu no fallback `?` |
| abrir e voltar | as 12 ferramentas desenham título, campos e ações, e devolvem a grade |
| prévias | Renomear, Inverter ordem, Cortar keys e Atrasar montaram lista com dados vindos do host |
| `Aplicar` desabilitado | Renomear com `0 de 3 mudam` e Parentesco sem alvo — os dois com motivo no tooltip |
| aplicação pela interface | Inverter ordem previu `Titulo, alpha, beta` e produziu exatamente isso; Renomear previu `P_Titulo, P_alpha, P_beta` e renomeou as três |
| largura | `compact` em 280 px e `standard` em 480 px, sem rolagem horizontal |
| exceções | nenhuma |

#### Três defeitos que só a passada pela interface revelou

1. **`Atualizar lista` aparecia em quatro ferramentas que não têm lista.** O gancho de carga serve
   a duas coisas — o Parentesco relê camadas, as outras recalculam a prévia — e um rótulo só
   mentia em quatro das cinco. Agora o rótulo é por ferramenta.
2. **O rodapé da prévia do Cortar keys falava no passado**: reaproveitava a mensagem de sucesso e
   dizia que os keyframes já tinham saído, antes de qualquer clique.
3. **O Espelhar tinha um campo chamado `Aplicar`**, idêntico ao botão de ação ao lado.

#### O que continua `NOT RUN`

- Teclado, foco e leitor de tela — a matriz de acessibilidade da §22 continua sem execução.
- Largura 360 e 720 px; macOS; AE 25.x.
- Aplicação pela interface das outras dez ferramentas: só Renomear e Inverter ordem foram
  clicadas até o fim.

### 21. Alinhador de âncora: a matriz, e o keyframe que ela esqueceu

`PARTIAL` / execução `PASS` para o escopo entregue.

A §14.5 proíbe expressão temporária quando a operação pode ser resolvida por matriz. Aqui pode, e
a derivação cabe em três linhas: o transform leva o espaço da camada ao espaço do **pai** por
`p = posição + R·S·(v − âncora)`, então

```text
posição' + R·S·(v − A')  =  posição + R·S·(v − A)
posição'                 =  posição + R·S·(A' − A)
```

**O transform do pai cancela.** `posição` já está em espaço do pai, e os dois lados passam pela
mesma matriz. A compensação é inteiramente local, e vale para qualquer profundidade de
parentesco — o que a medição confirmou.

#### Evidência da execução aprovada

| Caso | Erro visual |
|---|---|
| 2D simples | `0` |
| rotacionada 37° e escalada 160×70 | `1,205e-5 px` |
| escala negativa | `0` |
| **parenteada a pai rotacionado e escalado** | `5,267e-6 px` |
| texto | `0` |

Critério da §14.6: **0,5 px**. O pior caso ficou 40 mil vezes abaixo, e o resíduo é arredondamento
do próprio After Effects ao ler e gravar propriedade — não da conta.

#### O defeito que só a interface revelou

A primeira aplicação pelo painel devolveu `ROLLBACK_FAILED`. A causa: **`setValue` levanta erro
numa propriedade com keyframes**, e a cena de teste tinha uma camada com Position animada. Pior,
o rollback tentava o mesmo caminho e falhava também — daí o código de rollback em vez do erro
original.

Camada animada é o caso comum no After Effects, não a exceção. O comando agora desloca cada
keyframe pelo mesmo vetor, o que preserva a animação inteira, e o rollback subtrai o mesmo vetor —
sem snapshot, porque nenhum keyframe é criado, removido ou reordenado.

Duas recusas novas vieram junto, e são de verdade:

- **âncora animada** — qual keyframe iria para o canto? Não há resposta;
- **escala ou rotação animada com compensação ligada** — `R·S·(A' − A)` muda a cada quadro, e um
  deslocamento constante acertaria um instante e erraria todos os outros, em silêncio.

#### Escopo recusado, e por quê

- **Convex e Concave** dependem de análise de path — convex hull e sinal de cross product — e são
  corpo de trabalho próprio.
- ~~**Camadas 3D**~~ — **resolvido**. A composição foi medida e vive em `MotionTransform`; o
  alinhador aceita 3D com erro de `3,2e-6 px` (rotação nos três eixos) e `2,6e-6 px` (com
  orientation). Ver item 22.
- **Fontes de bounds** `source`, `mask`, `shapePath` e `selection`: só `visual` está implementada,
  e as outras são recusadas com erro tipado em vez de silenciosamente trocadas.
- **União em comp space** para múltiplas camadas: com camadas rotacionadas o retângulo unido não
  tem canto bem definido no espaço de cada camada. Por enquanto cada camada usa o próprio bounds.

### 22. A matriz de transform 3D, medida em vez de deduzida

`IMPLEMENTED_AND_VERIFIED` num ambiente / execução `PASS`.

Três comandos recusavam camadas 3D, e a recusa era honesta: sem saber a composição exata, a
alternativa era escrever matriz por palpite e produzir camadas visualmente erradas **sem levantar**
**erro nenhum**. Isso virou dívida sistemática, e este item a paga.

```text
toWorld(v) = posição + M · (v − âncora)

M  = Ro · Rx(rx) · Ry(ry) · Rz(rz) · S
Ro = Rx(ox) · Ry(oy) · Rz(oz)
S  = diag(escalaX/100, escalaY/100, escalaZ/100)
```

Todas as rotações usam a matriz de **ângulo positivo** — não há inversão de sinal apesar do eixo Y
apontar para baixo. **Erro máximo contra o host: `5,684e-14`**, que é precisão de máquina.

#### O método importou mais que o resultado

Adivinhar entre oito composições candidatas não converge: as oito erram, e o erro não diz por quê.
O que resolveu foi **medir a matriz**: para uma camada sem pai, as colunas de `M` são diferenças de
`toWorld` nos vetores da base, então quatro avaliações dão `M` inteira. Com ela na mão, cada
hipótese vira comparação numérica em vez de palpite.

Dois enganos apareceram assim, e nenhum seria óbvio:

1. **`toComp` não serve.** Numa camada 3D ele já inclui a projeção da câmera — erro de **860 px**.
   O que corresponde ao transform é `toWorld`.
2. **Não há inversão de sinal.** Assumir que o eixo Y para baixo inverte as rotações respondia
   sozinho por **165 px** de erro.

#### Uma armadilha de diagnóstico, registrada

Concatenar um array de valor de propriedade do After Effects numa string levanta `resultado`
`numérico inválido (divisão por zero?)`. Isso custou uma rodada inteira: o log de sucesso explodia
dentro do `try`, e o `catch` fazia parecer que a **escrita** tinha falhado quando ela funcionara.
Em código de sonda, formatar elemento a elemento é o único caminho seguro.

#### O que continua `NOT RUN`

- **Camadas 3D com pai.** A compensação de âncora é local por construção e foi medida em 2D com
  pai; em 3D com pai, `NOT RUN`.
- Escala com componente negativo em 3D.
- `Auto-Orient`: com ele ligado a rotação efetiva deixa de vir só das propriedades, e a matriz
  lida aqui não a descreve.
- **`ae.layer.create-null` ainda usa `toComp` na sonda de posicionamento.** Para camadas 3D isso é
  a posição projetada pela câmera, e não a do transform — o mesmo engano que custou 860 px aqui.
  Não foi medido se o resultado diverge do desejado nesse comando.
- **`ae.layer.flip` continua recusando 3D**: a reflexão em três eixos é outra derivação, e
  `MotionTransform` dá a matriz mas não a decomposição de volta em rotações que o flip precisaria.

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
