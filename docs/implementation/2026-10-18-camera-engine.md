# Motor de câmera e aba Parallax — 18 e 19/10/2026

**Pedido do usuário:**
- engenharia reversa (REA) do Parallax do Brazu instalado;
- melhorar o estudo `Moti_on_Estudo_Camera_Integracao.docx` e o Parallax do Moti.on;
- uma categoria profissional de presets de câmera para motion flyers, com suavização, impacto, auto foco, zoom dinâmico, motion blur, 6 eixos e controle total;
- funcionar com o Parallax do Moti.on e sem ele.

**Escolhas do usuário:**
- rig vivo + Bake;
- uma aba nova no topo, ao lado de Suavização, "para manter o padrão";
- substituir pelo motor os 12 movimentos do rascunho;
- estudo v2 em Markdown no repositório e em `.docx`.

Decisão em [ADR 0007](../adr/0007-motor-de-camera.md). O estudo do Brazu é clean-room ([2026-10-18-brazu-parallax-rea.md](../research/2026-10-18-brazu-parallax-rea.md)): comportamento e estrutura, sem desofuscar nem copiar expressões, nomes, presets ou assets.

## Entrega

- **Núcleo** (`packages/contracts/src/camera-kernel.ts`), ES3:
  - `camPose`, `camOrientation`, `camProject`, `camFocusDepth`;
  - `camImpact` e `camPulse` (C1), `camHarmonic` (loop com semente), `camSoftCap` e `camCoverKnee`.
  - O gerador `scripts/build-motion-library.mjs` serializa o núcleo em `host/generated/camera-library.jsx` (`MotionCameraCore` com `source`, e `MotionCameraCatalog`) e falha se o bundler renomear uma função.
- **Receitas** (`camera-presets.ts`): 11 receitas em 5 intenções, com `isCameraRecipe`. Os ids nunca começam com `camera-`.
- **Host:**
  - `host/src/camera/camera-rig.jsx`: plano, adoção do master do Parallax v3 ou par próprio sobre cena 3D (câmera padrão do AE), 9 controles nativos, marcadores com parâmetros, 8 expressões gerenciadas, metadados `[Moti.on.camera.v1]`, rollback e devolução das expressões originais.
  - `host/src/commands/camera-shots.jsx`: `ae.camera.shot.apply`, `.adjust` e `.remove`, `ae.camera.remove` (destrutivo), `ae.camera.inspect` e `ae.camera.bake`.
- **Orientação.** A Orientation é calculada por `camOrientation` com a ordem medida do AE (`Rx·Ry·Rz`), e o roll vai para o Rotate Z.
  - O primeiro desenho usava `lookAt`. A revisão contra `docs/research/after-effects-3d-transform.md` mostrou que `lookAt` deixa um roll implícito quando pan e tilt se combinam (≈ −0,9° com 10°/5°).
  - O harness de Node também imitava `lookAt` com um token falso e não teria visto o erro. Agora ele compõe a matriz real a partir de Orientation e Rotate Z avaliados.
- **Parallax** (`animate-parallax-quick.jsx`):
  - `depthMode` (linear, front, area) e `backgroundDepth`;
  - zoom de referência lido antes da expressão; `pluginVersion` gravado;
  - recusa `move` enquanto o motor dirige o master;
  - o Remove só considera expressões que citam o rig e espera a câmera sair.
  - Em `parallax-advanced.jsx`, o preflight do wiggle aceita frequência até 100, como o controle.
- **Rascunho revertido** cirurgicamente: os 12 movimentos do estudo saíram de `camera-transition.jsx`, `animate-parallax-quick.jsx`, `main.ts`, `preset-gallery.ts` e `locales.ts`. Ficaram as correções que o rascunho trazia (roteamento ao master v3, `transformProperty` de foco e DOF, bake ampliado).
- **Painel:**
  - `client/src/camera-panel.ts`: chips de intenção, cards com prévia SVG de três planos pelo mesmo núcleo, campos, lista de shots com ajuste fino, e ações com Remover câmera em dois cliques;
  - aba `parallax` em `VIEWS` com os segmentos Parallax e Câmera;
  - `packages/ui-core/src/ae-camera.css`, anexado ao tema do AE.
