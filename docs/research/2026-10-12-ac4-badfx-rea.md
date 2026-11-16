# Animation Composer 4 e BadFX — engenharia reversa com REA (Motion Presets)

Pergunta: como o Animation Composer 4 (Mister Horse) e o BadFX (BadEdits) constroem e aplicam seus Motion Presets (transições 2D, 3D e efeitos), e que técnicas ainda faltam ao Moti.on?

Data: 12–13/10/2026 (America/Bahia). Máquina: Windows 11, After Effects 2026 (26.5). Licenças dos dois plugins pertencem ao usuário.

Status: concluído para Motion Presets. Texto, transições entre camadas e packs de mídia ficaram fora.

## Método e limites

A pesquisa usou o **REA** (servidor MCP de engenharia reversa) como ferramenta principal, complementado por leitura somente leitura de arquivos.

| Alvo | Ferramenta REA | Resultado |
|---|---|---|
| `AnimationComposer4.aex` | `inspect_pe_resources` (evidência `ev_8a8cceb4…6118`) | PiPL único: `AEgx`, "Animation Composer 4", General Plugin, `EntryPointFunc`, 64 bits. AEGP puro, sem efeito com parâmetros próprios. |
| `AnimationComposer4.aex` | `open_binary` | Aberto; `binary_overview`/`search_strings` indisponíveis (Ghidra/IDA não configurados). Strings lidas com `grep -a`. |
| Painel CEP do AC | `analyze_javascript_application` (`ev_971fece9…b4b5`) | 15 arquivos, 144 achados; o passe semântico estourou o heap nos bundles grandes (`max_heap_mb` padrão). |
| Painel CEP do BadFX | `analyze_javascript_application` + `inspect_analysis_view` (`ev_04c5324b…`, `ev_1cfd6082…`, `ev_4096f8d6…`, `ev_a6557e92…`) | 697 módulos reconstruídos dos source maps; `presetPanel/Preset.tsx` recuperado exato. |
| Painel BadFX ao vivo | `list_browser_targets` em `127.0.0.1:8860` | Alvo em `file://`, excluído pelo provedor CDP do REA. |
| `.ffx` e `.jsxbin` | — | REA sem parser de RIFX/jsxbin; leitura de blocos RIFX e tokens por scripts somente leitura. |

Para aprofundar o AEGP numa próxima rodada: configurar `GHIDRA_INSTALL_DIR` + Java (ou `REA_IDA_MCP_CONFIG`) e repetir `analyze_javascript_application` com `max_heap_mb` maior.

**Clean-room (MASTER_BUILD_SPEC §0.8/§34).**
- **Não feito:** decriptar `.mhcitem`, `.mhprodmeta`, `aeft.json.enc` ou `.jsx.enc`; copiar `.ffx`, expressões, prévias, ícones ou nomes.
- **O que entra no Moti.on:** só técnica e comportamento, reescritos em receitas e matemática próprias.
- **Mudança de método:** a auditoria de 25/09 não decompilou nada. Esta rodada inspecionou binário e bundles com REA, sempre sem quebrar proteção.

## Animation Composer 4.2.6

**Locais:**
- painel: `C:\Program Files\Common Files\Adobe\CEP\extensions\com.misterhorse.AnimationComposer`;
- AEGP: `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore\MisterHorse\AnimationComposer4\AnimationComposer4.aex`;
- conteúdo: `%LOCALAPPDATA%\MisterHorse\ProductManager\Products\3300`, com 471 `.mhcitem` (`MHACCIPF`, criptografados) + 471 `.mhpreview.webm` + 168 itens de suporte.

**Achados:**
- **Transporte.** O painel fala com o AEGP por WebSocket local (`ws://localhost:<porta>/api`, subprotocolo `api.ac.misterhorse.com`). A porta vem de um arquivo em `%LOCALAPPDATA%\MisterHorse\AnimationComposer4`, com fallback por eventos CSXS. Chamadas: `Editor.applyTransitionPreset({id, animateIn, animateOut})`, `applyEffectPreset`, `removePresets`, `copy/pastePresets`. Os `.jsx` só enumeram fontes.
- **Tempo.** Marcadores de camada com parâmetros `zzzzzzzzzzzzzzz_AC*`. Tipo 1 = In (inPoint→marcador), 2 = Out (marcador→outPoint−1 quadro), 3 = Effect (tempo e duração do próprio marcador, com `MarkerEase`). Duração = arrastar marcadores; o Transition Shifter move, alinha e escalona.
- **Expressões geradas.** Uma por propriedade, com combinadores set/add/mul/arrayMul/avg. In, Out e Effect **coexistem** na mesma camada e propriedade.
- **Controles.** Pseudo-efeito pequeno (`Pseudo/MHAC PrCtrl`) via `.ffx` temporário. Intensity e **Center of Transition** (ponto somado ao anchor, sem mudar o Anchor Point).
- **Curvas.** 19 opções: Linear + In/Out/InOut × Quad, Cubic, Quart, Quint, Expo, Bounce. Overshoot por cosseno amortecido que some nos últimos 20%.
- **Motion blur.** Nativo do AE, ligado opcionalmente na aplicação (comp e camada).
- **3D.** Camadas 3D nativas (Rotate X/Y/Z, Orientation, Z); oferece converter a camada.
- **Effects.** Efeitos nativos (Wave Warp, Blur, Glow, Drop Shadow, Displacement, CC Bend It…) dirigidos pelo mesmo sistema.
- **Catálogo.** Criptografado; nomes não recuperáveis sem quebrar a proteção. A gramática pública já registrada em `docs/implementation/2026-09-14-animation-composer/` é `{Ease|Overshoot|Bounce} {Position|Rotate|Scale|Fade…} {From Anchor Point|Around Edge|Two Way} N`.

