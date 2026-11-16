# Brazu 2.0.0 — engenharia reversa da aba Parallax com REA

Pergunta: como o Brazu monta o Parallax PRO e os controles de câmera da aba PARALLAX (PARALLAX, WIGGLE, AUTO FOCUS,
NULL, FOCUS, ZOOM, BAKE, ADJUST) e os presets "Câmera 3D", e o que disso o Moti.on deve superar no Parallax e no novo
motor de câmera?

Data: 18/10/2026. Máquina: Windows 11, After Effects 2026 (26.5). A licença do Brazu pertence ao usuário.

Status: concluído para a aba Parallax e os presets de câmera. Ferramentas 2D, Copilot, transições `.aep`, Beat e
Particles ficaram fora.

## Método e limites

**Locais:**
- painel: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Brazu` (`com.brazu.cep` 2.0.0, CSXS 9, AEFT
  `[0.0,99.9]`);
- pacote: `Downloads\brazu-2.0.0.zxp` (1238 entradas). SHA-256 idêntico ao instalado em `jsx/index.js`,
  `assets/main-9e68725e.js`, `assets/3DAssets/pseudos/camControl.ffx` e `CSXS/manifest.xml`;
- configuração criada em tempo de execução: `~/Documents/Brazu/CEP Assets/3D/Configs3D.json`.

| Alvo | Ferramenta | Resultado |
|---|---|---|
| Pasta da extensão | REA `analyze_javascript_application` (`ev_da6b6ae9…247b`, resumo `ev_16f5a2b5…bbb`) | 13 arquivos relevantes, 5 JS analisados, 161 754 nós de AST. O passe semântico esgotou o heap de 4 GiB em `assets/main-9e68725e.js` (bundle Vite/React de 535 KB); cobertura parcial. |
| Mesmo grafo | REA `trace_application_feature` com a semente `parallax` (`ev_46580196…dfc7`) | Sem correspondência no grafo parcial. O próprio REA registra que isso não prova ausência. |
| `jsx/index.js` (host ExtendScript, 3711 linhas) | leitura estática | Funções `applyProParallax`, `applyWiggleCamera`, `applyAutoFocus`, `applyCreateNull3D`, `applyFocusZoom`, `applyAutoZoom`, `applyBakePosScal`, `applyEvalConfig`, `applyCameraThreeD`, `newParallaxZXP`. |
| `assets/main-9e68725e.js` | busca de literais | Mapa botão → função da aba PARALLAX e a categoria "Preset Câmera 3D". |
| `assets/3DAssets/pseudos/*.ffx` | leitura de strings RIFX | Nomes e faixas dos parâmetros dos três pseudo-efeitos. |
| `assets/3DAssets/Config3D.jsx` | leitura estática | Diálogo ScriptUI "Ajustes 3D PRO". |

**Clean-room (MASTER_BUILD_SPEC §0.8/§34).**
- **Não feito:** desofuscar as expressões do rig (elas usam ofuscação por vetor de strings); copiar `.ffx`, expressões,
  ícones, nomes de efeitos ou textos.
- **Como o comportamento foi lido:** pela estrutura das expressões (constantes e chamadas visíveis), pela versão antiga
  legível (`newParallaxZXP`) e pelos parâmetros dos pseudo-efeitos.
- **O que entra no Moti.on:** só técnica e comportamento, reescritos em matemática e receitas próprias.

## Mapa da aba PARALLAX

O painel lista oito botões, cada um chamando uma função do host por nome:

| Botão | Função | Undo |
|---|---|---|
| PARALLAX | `applyProParallax` | "PRO Parallax" |
| WIGGLE | `applyWiggleCamera` | "Wiggle Camera" |
| AUTO FOCUS | `applyAutoFocus` | "Auto Focus" |
| NULL | `applyCreateNull3D` | "Create Null" |
| FOCUS | `applyFocusZoom` | "Focus Zoom" |
| ZOOM | `applyAutoZoom` | "Auto Zoom" |
| BAKE | `applyBakePosScal` | "Bake Parallax" |
| ADJUST | `applyEvalConfig` → `$.evalFile(Config3D.jsx)` | — |

Na galeria, a categoria "Preset Câmera 3D" tem **4 itens**: "Zoom Out" de 1, 2, 3 e 4 s, cada um com In e Out,
chamando `applyCameraThreeD(duração, inverter)`.

## Achados

**PARALLAX (rig).**
- Cria uma câmera e um null 3D de controle, com a câmera filha do null.
- A posição local da câmera é `[0, 0, 1 − zoom]`. Zoom, Focus Distance, Depth of Field, Aperture e Blur Level são
  ligados por expressão a um pseudo-efeito no null: Focus, Zoom (padrão 1500), Depth of Field, Aperture (25,3) e
  Blur (100%).
- **Padrões** (zoom 3000, offset 2500, DOF desligado, abertura 25, blur 200) vêm do JSON global em Documents.
- **Camadas selecionadas:**
  - viram 3D e perdem Collapse Transformations;
  - recebem Z de 0 até −offset, pela ordem de seleção (a primeira fica mais perto da câmera);
  - ganham duas expressões e um Point Control "Focus Point" (usado por FOCUS e ZOOM).
- **Escala:** multiplica por `(1 + Z/zoom)`. O tamanho aparente fica preservado.
- **Posição:**
  - prende Z em `[−zoom, 0]` e interpola X/Y linearmente entre o centro da comp (em Z = 0) e o valor autoral
    (em Z = −zoom);
  - só reproduz o quadro original para camadas centralizadas (o caso típico de recortes full-frame de flyer);
  - uma camada fora do centro muda de lugar já no primeiro frame;
  - nada pode ficar atrás do plano focal.
- **Identidade:**
  - procura câmera e null **pelo nome**;
  - depois da aplicação assume que o controle é `comp.layer(1)`;
  - reaplicar adiciona outro "Focus Point" em cada camada.

**Movimento de câmera ("Zoom Out").**
- Três keys em Z do null selecionado.
- A distância vem de `Focus − 50`. Velocidades e influências são fixas: ataque rápido e acomodação longa, ou o
  inverso no Out.
- Um único eixo. Sem controle de curva, intensidade relativa ao formato ou combinação com outros movimentos.

**WIGGLE.**
- **Pseudo-efeito:** Posição (freq 0,5, amp 30, X/Y/Z) e Rotação (freq 0,25, amp 5, X/Y/Z desligados), cada grupo
  com modo avançado por eixo.
- **Expressões:** `wiggle()` em Position e Orientation do null. Como a câmera é filha, a rotação gira em torno do
  ponto focal.
- **Limites:**
  - sem semente ajustável, loop fechado, envelope de entrada/saída ou limite de amplitude;
  - no modo avançado de rotação, as amplitudes lidas são as de posição (defeito).

**AUTO FOCUS.**
- **Pseudo-efeito:** Range (padrão 50) e Disable.
- **Expressão no Focus Distance:**
  - percorre as camadas abaixo da câmera;
  - mede `|Z da camada − Z do plano focal|`;
  - escolhe a menor distância e, dentro do Range, desliza o foco até ela;
  - liga o DOF.
- **Limites:** usa só Z mundial (sem eixo óptico nem rotação da câmera), varre todas as camadas a cada frame, depende
  da ordem da timeline e não tem alvo escolhido, rack nem suavização.

**NULL.** Insere um null pai "LINK n" acima do controle. Isso permite empilhar movimentos (um null por camada de
movimento). Identificado por nome.

**FOCUS.**
- Usa o "Focus Point" da camada selecionada para posicionar o null de controle e grava uma key de foco no tempo atual.
- X/Y saem do ponto escalado. Z sai de uma heurística baseada na altura do ponto. Ctrl grava só foco; Shift, só
  posição.
- Keys sem ease.

**ZOOM.**
- Cria um tour: a cada 2 s o null visita o Focus Point de uma camada selecionada, ajustando o foco, e no fim volta à
  pose base.
- Faz uma rampa de Blur (0 → valor → 0).
- Tempo fixo, keys lineares.

**BAKE.**
- Remove as expressões de posição e escala reconhecidas pelo nome da função ofuscada e congela o valor do frame atual.
- Recusa camadas com keys. Não assa câmera, wiggle, foco nem Z animado.

**ADJUST.** Diálogo ScriptUI "Ajustes 3D PRO" que grava os padrões globais (controle de câmera e wiggle) no JSON em
Documents. Configuração fora do projeto, compartilhada entre trabalhos.

## Comparação com o Moti.on (18/10/2026)

| Tema | Brazu | Moti.on hoje | Decisão |
|---|---|---|---|
| Projeção | Interpolação centro → valor (aproximada) | Exata `k = 1 + z/f` (`animate-parallax-quick.jsx:44-52`) | Manter a exata; permitir fundo atrás do plano focal (k > 1). |
| Identidade | Nome e `comp.layer(1)` | Metadados no master; membros por `Layer.id` | Identidade v4 (ADR 0004): rigId + papel em cada camada. |
| Foco | Plano mais próximo em Z | Axial `dot(T−C, F)`, alvo por nome | Axial, alvo por Layer Control, rack, suavização e fallback. |
| Wiggle | `wiggle()` por eixo | `wiggle()` XY com semente | Orgânico harmônico com semente, loop fechado, envelope, 6 eixos. |
| Movimento | 4 Zoom Out em Z | 11 clássicos + rascunho de deltas fixos | Motor paramétrico com receitas por intenção. |
| Empilhar | Nulls LINK | — | Shots encadeados no mesmo rig (sem nulls extras). |
| Tour de foco | Keys fixas a cada 2 s | — | Gerar shots de reenquadramento + rack com curvas e duração. |
| Bake | Remove expressões no frame atual | Câmera/controller por amostragem | Bake de pose + óptica com erro medido. |
| Padrões | JSON global | Argumentos do comando | Padrões por receita e por rig (no projeto). |

## Ideias a reescrever do zero

- Controlador único com os ópticos ligados (zoom, foco, abertura, blur).
- Ponto de interesse por camada para foco e enquadramento, como alvo arrastável em vez de Point Control solto.
- Camadas de movimento empilháveis.
- Tour de foco entre camadas selecionadas.
- Ajustes padrão editáveis, gravados no projeto.

## Limites desta análise

- O grafo do REA é parcial por falta de memória no bundle principal; os mapeamentos vieram da leitura estática.
- O comportamento das expressões ofuscadas foi deduzido pela estrutura e pela versão antiga legível. Nada foi
  executado no After Effects.
- O render, o desempenho e o comportamento ao reabrir projetos do Brazu não foram medidos.
