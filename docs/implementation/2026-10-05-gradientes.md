# Moti.on — Gradientes

Status desta revisão: **PARTIAL** — implementação integrada, checks, comandos e
lifecycle verificados; consolidação da renderização e MFR no host ainda em
andamento.

Iniciado em 05/10/2026; evidências consolidadas em **06/10/2026**, America/Bahia.
Host exercitado: **After Effects 26.5x89, macOS arm64**, em Apple M5
(OS informado pelo host: 27.2.0/64). A compilação universal não qualifica outras
arquiteturas ou versões.

## Implementado

A ferramenta **Gradientes**, em Efeitos, aplica o efeito próprio
`Moti.on Gradient` a textos, formas, sólidos e imagens. O alpha da entrada
delimita o preenchimento, mantendo texto e vetores editáveis. **Criar fundo**
adiciona um sólido com dimensões, duração e proporção de pixels da composição,
abaixo das camadas existentes.

O editor Onyx abre Cores e recolhe Forma, Relevo, Luz e Animação. Há dois a oito
pontos ativos em oito slots permanentes, posições por campo/arraste/teclado,
inversão da paleta, oito presets originais — Aurora, Brasa, Lagoa, Crepúsculo,
Pérola, Cítrico, Elétrico e Rosa — e salvamento pessoal local validado. A composição
é a prévia do resultado. O seletor visual de cor mostra uma amostra SDR; canais
HDR já existentes permanecem em float ao editar outros campos.

Modos linear, radial e angular incluem centro, escala, proporção, rotação,
repetição e deslocamento. Relevo combina contorno por alpha suavizado, volume
elíptico e turbulência determinística. Brilho tem intensidade, raio, limiar e
proteção de realces; difusão tem intensidade/raio próprios e foco, área nítida e
suavidade. Granulação é opcional. O padrão usa quatro cores, modo linear,
relevo/brilho suaves, difusão/granulação desligadas e animação estática. O preset
Aurora agora é uma escolha óptica explícita, com campo mais amplo, turbulência,
brilho e difusão suave; carregar esse preset não altera os defaults do contrato.
Todos os oito presets mantêm animação estática, com loop por escolha do usuário.
Quando os valores padrão não correspondem a uma receita, o seletor mostra
Personalizado e os oito presets originais. Loop
automático inicia em quatro segundos; campo de cor, turbulência e grain são
periódicos.

`GradientSettingsV1` é compartilhado entre validação, presets, editor e adapter.
`ae.effect.gradient.read` retorna instâncias, valores atuais, campos diferentes,
campos protegidos por expressão, token da seleção/CTI e disponibilidade nativa.
`ae.effect.gradient` fornece aplicar, atualizar, remover e criar fundo. O lote
inteiro passa por preflight; a implementação usa Undo coerente e recuperação de
alterações parciais.

Reaplicar encontra a instância gerenciada. Atualizar envia somente
`changedKeys`, grava no CTI quando a propriedade está animada e mantém outros
keyframes e metadados. Expressões do usuário bloqueiam seus controles. Remover
preserva camada, demais efeitos e comentário do usuário. Seleção/CTI são
restaurados também depois de remoção e rollback. Leitura ocorre com painel em
foco, descarta respostas antigas e conserva rascunhos durante digitação/arraste.
A atualização ao confirmar um gesto ocorre quando toda a seleção já tem o
efeito; uma seleção parcialmente aplicada exige Aplicar explícito.

O bundle **MotionCore 1.4.0** acrescenta PiPL 16003/`GradientMain`, mantendo as
identidades e parâmetros de Glitch, Wave e Native Transition. Gradient v1 tem
54 posições após input: 29 controles, oito tripletas active/color/position e
schema 1. Disk IDs: 3001–3029, 3100–3123 e 3999. Alternar um ponto não renumera
parâmetros ou desloca keyframes.

CPU e Metal calculam RGBA pré-multiplicado em float com fórmulas e sementes
compartilhadas. CPU recebe/produz 8, 16 e 32 bpc; 32 bpc conserva RGB HDR/negativo.
Metal usa BGRA float, dispositivo/fila fornecidos pelo Adobe SDK e alocação
gerenciada pelo host. SmartFX pede as dependências finitas da região e expande
bounds para halos, incluindo entradas ampliadas por efeitos anteriores. Geometria
considera downsample de cada eixo, origem e pixel aspect. Difusão/brilho filtram
cor e alpha juntos.

