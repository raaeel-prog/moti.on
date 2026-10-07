# Arquitetura e migração gradual do Moti.on

Data da análise: 20 de setembro de 2026. Escopo: inventário do código existente, divisão de responsabilidades e critérios para as próximas migrações. Este documento não declara os outros efeitos migrados ou aprovados no After Effects. A evidência de execução do Glitch pertence à entrega desta rodada.

## Decisão principal

O caminho profissional é híbrido: TypeScript no painel e nos contratos, ExtendScript na automação do After Effects, expressões/keyframes/rigs para animação editável e C++ para algoritmos próprios de imagem ou áudio. Escolher a linguagem pela responsabilidade evita perder editabilidade ou reimplementar renderizadores que o After Effects já oferece.

O MD recebido descreve a troca como uma migração de processamento pesado de imagem do JavaScript. Isso não corresponde aos comandos inspecionados: os scripts configuravam efeitos do After Effects, e esses efeitos já processavam os pixels no renderizador do host. O novo Glitch permite controlar um algoritmo próprio, reunir operações e reduzir certas dependências; um ganho de desempenho precisa ser medido, não decorre apenas da troca de linguagem.

A Adobe separa explicitamente scripts/painéis para automação e o SDK de efeitos para processamento de imagem. Ela também descreve presets como configurações reutilizáveis de propriedades, efeitos, keyframes e expressões. Portanto, usar um preset ou automatizar um efeito existente é uma arquitetura válida. O problema é quando o resultado, os controles, a compatibilidade ou a recuperação de erro não cumprem o prometido. Fontes: [portal de desenvolvimento do After Effects](https://developer.adobe.com/after-effects/) e [presets de animação](https://helpx.adobe.com/ee/after-effects/desktop/apply-effects-and-animation-presets/effects-and-animation-presets/effects-animation-presets-overview.html).

## Responsabilidades

| Camada | Responsabilidade | Critério de qualidade |
|---|---|---|
| Painel TypeScript/CEP | Biblioteca, preview, controles, validação inicial e feedback | Controles com unidades claras, chamadas limitadas durante arraste e erros recuperáveis |
| Contratos e dados de presets | Identidade, versão, requisitos e parâmetros declarativos | Dados validados e migráveis; não carregar código arbitrário de presets |
| ExtendScript | Instanciar efeitos, criar/ajustar camadas, keyframes e rigs | Preflight completo, ownership, rollback, Undo coerente e preservação do trabalho do usuário |
| Expressões e keyframes | Avaliar animação nas propriedades do After Effects | Determinismo, tempo correto, editabilidade, limites de custo e Bake quando aplicável |
| SDK de efeitos C++ | Ler buffers e renderizar os algoritmos próprios | Precisão de cor, alpha, dependências temporais, memória, cancelamento e paralelismo corretos |
| Serviço nativo separado, quando necessário | Transcrição, análise de áudio/visão e outros trabalhos longos | Progresso, cancelamento, isolamento de falhas e protocolo versionado |

Um efeito C++ recebe pixels; ele não substitui automaticamente animação por caracteres, objetos de câmera ou geometria de shape layers. O SDK também possui outros tipos de plug-in, mas criar uma integração nativa de automação só se justifica por uma capacidade concreta ausente no caminho atual.

C++ é a opção direta para o SDK utilizado, seus headers e exemplos. Introduzir Rust ou outra linguagem agora acrescentaria uma fronteira de integração sem resolver os defeitos observados. Essa escolha pode ser reavaliada para um núcleo isolado quando houver uma biblioteca ou necessidade que a justifique.

## Inventário real e destino recomendado

Os caminhos abaixo são relativos à raiz `implementation`. O inventário descreve o estado encontrado no início da análise; os reparos concorrentes no Glitch devem ser lidos junto da validação da entrega.

| Ferramenta/família | Implementação encontrada | Destino recomendado |
|---|---|---|
| Glitch | `host/src/commands/effect-glitch.jsx` instancia `CHMS Motion Core`; `plugin/host/MotionCore.cpp` era um protótipo com inversão do canal vermelho acima de um limiar. Havia controles da UI sem comportamento correspondente no render. | Primeiro efeito autoral C++. Fechar o contrato visual, render e integração antes de expandir a família. |
| Wave | `effect-wave.jsx`: modo de distorção com `ADBE Wave Warp`; modo de movimento com expressão de Position. | Manter movimento editável por expressão. Um Wave próprio em C++ só para uma distorção diferenciada ou ganho comprovado. |
| Tile | `effect-tile.jsx`: `ADBE Tile` para repetição de pixels ou grade de duplicatas editáveis. | Preservar os dois objetivos. C++ pode atender um novo algoritmo de repetição; não deve substituir a grade de camadas. |
| Echo | `effect-echo.jsx`: `ADBE Echo` e parâmetros/keyframes de intensidade. | Continuar usando o efeito do AE até haver requisito próprio. Um Echo autoral exige amostragem temporal correta, bordas do clipe, memória e determinismo. |
| Neon | `style-neon.jsx`: estilo de texto mais `ADBE Glo2`, com guardas para parâmetros do host. | Preservar texto editável. Glow próprio pode ser uma família futura, após suporte de cor e benchmark. |
| Particles | `particles.jsx`: `CC Particle World`, sobre a primeira camada selecionada ou um solid novo. | Corrigir primeiro ownership, validação, nomes de propriedades e recuperação. Um simulador de partículas próprio é um projeto separado, com estado temporal e render reproduzível. |
| Texture | `texture.jsx`: importa um arquivo e usa blending/opacity; se não consegue, cria `Texture Placeholder` cinza e retorna sucesso. | Remover a falsa entrega e implementar importação/erro verificáveis. C++ é útil somente se o produto passar a gerar ou processar texturas próprias. |
| Atalhos de efeitos | `quick-tools.jsx`: Hue/Saturation, Fill, Tint, Gaussian Blur, Curves e Lumetri do AE. | Manter como atalhos de automação. Não há benefício demonstrado em recriar todos esses efeitos. |
| Presets de movimento 2D/3D | `preset-library.jsx`, `motion-library*.ts`: transformações, envelopes temporais e expressões. | Fortalecer o motor declarativo e o ciclo Apply/Adjust/Bake/Remove. Manter resultado editável. |
| Presets de texto | Text Animators, selectors, propriedades por caractere/palavra/linha, máscara e expressões. | Manter Text Animators e texto editável. Renderizar tudo em pixels mudaria a natureza da ferramenta. |
| Presets RGB/chroma2 | `preset-library.jsx` usa `Mettle SkyBox Chromatic Aberrat`; chroma2 também usa Tint. | Bom candidato a módulo de separação RGB próprio depois do Glitch, com mapeamento e comparação visual. O nome do efeito encontrado não comprova ausência/presença em toda instalação. |
| Presets extrude/sombra | `preset-library.jsx` aplica sete `ADBE Drop Shadow`; algumas variantes acrescentam Venetian Blinds e CC Composite. | Candidato a algoritmo próprio de sombra longa/extrusão visual para reduzir a cadeia, se qualidade e tempo melhorarem. Isso não se torna geometria 3D apenas por estar em C++. |
| Blur, duotone, contraste, saturação e turbulência dos presets | Cadeias de efeitos existentes mais expressões nos parâmetros. | Manter inicialmente; migrar apenas módulos com vantagem visual ou de desempenho medida. |
| Transições de câmera em overlays | `preset-camera-transition.jsx`: camada gerenciada, Transform, blur, Tint, Turbulent Displace e Exposure conforme receita. | Manter camada e envelope editáveis. Um módulo C++ pode substituir só a parte de pixels, preservando timing e ciclo de vida. |
| Movimentos de câmera | `camera-transition.jsx`: keyframes na câmera. | Permanecer automação de câmera, distinta das transições em overlays. |
| Wiggle, Flicker, LoopOut, Smooth, Inertial e Kinetic | Templates de expressão e controles gerenciados; Jump trabalha com animação de propriedades. | Melhorar determinismo, conflito com animação existente, desempenho de expressões e Bake. Não exigem efeito de pixels. |
| Parallax, Orbit, Look At, Cube, Cylinder e Effector | Camadas, controladores, parentesco, propriedades 3D e expressões/keyframes. | Preservar rigs editáveis e coordenadas corretas. Análise de profundidade futura pode ter núcleo nativo separado. |
| Keys/Ease/Delay/Reverse/Copy/Paste/Clone/Cut, Anchor e Layer tools | Transformações de dados de keyframes/camadas e matemática de coordenadas. | Manter no adapter, compartilhando matemática pura onde couber. Foco em não perder tangentes, interpolação, seleção ou parentesco. |
| Shapes, Trim Path, Break Shape, Text Box, conversões de vetor | Operações sobre estruturas editáveis do projeto. | Manter automação do host. Validar geometria, múltiplos contornos e preservação da fonte. |
| Beat/áudio | `audio-beat.jsx`: análise/aplicação de controles de amplitude e expressões gerenciadas. | Manter aplicação editável; análise intensiva ou detecção própria pode passar a serviço nativo. Não acoplar isso ao efeito Glitch. |
| Time Controller/Marker Loop, composição e organização | Tempo, marcadores, camadas e estrutura do projeto. | Manter automação com Undo e preservação de dados. |

Prefixo dos arquivos de host da tabela: `apps/after-effects-cep/`. Os catálogos ficam em `packages/contracts/src/`. Os arquivos existentes são evidência de implementação, não de aprovação de todos os fluxos no host.

Há documentação histórica atrasada em relação ao código: `docs/ARCHITECTURE.md` ainda lista partes já presentes como futuras, e o aviso da §17 de `MASTER_BUILD_SPEC.md` diz que as transições não foram implementadas. Hoje existem `preset-camera-transition.jsx` e o catálogo `motion-library-camera.ts`. Esse material precisa ser reconciliado com os testes de host antes de orientar um release.

## Como presets passam a usar o núcleo nativo

Presets continuam sendo receitas. Uma receita de Glitch configura o efeito autoral; uma de entrada de texto configura Text Animators; uma combinação pode configurar os dois. Não é necessário compilar um binário para cada preset.

O repositório já tem base declarativa em `packages/contracts/src/presets.ts` (`schemaVersion: 2`, requisitos, controles e `operationPlan`) e em `motion-library*.ts`. A evolução deve aproveitar essa base. O contrato futuro deve distinguir explicitamente a versão da receita, a versão do algoritmo e a versão mínima do efeito, além do identificador estável do efeito e dos parâmetros. Não confundir o índice atual do parâmetro com seu identificador persistido no SDK.

Regras de migração propostas:

1. Manter identidade do efeito e IDs persistidos de parâmetros estáveis; acrescentar parâmetros de forma compatível. Não trocar `matchName` a cada tentativa de build para escapar de cache.
2. Preservar as receitas antigas em projetos salvos. Quando o algoritmo mudar a imagem, publicar nova versão visual e oferecer migração explícita com preview.
3. Detectar dependências e incompatibilidades antes de criar camadas. Efeito nativo ausente produz erro de capacidade com orientação concreta.
4. Atualizar uma instância gerenciada em vez de apagar e recriar seus efeitos a cada ajuste. Preservar keyframes, expressões e efeitos que pertençam ao usuário.
5. Tornar propriedade/controle nativo a fonte de verdade, para que edição no Effect Controls e edição no painel permaneçam coerentes. O projeto deve renderizar com o painel fechado.
6. Gerar preview pelo mesmo caminho visual e com a mesma versão usada na aplicação. Registrar fixture, parâmetros, resolução, fps e versão do renderer.
7. Ao migrar RGB ou sombras, comparar renders da receita antiga e nova. Um visual autoral diferente pode ser desejado, mas não deve ser vendido como equivalência exata sem evidência.

Controles por expressões continuam válidos: a Adobe documenta controles que podem ser animados por keyframes e ligados a outras propriedades. O objetivo é manter o projeto compreensível para o usuário. Fonte: [Expression Controls](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-controls/expression-controls.html).

## Critérios do núcleo de efeitos

| Área | Critério para declarar suporte |
|---|---|
| Imagem básica | Intensidade zero preserva entrada; controles alteram exatamente o comportamento descrito; alpha e limites do buffer são respeitados; não escrever no buffer de entrada. |
| 8/16 bpc | Implementar e testar formatos separados, `rowbytes`, imagens pequenas/ímpar, bordas transparentes e amostragem fora dos limites. O intervalo nominal de 16 bpc do AE usa `PF_MAX_CHAN16`, não a suposição de 65535. |
| 32 bpc/HDR | Implementar o caminho float/SmartFX aplicável com preservação de valores fora de 0–1. Não promover o suporte apenas adicionando uma flag; efeitos 8 bpc podem limitar a cadeia HDR. |
| SmartFX | Implementar `PF_Cmd_SMART_PRE_RENDER` e `PF_Cmd_SMART_RENDER`, checkouts/checkins, retângulos de entrada/saída, ROI e bordas. PiPL e `GLOBAL_SETUP` precisam anunciar as mesmas capacidades realmente existentes. |
| Efeitos espaciais | RGB split/deslocamento dependem de pixels vizinhos: não anunciar `PF_OutFlag_PIX_INDEPENDENT` para esse algoritmo. Tratar resolução reduzida, pixel aspect, offsets e regiões solicitadas. |
| Tempo e aleatoriedade | Resultado determinado por entrada, tempo e seed. Cache correto para tempo, subframes e parâmetros. `frameHold` real precisa obter o frame correspondente; quantizar só o ruído não congela a imagem de entrada. |
| MFR | Ativar `PF_OutFlag2_SUPPORTS_THREADED_RENDERING` somente depois de provar render reentrante, ausência de estado global mutável indevido e uso correto de sequence data/cache. Testar frames fora de ordem e MFR ligado/desligado. |
| GPU | Manter CPU de referência. Implementar e testar o caminho GPU do SDK e backends suportados; medir o custo de transferência. Acrescentar a flag não escreve o algoritmo nem garante aceleração. |
| Interação/Undo | Ajustar controles sem duplicação nem perda de animação. Uma operação do painel tem Undo coerente; falhas não deixam camadas parciais. Undo pertence às mutações do projeto, não ao processamento por pixel. |
| Compatibilidade | Projeto salvo/reaberto, efeito duplicado, composição duplicada, idioma pt/en, render sem painel, ausência/versão antiga do binário, arm64/x64 e Windows conforme matriz publicada. |
| Distribuição | Build reproduzível a partir do SDK, empacotamento conforme exemplo oficial, símbolos de diagnóstico e assinatura/notarização apropriadas ao release. Instalação de desenvolvimento não equivale a release comercial. |

O SDK local 26.5 é a fonte primária para os contratos acima. Em `Examples/Headers/AE_Effect.h`, os comentários de `PF_OutFlag_PIX_INDEPENDENT`, `PF_OutFlag2_SUPPORTS_THREADED_RENDERING`, as flags de SmartFX/GPU e as estruturas `PF_PreRenderExtra`/`PF_SmartRenderExtra` definem essas responsabilidades. `Examples/Effect/SmartyPants/SmartyPants.cpp` demonstra formatos de pixels e o caminho SmartFX; `Examples/Template/Skeleton/` fornece o exemplo de plug-in. Caminho do SDK inspecionado: `/Users/rael/Documents/ChatGPT/AdobeAfterEffectsSDK_26.5_MacOS`.

A Adobe confirma que 32 bpc usa valores float, inclusive abaixo de zero e acima de um, e que 16 bpc tem branco nominal em 32768. Fonte: [profundidade de cor no After Effects](https://helpx.adobe.com/after-effects/desktop/adjust-colors/color-basics/color-basics.html). Essa precisão faz parte da qualidade visual, especialmente para blur/glow; não é apenas uma meta de desempenho.

Legacy Render pode ser uma etapa limitada de recuperação do Glitch. SmartFX, MFR e GPU são evoluções distintas, com critérios próprios; nenhum desses termos deve aparecer como suporte concluído sem implementação e teste. Não é necessário atrasar a prova básica de carregamento por causa de GPU, nem consolidar 8 bpc como arquitetura final de toda a suíte.

## Sequência de entrega

1. **Fechar o Glitch.** Build e reconhecimento do efeito; controles corretos; modo contínuo/one-shot; seed e frequência; compatibilidade declarada para frame hold; Apply/Adjust/Undo; render reproduzível; diagnóstico de efeito ausente. Validar no After Effects real e separar qualquer controle ainda não suportado.
2. **Consolidar o contrato nativo.** Parametrização estável, formatos de pixel, precisão/alpha, testes de imagem e save/reopen. Evoluir SmartFX/32 bpc e MFR com evidência. Cada avanço mantém o Glitch utilizável.
3. **Integrar uma receita nativa à biblioteca.** Reutilizar os controles do Glitch sem criar outro motor de presets. Verificar versão, preview, instância, ajuste e preservação de projetos antigos.
4. **Migrar separação RGB.** Aproveitar o algoritmo validado, definir identidade/controles do módulo e comparar com `rgb/chroma2`. Não substituir automaticamente os visuais de projetos existentes.
5. **Avaliar sombras/extrusão e Glow/Wave/Tile.** Medir custo das cadeias atuais e implementar uma família por vez quando houver benefício. Echo temporal e partículas exigem projetos próprios e entram depois, se o escopo justificar.
6. **Melhorar automação em paralelo.** Corrigir Texture e Particles, unificar metadados/ciclo de vida e eliminar controle sem efeito real. Rigs, animação de texto e ferramentas de keyframes continuam evoluindo no caminho editável.

Para cada família candidata, o comparativo deve fixar entrada, parâmetros, versão do AE, profundidade de cor, fps, resolução, qualidade, máquina e estado do cache. Medir latência de ajuste, tempo de render sem cache e memória em 1080p/4K, com múltiplas instâncias. Registrar diferenças de imagem e manter a CPU como referência ao avaliar GPU. Sem esse comparativo, a migração é uma decisão funcional/visual, não uma otimização comprovada.

## Estado desta análise

| Verificação | Resultado |
|---|---|
| Leitura dos comandos, catálogos e contratos citados | PASS — inventário estático |
| Consulta às páginas primárias da Adobe e headers/exemplos locais do SDK 26.5 | PASS — evidência de arquitetura/API |
| Migração dos outros efeitos e presets | NOT IMPLEMENTED nesta análise |
| Benchmark das alternativas sugeridas | NOT RUN |
| Validação real de cada família fora do Glitch | NOT RUN nesta análise |

Nenhuma recomendação deste documento deve ser interpretada como migração concluída, equivalência visual garantida ou certificação de release.