## BadFX 1.0.4

**Locais:**
- painel: `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\com.badedits.cep` (Bolt-CEP: Vite/React/Redux, source maps, `jsx/index.jsxbin`);
- presets: `%APPDATA%\BadEdits\Packs\Essential Presets AE\Presets\templates`, com 535 `.ffx`, dos quais 112 Motion; Effects em `.aep`; Easing em `.jsx.enc` (AES-GCM).

**Achados:**
- **Sem keyframes.** Os 112 Motion são expressões em Position/Scale/Rotation/Opacity/Anchor Point que leem pseudo-efeitos. O repouso é o valor atual da camada. Deslocamentos são frações do tamanho da camada. Cada direção é um arquivo separado.
- **Tempo.** O pseudo-efeito "Markers" guarda frames de entrada e saída; o painel cria marcadores IN/OUT a partir deles (padrão 20/11; Overshoot 5/10; Bounce 5/21).
- **Cinco sistemas de progresso:**
  - **Normal:** bezier com influências.
  - **Back:** bezier [0.1,1.6,0.4,1], pico de 1,11 a 40%; na saída, antecipação.
  - **Overshoot:** aproximação curta + `1 + A·e^(−d·τ)·sin(2π·f·τ)`.
  - **Bounce:** quiques parabólicos com gravidade, perda por quique e limite de quiques.
  - Variantes **3D** sobre Orientation.
- **Famílias:**
  - Position, Rotate e Scale (X, Y, uniforme), combinadas em PR, PS, PSR e SR;
  - pêndulo com âncora deslocada de 1.600 a 9.000 px;
  - giros X/Y de 360°.
- **Controls** sobre keyframes existentes:
  - Overshoot e Bounce a partir da velocidade do último keyframe;
  - Fader com marcadores;
  - Blinker (onda quadrada ou oscilação com semente);
  - Spinner (°/s);
  - Wiggle com semente.
- **Effects:** `.aep` com pilhas nativas (CRT, VHS, Film, Halftone…) e texturas, importados acima da camada.

## O que faltava no Moti.on

Base: 221 receitas próprias, motor de expressões com sliders e marcadores, prévia SVG com paridade de 1e-4.

| # | Técnica | Antes | Decisão |
|---|---|---|---|
| T1 | Empilhar Efeito + Entrada + Saída | `preset-phases.jsx` recusava efeito contínuo junto de fases | Entregue em 14/10/2026: fases v3, [ADR 0005](../adr/0005-fases-v3-efeito-empilhado.md) |
| T2 | Assentamento físico ajustável ao vivo | Overshoot e bounce fixos; spring só com elasticidade | **Entregue:** curvas Ricochete e Quique |
| T3 | Sair do quadro de verdade | Vetores em px @1080; toda transição exigia fade | **Entregue:** `travel: "offscreen"` medido na comp |
| T4 | Centro da transição / pivô distante | Só `anchor` e `edge` | **Entregue:** `pivot: "offset"` + Point Control |
| T5 | Motion blur ao aplicar | Inexistente | Entregue em 14/10/2026: opção `motionBlur`, [entrega](../implementation/2026-10-14-motion-blur-curves-directions.md) |
| T6 | Famílias Sine…Expo/Circ | 11 curvas próprias | Entregue em 14/10/2026: 6 famílias × In/Out/In-Out |
| T7 | Variantes num card e todas as direções | Um card por receita | Entregue em 14/10/2026: chips de caráter e grade 2×2 de direções no ajuste do card |

Fora do escopo: Controls do BadFX (sobrepõem `ae.animate.inertial`, wiggle e flicker), looks `.aep`, easing de keyframes (já há 28 beziers), texto e transições entre camadas.

A implementação está em `docs/implementation/2026-10-12-motion-momentum.md`. A auditoria e as melhorias do catálogo existente, com os presets novos de borda, pêndulo, batida e moeda, estão em `docs/implementation/2026-10-14-motion-catalog-upgrade.md`.