- **Receita ajustada:** Whip Reframe passou de 12° para 5°. O meio-campo horizontal de um flyer vertical é ≈ 10°, e o shot segura a pose final. A 240% volta aos 12° da v1.

## Arquivos

- **Contratos:** `camera-kernel.ts` e `camera-presets.ts` (novos), `index.ts`; `scripts/gen-extendscript.mjs` (`PLUGIN_VERSION`); `scripts/build-motion-library.mjs` (gerador da câmera e saída sem propriedade abreviada).
- **Registro:** `descriptors.ts` (6 comandos; rótulos de Undo próprios para ajustar, mover e remover o Parallax), `undo-labels.ts`; spec §13, §16.12, §17.5 e §22.1.
- **Host:** `camera/camera-rig.jsx` e `commands/camera-shots.jsx` (novos); `animate-parallax-quick.jsx`, `parallax-advanced.jsx`, `camera-transition.jsx`; `scripts/build-extendscript.mjs`; `types/motion-host.d.ts`; `eslint.config.mjs`.
- **Cliente:** `camera-panel.ts` (novo), `main.ts`, `preset-gallery.ts`; `packages/ui-core`: `locales.ts`, `ae-camera.css` (novo); `scripts/build.mjs`.
- **Testes:**
  - novos: `packages/contracts/tests/camera-kernel.test.mjs` (17), `apps/after-effects-cep/tests/camera-shots.test.mjs` (13) e `camera-panel.test.mjs` (4);
  - `tests/build-output.test.mjs` ganhou o parse ES3 do host montado;
  - atualizados: `parallax-quick` (+3), `camera-transition`, `padroes-aceitos`, `preset-gallery`, `preset-preview-lifecycle`, `i18n`, `painel-cobre-comandos`, `ae-refinement` (tema com `ae-camera.css`) e `build-output` (globais `MotionCameraCatalog`, `MotionCameraCore`, `MotionCameraRig`).
- **Script AE:** `scripts/verify-camera-engine.jsx`.
- **Docs:**
  - ADR 0007 (novo) e ADR 0004 (atualização de status);
  - `docs/research/2026-10-18-brazu-parallax-rea.md` e `2026-10-18-estudo-camera-v2.md`;
  - `Moti_on_Estudo_Camera_Integracao_v2.docx` em Downloads, gerado com os estilos da v1;
  - `CHANGELOG.md`.

## Evidência

| Item | Status |
|---|---|
| `npm run check` | PASS — 2.586/2.586, com lint, typecheck, build, contraste e skills (depois das correções vindas do AE) |
| Núcleo: identidade, projeção do Parallax, Orientation contra a matriz medida (< 1e-12), determinismo, loop, impacto, dolly zoom, limites, foco, receitas, ES3 | PASS |
| Host simulado: Hero Push sobre o Parallax, pan+tilt+roll, controles vivos, marcador arrastado, dois shots, ajuste, preflight sem Undo, rollback, foco, foco legado, modo independente, inspect, bake | PASS |
| Painel no navegador (harness com o tema distribuído), 280/360/480/720 px | PASS — sem elemento além da largura; cards em 2/2/3/5 colunas; intenções quebram linha em vez de rolar |
| `scripts/verify-camera-engine.jsx` no AE 26.5x89/Windows (projeto novo e vazio) | PASS — 14/14; resultado em `artifacts/camera-verify/result.json` |
| Host instalado (`scripts/update-windows.ps1 -SkipNative`) carregado no AE 26.5 | PASS — hash igual ao `dist`; os 6 comandos `ae.camera.*` e o Parallax registrados; 11 receitas |
| Painel aberto dentro do AE (aba Parallax), Undo em um passo, macOS | NOT RUN |

## Verificação no After Effects 26.5x89 (Windows), 19/10/2026