As cores vêm de `PF_GetFloatingPointColorFromColorDef` no espaço de trabalho do
efeito. O padrão respeita esse espaço; a opção explícita sRGB linear aplica a
função de transferência sRGB sem presumir que todos os projetos sejam sRGB.
Pipelines GPU são imutáveis por dispositivo e os buffers/parâmetros pertencem a
cada render. CPU permanece disponível quando o setup Metal não está disponível.

## Arquivos principais

| Área | Arquivos |
|---|---|
| Contrato/presets/validação | `packages/contracts/src/gradient.ts`, schemas e validadores gerados, `packages/contracts/scripts/gen-extendscript.mjs` |
| Registro e Undo | `packages/command-registry/src/descriptors.ts`, `undo-labels.ts` |
| Adapter AE | `apps/after-effects-cep/host/src/commands/effect-gradient.jsx`, tipos de host, `scripts/build-extendscript.mjs` |
| Editor e integração | `apps/after-effects-cep/client/src/gradient-editor.ts`, `main.ts`, `packages/ui-core/src/{locales,icons,components.css}` |
| Efeito e núcleos | `plugin/host/Gradient.cpp`, `GradientKernel.h/.cpp`, `GradientMath.inc`, `GradientMetal.h/.mm`, `GradientMetalSource.h` |
| Build/identidade | `plugin/CMakeLists.txt`, `host/MotionCoreVersion.h`, `resources/MotionCorePiPL.r`, `resources/Info.plist`, `verify-bundle.sh` |
| Testes | `packages/contracts/tests/gradient.test.mjs`, `apps/after-effects-cep/tests/{gradient,gradient-editor}.test.mjs`, `plugin/tests/GradientKernelTests.cpp`, `GradientMetalTests.mm` |
| Documentação | [README nativo](../../plugin/README.md), [pesquisa SDK](../research/after-effects-native-gradients.md), catálogo do `MASTER_BUILD_SPEC.md`, `CHANGELOG.md` |

