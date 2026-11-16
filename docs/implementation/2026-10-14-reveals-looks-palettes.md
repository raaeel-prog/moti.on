# Revelações, Looks e paletas de gradiente — 14/10/2026

Quinta leva do estudo de presets. Ela fecha três categorias que faltavam em relação ao Animation Composer e ao BadFX: revelações por efeito de transição, looks de imagem e gradientes prontos. O levantamento de categorias:
- Moti.on: 252 presets na galeria.
- BadFX: 375 gradientes, 9 looks `.aep`, 112 motion e 48 de texto, além dos MOGRTs do Premiere.
- AC: itens em pré-comp com texto e cores editáveis e som.

Nada de terceiros foi copiado. Receitas, nomes e paletas são do Moti.on, e os efeitos usados vêm com o After Effects (nativos e Cycore).

## Inventário de efeitos (AE real)

`scripts/inspect-native-effects.jsx` listou os 754 efeitos instalados e leu, numa comp temporária apagada no fim, os parâmetros de 74 candidatos. O resultado está em `artifacts/native-effects/inventory.json`. Três achados mudaram o código:

| Efeito | Achado |
|---|---|
| CC Vignette, CC Line Sweep | O match name real é `CS Vignette` e `CS LineSweep` |
| Adicionar granulação (`VISINF Grain Implant`) | Começa em modo de prévia com uma caixa na imagem; o look grava modo 3, Saída final |
| Sapphire, Mettle e outros | Instalados nesta máquina, mas fora das receitas: só nativos e Cycore |

## Entrega

### Revelações (coleção `reveal`, 6 transições)

Cortina (Linear Wipe), Relógio (Radial Wipe), Persiana (Venetian Blinds), Blocos (Block Dissolve), Grade em losango (CC Grid Wipe) e Varredura diagonal (CC Line Sweep).
- A conclusão da transição segue o peso da curva vezes a Intensidade: cobre a camada nas bordas e a descobre no repouso, sem fade.
- Cortina, Persiana e Varredura respeitam a Direção.
- Elas funcionam em Entrada, Saída e Ambos e nos slots de fases.

### Looks (coleção `looks`, 8 estilos)

| Look | Efeitos |
|---|---|
| Fita VHS | Ruído, borrão horizontal, distorção horizontal animada, saturação menor e linhas |
| Tubo CRT | Linhas, curvatura, brilho e vinheta |
| Grão de película | Granulação, oscilação de luz, vinheta e filtro quente |
| Retícula de pontos | CC Ball Action |
| Pontilhado | Ruído e posterização |
| Traço a lápis | Bordas, preto e branco, níveis |
| Quadro a quadro | 8 fps (Posterizar tempo) e fervura das bordas em degraus |
| Sépia antiga | CC Toner, granulação, vinheta e pretos lavados |

- A Intensidade controla a Opacidade do efeito de cada camada da pilha. Assim um look entra e sai com as rampas quando empilhado com Entrada/Saída no slot de Efeito.
- O Quadro a quadro passa da taxa da composição para 8 fps conforme a Intensidade, porque tempo não se mistura.

### Paletas de gradiente (96)

- São 12 famílias de cor (vermelho a rosa) vezes 8 harmonias: Profundo, Análogo, Contraste, Pastel, Neon, Crepúsculo, Duas cores e Névoa.
- As cores são geradas em OKLCH, com a saturação reduzida até caber no sRGB sem mudar o matiz.
- No editor do Gradiente, "Paletas de cor" mostra a família e as harmonias. Aplicar troca só as cores; forma, luz e textura ficam como estão.

## Arquivos

- **Contratos:**
  - `packages/contracts/src/motion-library-reveals-looks.ts` (novo);
  - `gradient-palettes.ts` (novo);
  - `motion-library.ts`: coleções e efeitos novos;
  - `motion-library-requirements.ts`: tabela de efeitos, `libraryUsesDirection`, Cycore também com prefixo `CS `.
- **Host:**
  - `apps/after-effects-cep/host/src/look-effects.jsx` (novo, `MotionLookEffects`);
  - `commands/preset-library.jsx`;
  - `scripts/build-extendscript.mjs`.
- **Cliente:**
  - `apps/after-effects-cep/client/src/motion-library-preview-looks.ts` (novo): recortes das revelações e filtros ilustrativos dos looks;
  - `motion-library-preview.ts`, `preset-gallery.ts` (pastas Revelações e Looks), `preset-phase-editor.ts`, `preset-workspace.ts`, `gradient-editor.ts`;
  - `packages/ui-core/src/components.css`, `locales.ts`.
- **Testes:**
  - novo: `apps/after-effects-cep/tests/preset-reveals-looks.test.mjs` (7);
  - `packages/contracts/tests/gradient.test.mjs` (+2), `gradient-editor.test.mjs` (+1), `motion-library.test.mjs` (+1 regra);
  - contagens atualizadas: catálogo 255, galeria 266, transições da prévia 170.
- **Scripts:** `scripts/inspect-native-effects.jsx` e `scripts/verify-reveals-looks.jsx`.

## Evidência

| Item | Status |
|---|---|
| `npm run check` | PASS — 2.451/2.451, já com as duas correções vindas do AE |
| Inventário de efeitos no AE 26.5x89/Windows | PASS — 754 efeitos listados, 74 com parâmetros |
| Looks no AE real | PASS — 8/8 pilhas sem erro de expressão, Opacidade do efeito igual à Intensidade (60%), granulação em Saída final, PNGs em `artifacts/reveals-looks-verify/` |
| Revelações no AE real, cobertura nas bordas | PASS — 6/6 na segunda rodada: transparência 0 no início e no fim e 1 no repouso. A primeira rodada achou a Grade em losango sem efeito, porque o CC Grid Wipe informa 0–1 mas só completa em 100; foi corrigido |
| Lado das revelações no AE real | PASS — Cortina e Varredura nos quatro lados. A primeira rodada achou cima e baixo invertidos; o ângulo foi corrigido pela medida (0° descobre por cima, 180° por baixo) |
| Paletas | PASS nos testes de contrato e de interface; não dependem do host |
| UI em Chromium 280/360/480/720 | NOT RUN nesta leva |
| Painel instalado, macOS | NOT RUN |

Uma rodada intermediária não terminou: o After Effects estava ocupado com outra automação, que abria projetos de referência em `C:\dev\preset-study\animation-composer\text-export`. A rodada final ocorreu com o AE livre. O script `scripts/verify-reveals-looks.jsx` recarrega o host em teste antes de cada comando, porque um painel aberto pode trocar os globais no meio da rodada.

Status: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED`.