| Medição | Resultado |
|---|---|
| Independente: rig criado = câmera padrão do AE (zoom 1500 em 1080×1920) | 0 px |
| Independente: Hero Push, Depth Slide, Arc Hero (pan 14°, tilt −8°, roll 5°, órbita 10°/6°) e Float Loop contra o núcleo, 120 amostras | 0 px (< 0,0001) |
| Expressões das 8 propriedades em 360 quadros | sem erro; 9,9 ms por quadro |
| Marcador arrastado para 2 s com duração de 2 s | a expressão segue (0 px) e o inspect lê 2/2 |
| Foco no título pela profundidade axial | 0 px |
| Motion blur no ataque do Punch In (quadro 121) | renderiza; PNG de 31 KB sem blur e 66 KB com blur, rastro visível |
| Bake por quadro (360 amostras) | 0,0006 px, 0° |
| Parallax (`depthMode: area`): layout 2D mantido, Hero Push começa no layout | 0 px |
| Parallax: Hero Push, Depth Slide, Whip Reframe e Float Loop contra o núcleo | 0 px |
| Parallax: cobertura do fundo (cantos da comp dentro do fundo projetado pelo AE) | pior caso 0,2 px dentro da tolerância do joelho, em 9,2 s |
| Remover o Parallax com o motor ligado | recusado com mensagem |
| Salvar, fechar e reabrir | 0 px antes e depois, sem erro de expressão |
| Remover a câmera e depois o Parallax | camadas 2D de volta, 0 px |

PNGs em `artifacts/camera-verify/`. O projeto `camera-qa.aep` fica com a comp **Moti.on QA Câmera · Demo** (Parallax + Hero Push + Float Loop) para revisão.

### Três defeitos que só o host mostrou

1. **O host inteiro não carregava.** O esbuild imprimia `{ roll: roll }` do núcleo como `{ roll }`, e o ExtendScript recusava o arquivo ("Esperado: :", linha 3170). Todos os comandos do painel sumiriam.
   - O scanner `check-extendscript.mjs` é textual e só varre os fontes escritos à mão; o harness roda em Node, que aceita a sintaxe.
   - Correção: os dois geradores de `scripts/build-motion-library.mjs` usam `supported: { "object-extensions": false }`. A biblioteca de presets saiu byte a byte igual.
   - Novo teste em `tests/build-output.test.mjs`: faz o parse ES3 do host montado com o parser do ESLint (dependência direta), que acusa exatamente esse erro em 96 ms.
2. **A borda do fundo aparecia com pan.** O PNG do Parallax a 10 s (Whip Reframe + fim do Depth Slide) mostrava uma faixa de ~12 px. A cobertura media a sobra só no centro do plano; com pan, o plano fica oblíquo e o lado que se afasta encolhe pela perspectiva.
   - Correção em `camPose`: projeta os quatro cantos do fundo (com a sobra) e calcula o menor zoom que mantém o quadro dentro do quadrilátero; o resultado é exato também com roll.
   - O rig grava a profundidade do fundo (`bz`), então o cálculo vale com o fundo atrás do plano focal.
   - Novo teste do núcleo com pan, tilt e roll, com e sem `bz`. No AE, o pior caso caiu para 0,2 px.
3. **O script rodou cedo demais** na primeira tentativa: com o AE na tela inicial, `app.project` ainda era nulo, e o registro do resultado dependia do host. O script agora tem serializador próprio e explica o caso.

**Limite conhecido:** no modo independente o motor não sabe onde está o fundo, então não há cobertura automática. Com os valores extremos do QA, a borda aparece (`independente-7s.png`). As receitas padrão usam amplitudes bem menores.