O vídeo fornecido e a [página do Cosmic](https://aescripts.com/cosmic/) orientam
a referência visual. Identidade, código, fórmulas, cores e presets desta
implementação são próprios.

## Verificação consolidada

| Verificação | Resultado e evidência |
|---|---|
| Baseline antes da implementação | **PASS**, 2.088/2.088; [log](../../artifacts/gradients-20261005/baseline.log). |
| `npm run check`: lint, tipos, build, schemas, contraste, testes e skills | **PASS**, 2.125/2.125, sem falhas/skips; [log autoritativo](../../artifacts/gradient-20261006/check.log). Logs `gradients-20261005/check*.log` são intermediários e não substituem esse gate. |
| Build nativo comum universal, PiPL, exports e assinatura de desenvolvimento | **PASS**; [build](../../artifacts/gradients-20261005/native-final.log). |
| CTest: Glitch, Wave, Transition, Gradient CPU e Gradient Metal | **PASS**, 5/5, incluindo a revisão de continuidade da paleta; [rodada final](../../artifacts/gradient-20261006/ctest-final.log). |
| Núcleo CPU/Metal, ASan/UBSan e concorrência CPU | **PASS** no Apple M5; [sanitizers da revisão de continuidade](../../artifacts/gradient-20261006/sanitizers-final.log), [relatório anterior](../../artifacts/native-gradient/kernel/verification.md), [CPU medido](../../artifacts/native-gradient/kernel/cpu-measured.txt), [Metal medido](../../artifacts/native-gradient/kernel/metal-measured.txt). |
| Interface: 16 casos específicos, integração do bundle, idioma/componentes | **PASS** nas rodadas documentadas; [revisão de UI](../../artifacts/gradients-20261005/ui-verification.md). |
| Navegador: 280/360/480/720 px, pt-BR/en-US e controles por teclado | **PASS** para a matriz e interações registradas na revisão de UI; transporte de host era fixture explícita. Capturas foram inspecionadas no retorno CUA, sem PNGs separados. |
| Comandos no AE real | **PASS**, oito cenários; [resultados](../../artifacts/gradient-20261006/native-results.json), [fixture](../../artifacts/gradient-20261006/verify-native.jsx). Projeto/itens originais preservados nessa bateria. |
| Renderização nativa AE CPU/Metal em 8/16/32 bpc | **NOT RUN** nesta consolidação; sessão de render atual em andamento, aguardando revisão principal dos resultados e imagens. |
| AE: ROI/full, Full/Half/Quarter, PAR, alpha, halos, HDR e continuidade de loop | **NOT RUN** nesta consolidação. A cobertura standalone não comprova os callbacks reais do host. |
| AE serial versus Multi-Frame Rendering | **NOT RUN** para comparação/concorrência nesta consolidação. A sequência CPU com MFR configurado executou, mas equivalência de output e prova de callbacks simultâneos aguardam análise. Concorrência CPU standalone não comprova MFR no host. |
| AE Undo/Redo de aplicar/atualizar/remover/criar fundo | **PASS** na rodada 2, com Cmd+Z/Shift+Cmd+Z nativos entre chamadas separadas e snapshots completos. [Lifecycle: 12/12](../../artifacts/gradient-20261006/lifecycle-results.json); [procedimento](../../artifacts/gradient-20261006/lifecycle-notes.md). |
| Salvar/reabrir efeito, animação e expressões no AE | **PASS** na mesma bateria de lifecycle: 54 parâmetros, keyframes/easing, expressões, metadata e IDs preservados no projeto de QA salvo e reaberto. |
| Cliques no editor CEP instalado e latência local ≤100 ms | **NOT RUN**; teste de navegador não equivale a clique no runtime CEP. |
| Instalação do build comum anterior com backup | **PASS**; [nativo](../../artifacts/gradients-20261005/install-native-final.log), [CEP](../../artifacts/gradients-20261005/install-panel.log). |
| Restauração final do build comum após QA instrumentado | **NOT RUN** nesta consolidação. A sessão atual usa temporariamente um bundle de diagnóstico para verificar callbacks GPU. |
| Outros AE/macOS, Intel runtime, Windows/CUDA e Premiere | **NOT RUN** para esta ferramenta. |

A bateria real de comandos cobre ABI/matchNames, aplicação em vários textos
editáveis e reaplicação, alterações granulares no CTI com metadata de keyframes,
expressões protegidas sem mudança dos demais alvos, seleção bloqueada/vazia/
obsoleta, leitura de alterações em Effect Controls, slots fixos, remoção isolada,
fundo com duração/PAR corretos e cinco aplicações em dez camadas. Ela não renderiza
o efeito nem executa Undo nativo ou save/reopen. Esses dois últimos fluxos foram
exercitados separadamente na rodada 2 de lifecycle, com **12/12 PASS** e nenhuma
diferença estrutural nos pares de Undo/Redo/reabertura. A atualização mudou apenas
o ângulo animado no CTI, manteve 53 slots nativos e a expressão `value * 2`;
remoção preservou texto editável, Slider Control e comentário. O fundo foi
verificado em 1280×720/PAR 1,3333. Capturas incompletas da primeira rodada foram
arquivadas em `lifecycle-first-pass`; não são usadas para concluir equivalência.
A perda de seleção observada na remoção motivou uma correção no adapter,
coberta por regressão automatizada e pela rodada real completa.

O núcleo standalone cobre os três modos, project/sRGB, alpha suave/parcial/vazio,
HDR/negativo, brilho/difusão, output regional e checkout recortado com halo,
origens transladadas, strides CPU negativos/padding GPU, loop, cancelamento e
geometrias inválidas. A rodada medida teve diferença ROI máxima
`5,34579e-7`; os limites dos testes são `1e-4` para ROI e
`1e-4 × (1 + |CPU|)` para CPU/Metal. Resultados de comparação 1080p/4K estão no
log Metal medido; limites não foram relaxados para acomodar falhas. Na rodada
ASan/UBSan posterior à correção da paleta, a diferença ROI máxima foi
`5,3877e-7`. Os testes novos verificam posições exatas dos stops, continuidade
espacial com cores HDR, quadros temporais vizinhos da emenda do loop e o corte
angular com ciclos fracionários.

## Revisão de continuidade e evidência de cache

A repetição anterior usava um retorno direto do último ponto ao primeiro, o que
produzia uma emenda brusca entre a região clara e escura. A matemática
compartilhada CPU/Metal agora percorre a paleta de ida e volta (`0 → 1 → 0`) e
dobra a coordenada angular antes da repetição. Isso conserva os stops e permite
ciclos, deslocamento e turbulência sem reiniciar a paleta em um corte angular.
As regressões espaciais/temporais passaram no núcleo; a confirmação visual
no After Effects com o binário novo ainda está pendente.

O preset Aurora explícito usa escala 1,35, rotação −18°, volume 0,45,
turbulência 0,5/escala 550 px, brilho 0,55/raio 70 px e difusão 0,65/raio 100 px,
com foco de raio 0,06/suavidade 0,4. As quatro cores originais permanecem.
A difusão é uma aproximação de suavização gaussiana por três passes de box blur
separáveis, e não um filtro gaussiano exato. Os padrões continuam com difusão
desligada e a animação permanece opt-in.

A rodada de render v2 reutilizou cache de disco em CPU Full nos cenários de
camadas mistas/fundo: os pixels eram idênticos aos da paleta anterior à correção.
Essa rodada não serve de prova da melhora visual. A versão interna somente de
Gradient foi elevada de **524289 para 524290**, mantendo matchName, índices,
disk IDs e schema. A nova rodada v3 deve confirmar a invalidação e o resultado
correto após recarregar o módulo. Nenhum cache global ou preferência do usuário
foi apagado. As evidências antigas são mantidas como histórico, sem qualificar
o binário atualizado.

## Desempenho registrado

A rodada de desempenho abaixo antecede a revisão de continuidade da paleta;
ela registra o código medido, sem atribuir os mesmos tempos ao binário atualizado.
Aquecimento e **cinco chamadas medidas** em cada resolução, efeitos habilitados
(defaults mais difusão 0,5 e grain 0,1). Os tempos incluem alocação e render do
núcleo; Metal inclui dispatch, espera pela conclusão e liberação. CPU usa alpha
elíptico e Metal usa alpha padronizado para comparação de pixels; portanto não
se calcula uma razão de aceleração entre essas fixtures diferentes. Outros
trabalhos estavam ativos no Mac.

| Caminho / resolução | Cinco tempos em ms | Mediana em ms | Pior em ms |
|---|---|---:|---:|
| CPU / 1920×1080 | 116,384; 115,980; 113,792; 114,292; 114,888 | 114,888 | 116,384 |
| CPU / 3840×2160 | 729,662; 723,021; 775,902; 750,450; 616,172 | 729,662 | 775,902 |
| Metal / 1920×1080 | 43,4316; 48,7178; 38,3862; 37,4678; 37,2263 | 38,3862 | 48,7178 |
| Metal / 3840×2160 | 197,298; 209,030; 198,839; 184,759; 228,529 | 198,839 | 228,529 |

`/usr/bin/time -l` registrou maxRSS do **processo completo de testes e benchmarks**
em cada caminho: CPU **1.127.170.048 bytes / 1.075,0 MiB**; Metal
**1.260.355.584 bytes / 1.202,0 MiB**. Esses valores agregam testes, comparação,
1080p e 4K e não são memória por frame ou consumo GPU isolado. O campo adicional
peak memory footprint foi 1.127.236.832 bytes no CPU e 2.188.232.360 bytes no
Metal; ele é uma métrica distinta de RSS.

No AE real, aplicar em dez camadas levou **57, 72, 65, 58 e 64 ms**,
mediana **64 ms**, pior **72 ms**, excluindo renderização. A meta próxima de um
segundo foi atendida nessa fixture. A meta de resposta local do painel até
100 ms continua **NOT RUN**, assim como benchmark de render do host com memória
por cenário.

## Instalação, recuperação e limites

O instalador existente faz backup e atualiza a instalação encontrada, evitando
duas cópias do bundle. O destino nativo registrado é
`/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/MotionCore.plugin`;
o CEP fica em
`/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`.
Nenhuma preferência/cache é removida. A assinatura é ad-hoc de desenvolvimento,
sem notarização ou qualificação comercial. Após a sessão instrumentada de QA,
a revisão principal deve repor e conferir o bundle comum antes de declarar a
instalação final.

O kernel limita seus quatro buffers intermediários float a **2 GiB por render**.
Mundos do host e buffers de conversão CPU ficam fora desse limite. Frames/raios
excessivos retornam erro de memória sem reduzir qualidade. CPU verifica
cancelamento durante o trabalho; Metal verifica antes de enviar e depois de
concluir, aguardando o trabalho enviado antes de liberar recursos. Um prazo
máximo de um segundo não foi provado para todos os tamanhos/raios.

O seletor de cor do painel usa uma amostra SDR e não é um editor numérico HDR.
Menos de duas cores ativas ou outros valores fora do contrato em Effect Controls
fazem a leitura retornar erro recuperável, impedindo mutação sobre estado
inválido. A biblioteca pessoal é local ao painel; os parâmetros do efeito são
dados nativos do projeto, conservados na reabertura da fixture de lifecycle.

O escopo inicial é After Effects no macOS. Premiere, Windows/CUDA e editor de
malha livre permanecem fora desta entrega. Não se declara suporte a versões
somente porque o SDK compila. O gate de entrega ainda requer consolidação real
de render, MFR e restauração do build comum, conforme a matriz acima.