Status: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED` (Windows, AE 26.5). O painel aberto dentro do AE, o Undo em um passo e o macOS ficam NOT RUN.

## Fase 2 — coreografias que leem a cena (19 e 20/10/2026)

**Pedido do usuário:** os presets estavam simples demais. Ele queria:
- movimento entre as camadas 3D, reconhecidas automaticamente;
- a câmera saindo lá de trás e aparecendo;
- zoom numa camada, depois em outra, e a volta;
- mais tempo para os movimentos, com foco automático o tempo todo.

Decisões no [ADR 0007](../adr/0007-motor-de-camera.md), itens 12–15.

### Entrega

- **Núcleo** (`camera-kernel.ts`):
  - shot do tipo `visit`, uma pose absoluta: ponto de mira, distância, órbita, roll, lente, arco no meio do trajeto e ponto de foco;
  - `camVisits` dobra as visitas em ordem de tempo e mistura a lente em escala linear;
  - o foco chega a 70% do trajeto;
  - `rig.bz` e `rig.fd` no quadro do rig.
- **Planejador** (`camera-choreography.ts`, só no host, nunca nas expressões):
  - lê a cena e reconhece o fundo;
  - escolhe e ordena os destaques;
  - calcula a distância de cada enquadramento (`camFrameDistance`), o enquadramento de operador (`camReframe`) e a abertura funda (`camDeepPose`);
  - expõe `camPlanChoreography`.
- **Catálogo:** 6 coreografias (Revelação em profundidade, Tour pelas camadas, Sequência completa, Travelling entre camadas, Órbita do protagonista, Mergulho na cena), de 8 a 20 s.
- **Host:**
  - `commands/camera-choreography.jsx` registra `ae.camera.choreography.apply`. O comando:
    - escreve uma visita por passo, com marcador e um controle de intensidade compartilhado;
    - acrescenta a respiração (sem marcador);
    - liga a profundidade de campo e o motion blur;
    - desfaz tudo se algo falhar.
  - `camera-rig.jsx` lê a cena (`scene`, `sceneLayer` com o `mx` da fonte). O foco segue as visitas.
  - `camera-shots.jsx` remove por `groupId` e devolve o motion blur.
- **Painel:**
  - `camera-choreography-view.ts`: cards com prévia das camadas da própria comp, rota em texto e campos de duração, ordem, camadas, destaques, início e intensidade;
  - em `camera-panel.ts`, os modos Coreografias e Shots e a linha do grupo na lista.

### Arquivos

- **Novos:**
  - `packages/contracts/src/camera-choreography.ts` e `packages/contracts/tests/camera-choreography.test.mjs` (7 testes);
  - `apps/after-effects-cep/host/src/commands/camera-choreography.jsx`;
  - `apps/after-effects-cep/client/src/camera-choreography-view.ts`;
  - `scripts/verify-camera-choreography.jsx`.
- **Alterados:**
  - `camera-kernel.ts` (19 testes no núcleo);
  - `camera-rig.jsx` e `camera-shots.jsx` (15 testes no host simulado);
  - `camera-panel.ts` (7 testes) e `ae-camera.css`;
  - `scripts/build-motion-library.mjs`, `scripts/build-extendscript.mjs`, `descriptors.ts`, `undo-labels.ts`;
  - `tests/build-output.test.mjs`.

### Evidência

| Item | Status |
|---|---|
| `npm run check` | PASS — 2.600/2.600, com lint, typecheck, build, contraste e skills |
| Planejador e núcleo: tour do fundo para a frente, texto inteiro na área segura, fundo cobrindo sem zoom no close de texto, abertura funda, Mergulho atravessando com o protagonista só crescendo (cena medida no AE), ordens, limites, ES3 | PASS — 26/26 |
| `scripts/verify-camera-choreography.jsx` no AE 26.5x89/Windows (projeto novo e vazio) | PASS — 6/6: flyer com fundo texturizado, 3 formas, artista com máscara, título, data e logo, Parallax em modo `area`; sem erro de expressão; 13–19 ms por quadro; foco igual ao núcleo no fim dos 25 passos (0 px); folhas em `artifacts/camera-choreography/` |
| `scripts/verify-camera-engine.jsx` com o núcleo final | PASS — 14/14 (projeção 0 px, Bake 0,0006 px, cobertura 0,2 px) |
| Mergulho renderizado quadro a quadro no cruzamento da camada (61 quadros) | PASS — o protagonista só cresce, cobre o quadro e a câmera termina no fundo limpo |
| Painel instalado (`scripts/update-windows.ps1 -SkipNative`) | PASS — hash do host instalado igual ao `dist` |
| Painel aberto dentro do AE, Undo em um passo, macOS | NOT RUN |

### O que as folhas de contato do AE mostraram

**Primeira rodada (19/10):**
- a abertura funda com o artista enchendo o quadro;
- o travelling mostrando só fundo (zoom de cobertura de 1,4–2,3×);
- o título cortado pela órbita.

Daí vieram as regras de `camPoseClear`, o arco em torno do fundo e os limites de visibilidade do protagonista.

**Segunda rodada (20/10):**
1. **Close no título e na data cortava o texto dos lados.** Centralizar uma camada perto da borda mostrava a borda do fundo, e o núcleo dava 13–22% de zoom de cobertura por cima do enquadramento.
   - Correção: `camReframe` desliza o ponto de mira para o centro até o fundo cobrir sozinho; depois reduz a órbita; por último recua.
   - Teste: a camada de texto fica dentro da área segura e o zoom de cobertura fica em 1.
2. **Um título largo (85% da largura) recuava** para caber em 82%. Agora ele avança pelo menos 1,08× enquanto couber em 90%.
3. **Logo pequeno no canto ficava 3,5× maior.** Perto dele, a órbita de 8° varria ~385 px do fundo distante.
   - Correção: a imagem só aceita até 1,25× de cobertura; acima disso, a órbita diminui.
4. **Mergulho terminava com meio artista num fundo vazio.**
   - Correção: novo passo `through`, que atravessa a camada do protagonista e termina no fundo, com a lente aberta para o fundo não passar de 2,2×.
5. **No começo do Mergulho, o artista encolhia.** No modo `area`, ele fica a 357 px do fundo, e a lente final é 0,13. Em escala log, ela abria antes de a câmera se aproximar.
   - Correção: a lente das visitas se mistura em escala linear.
   - Teste com a cena medida no AE: o protagonista só cresce, e o fundo nunca passa de 2,2×.

### Correções no próprio QA

- `saveFrameToPng` volta antes de o arquivo ser gravado. O teste de motion blur falhou uma vez com "PNG vazio", embora o PNG no disco tivesse 66 KB. Os dois scripts agora esperam o tamanho do arquivo parar de mudar.
  - `verify-momentum-presets.jsx` e `verify-stacked-effects.jsx` passaram a usar a mesma espera (20/10). Os dois não foram rodados no AE depois da troca (NOT RUN).
- A checagem de foco cobria só os passos com camada. Agora cobre todas as visitas, inclusive fundo e layout (25 passos).

### Erro interno do AE ao criar texto por script

Depois de algumas execuções, o AE 26.5 mostrou "Erro do After Effects: falha interna de verificação! {no current context}" ao fim de scripts de QA.
- Enquanto o diálogo fica aberto, o AE recusa novos scripts `-r` ("segundo script"). Depois de OK, tudo volta ao normal, e nenhum resultado muda.
- Bisseção na mesma sessão do AE:

  | Variante | Erro |
  |---|---|
  | Só o preâmbulo do script | 0/2 |
  | Flyer sem texto | 0/2 |
  | Flyer só com `addText`, sem editar o TextDocument | 2/2 |
  | Abrindo o viewer depois de criar as camadas | 2/2 |

- A primeira execução depois de reabrir o AE não teve o erro.
- O motor de câmera e as coreografias não participam.
- Fica para investigar se o painel, que também cria texto, pode disparar o mesmo erro.

#### Investigação de 20/10/2026: só acontece no `AfterFX.exe -r`, não no painel

**Conclusão:** é um defeito do canal `-r` (script pela linha de comando), não do Moti.on. O painel não dispara o erro. Nenhuma mudança no produto.

Reprodução no AE 26.5x89/Windows, em duas sessões do AE (uma recém-aberta), só em projetos novos e vazios. Uma sonda em pasta temporária foi rodada pelos dois canais. No painel, ela passou pelo `window.__adobe_cep__.evalScript` do próprio Moti.on, acessado pela porta de depuração do CEP (`.debug` temporário, já removido). O diálogo `#32770` do processo foi detectado e capturado depois de cada execução.

| Canal | Cenário | Diálogo |
|---|---|---|
| `-r` | o script cria uma camada de texto (`addText` ou `addBoxText`) na comp ativa e ela continua selecionada no fim | 41/42 |
| `-r` | igual, mas a camada é desmarcada antes do fim, ou uma camada nova que não é texto vira a seleção | 0/10 |
| `-r` | seleciona no fim uma camada de texto que já existia | 0/2 |
| `-r` | `ae.demo.createComposition` e `ae.elements.insert` pelo `MotionAE.dispatch` | 0/4 |
| painel, inline ou por `$.evalFile` | a mesma sonda, com o texto novo selecionado no fim | 0/23 |
| painel | `ae.demo.createComposition` e `ae.elements.insert` | 0/4 |

- **Fatores descartados no `-r`** (o erro continua):
  - primeira execução logo depois de abrir o AE, no primeiro projeto da sessão;
  - GPU CUDA ou Software;
  - fonte: a padrão do AE desta máquina ("Slowly Move", instalada só no perfil e sem o "·"), trocada para ArialMT depois de criar, ou já nascendo em ArialMT;
  - texto com glifo ausente, TextDocument editado ou não;
  - `beginSuppressDialogs`, grupo de Undo, `$.evalFile` dentro do `-r`, `saveFrameToPng` e `$.sleep`.
- **No painel, nada disparou:** AE em primeiro plano, atrás de outra janela ou minimizado; GPU Software; texto com glifo ausente; vários textos no mesmo projeto; depois de o `-r` já ter dado erro na mesma sessão.
- O diálogo aparece 25–300 ms depois do fim do script (até ~3 s na primeira execução). `WM_CLOSE` no diálogo fecha sem roubar o foco de outro programa.
- A "primeira execução sem erro" da bisseção não se repetiu: na sessão recém-aberta, a primeira execução já deu erro.
- A taxa não é 100%. No `-r`, 1 de 42 passou. A cópia completa de `verify-camera-choreography.jsx` termina com os textos do flyer selecionados e passou 2 vezes sem o diálogo; a rodada de 20/10 com o build anterior tinha dado erro.
- O AE descartou 2 `-r` sem diálogo e sem rodar o script (esporádico).
- **Causa raiz:** interna do AE. "{no current context}" indica uma verificação que roda depois do fim do script, fora do contexto que o canal do CEP tem. Melhor evidência: a mesma sonda, no mesmo AE e na mesma sessão, dá 41/42 pelo `-r` e 0/23 pelo painel.

**Impacto para o usuário:** nenhum observado.
- O Moti.on só roda ExtendScript pelo `evalScript` do painel (`client/src/host-adapter.ts`); o AEGP nativo não executa scripts.
- Os comandos que criam texto também não deixam texto novo selecionado na comp ativa:
  - `ae.demo.createComposition` cria numa comp que não é aberta;
  - `ae.elements.insert` cria dentro da precomp;
  - `ae.text.word-reveal` devolve a seleção original no `finally`.

**Regra para o QA:** um script rodado por `-r` que cria texto deve terminar sem camada de texto nova selecionada.
- `verify-camera-choreography.jsx` agora desmarca as camadas do projeto de QA no `finally`, só depois de passar pela checagem de projeto vazio. Uma cópia rodada em pasta temporária passou 6/6, sem diálogo.
- `text-presets-fixture.jsx`, `text-presets-probe.jsx`, `verify-ui-refinement.jsx` e `probe-elements-capabilities.jsx` também criam texto e não foram revisados.

Status: QA apenas, verificado no host (Windows, AE 26.5). macOS NOT RUN.

Status da fase 2: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED` (Windows, AE 26.5). O painel aberto dentro do AE, o Undo em um passo e o macOS ficam NOT RUN.

## Fase 3 — câmera mais inteligente e dinâmica (24 e 25/10/2026)

**Pedido do usuário**, depois de aprovar as coreografias:
- mais inteligência;
- foco "mais rápido e no foco certo";
- a câmera saindo "lá de trás, mais 2.500": ir até a última camada, o BG, e voltar à posição original, com as coisas aparecendo enquanto ela passa;
- mais movimento ("uma hora no canto e já dá um zoom no outro");
- uma auditoria dos presets de câmera, com correção dos bugs.

Decisões no [ADR 0007](../adr/0007-motor-de-camera.md), itens 16–19.

### Entrega

- **Núcleo** (`camera-kernel.ts`):
  - shot `focus`, que só move o ponto de foco;
  - `vis[8]`, para a visita entregar o foco aos racks;
  - `vis[9]`, o avanço lento depois da chegada (C1, até 15%);
  - rack próprio da visita chegando a 45% do movimento (antes, 70%);
  - peso da visita limitado a 1.
- **Planejador** (`camera-choreography.ts`):
  - `camDeepStart` (abertura por profundidade, lente que segura o fundo, desvio de camadas coladas na lente);
  - `camFocusScore` e `camPlanFocus` (foco por intenção e pela tela, racks de 0,3 s);
  - ordem `spread` com `camScreenAtRest`;
  - impacto, `creep` e roll por passo;
  - opções `depth`, `focus` e `maxFocus`;
  - aviso `depth-adjusted`;
  - catálogo versão 2 com 7 coreografias.
- **Host:**
  - `camera-choreography.jsx`:
    - argumento `depth` (0–20000 px);
    - ordens `auto` e `spread`;
    - cena lida no meio da janela;
    - racks com um Layer Control por camada focada;
    - ótica gravada em `meta.optics`;
    - aviso `CAMERA_DEPTH_ADJUSTED`.
  - `camera-rig.jsx`:
    - limite de 32 shots;
    - leitura da cena num tempo dado, com o indicador devolvido;
    - `lc` (centro local) de cada camada;
    - expressão de foco que lê a camada viva;
    - remoção dos Layer Controls.
  - `camera-shots.jsx`: remove o Layer Control junto com o último rack que o usa, devolve a ótica ao sair a última coreografia e aceita visitas de 8 a 10 valores.
- **Painel:**
  - campo Profundidade nas coreografias que abrem lá de trás;
  - ordens "Da coreografia" (padrão) e "De canto a canto";
  - prévia com o impacto de cada passo.

### Testes

- Núcleo e planejador: 31 testes.
  - Abertura em exatamente Z +2500 com todas as camadas atrás e o fundo só diminuindo no recuo.
  - Cena medida no AE: a câmera passa do artista colado na lente e avisa.
  - Foco no fundo na abertura e em cada camada antes da câmera.
  - Zooms rápidos: de canto a canto, com impacto e avanço nas pausas.
  - Rack que só move o foco, 200% sem extrapolar, `creep` C1 e limitado, validador.
- Host simulado: 16 testes, entre eles os racks com Layer Control por camada e a remoção que devolve a ótica e leva os controles.
- Painel: 7 testes.

### Evidência

| Item | Status |
|---|---|
| `npm run check` | PASS — 2.878/2.878 com lint, typecheck, build, contraste e skills (25/10) |
| Planos simulados nas duas cenas (sintética e a medida no AE em modo `area`) | Abertura Z +2500 exata na sintética; +2763 na `area`, passando do artista que ficaria a 143 px da lente. Racks: Fundo na abertura, cada camada visitada, protagonista na volta. Travelling a Z −1478, antes −2775, com 2 camadas atrás da câmera. Planejamento de 0,3 a 4 ms no Node |
| `scripts/verify-camera-choreography.jsx` no AE 26.5x89/Windows (25/10, projeto novo e vazio) | PASS — 7/7. O flyer de QA agora tem entradas reais: o título escala de 0 e a data sobe 260 px. Resultados: título visitado em todas as coreografias de tour (a cena é lida no meio da janela); abertura a +2763 px com o aviso `CAMERA_DEPTH_ADJUSTED` (o artista ficaria a 143 px da lente); 2–5 racks por coreografia; foco igual ao núcleo em ≤ 0,017 px; sem erro de expressão; 18–54 ms por quadro |
| `scripts/verify-camera-engine.jsx` com o núcleo final | PASS — 14/14 (projeção 0 px, Bake 0,0006 px, cobertura 0,2 px) |
| Painel instalado (`scripts/update-windows.ps1 -SkipNative`) | PASS — hash do host instalado igual ao `dist` |
| Painel aberto dentro do AE, Undo em um passo, macOS | NOT RUN |

### O que as folhas de contato mostraram (25/10)

- Revelação em profundidade e Sequência completa: o primeiro quadro é só o fundo. No recuo surge o artista, depois título, logo e data, até o layout.
- Zooms rápidos e Tour: os saltos aparecem com motion blur; texto inteiro; data em close legível.
- **Corrigido na hora: Travelling entre camadas.** Com o protagonista liberado para encher o quadro, 6 das 8 folhas eram uma parede laranja (o artista em 82–88% do quadro).
  - Agora o protagonista pode ocupar até 55%, e no meio do arco outra camada precisa estar no quadro.
  - Resultado: câmera a Z −2325, o título atravessando o quadro e uma forma passando rente à lente.
- **Corrigido na hora: Mergulho.** Depois da cortina, o fundo vazio ficava ~2,5 s na tela. A coreografia passou para 6 s, com a cortina mais perto do fim e ~1,5 s de fundo.

Status da fase 3: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED` (Windows, AE 26.5). O painel aberto dentro do AE, o Undo em um passo e o macOS ficam NOT RUN.
