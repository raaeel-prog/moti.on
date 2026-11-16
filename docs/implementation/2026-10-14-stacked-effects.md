# Efeito empilhado com Entrada e Saída (fases v3) — 14/10/2026

T1 do estudo do Animation Composer 4 e do BadFX (`docs/research/2026-10-12-ac4-badfx-rea.md`). Decisão em [ADR 0005](../adr/0005-fases-v3-efeito-empilhado.md).

## Entrega

- **Fases v3.** A raiz `[Moti.on.library.v3]` tem os slots `in`, `out` e `effect`. Raízes v2 continuam legíveis e são regravadas como v3 na próxima edição.
- **Janela do Efeito.** Marcador `Moti.on Efeito` com duração. O padrão é a camada inteira; se o primeiro frame estiver ocupado, o início avança até 10 frames.
  - Arrastar o marcador ou a duração reprograma o efeito ao vivo.
  - Ajustar e trocar a receita conservam a janela; Restaurar volta à camada inteira.
- **Rampas.** `libraryEffectWindow` (contracts, ES3, serializada na expressão) dá rampas smoothstep de até 6 frames e uma idade que integra o envelope. A rotação contínua desacelera até parar e mantém o ângulo.
- **Aplicar.**
  - `ae.presets.apply` de loop/look entra no slot de efeito quando a camada já tem fases ou uma transição v1; numa camada limpa continua v1, com Converter em keyframes.
  - Entrada/Saída sobre um loop v1 o migram para o slot.
  - `phase-adjust`, `phase-action` e `phase-timing` aceitam `phase: "effect"` (schema e contratos).
- **Painel.** A linha "Efeito" do editor de fases mostra Intensidade, Direção, Velocidade e Variação, sem Duração nem Curva. Ela indica a janela em frames e desloca o cue.
  - O arraste ao vivo fica restrito aos seis parâmetros que o bridge nativo aceita, e só em Entrada/Saída.
  - Isso também evita o erro de arrastar os campos de Ricochete/Quique, que o bridge recusava.
- **Cores.** `preset-colors.jsx` reconhece controles de cor do slot de efeito.

## Arquivos

- Host:
  - `apps/after-effects-cep/host/src/commands/preset-phases.jsx`: v3, slot `effect`, `schedule()` compartilhado por preflight e run, `routesApply`.
  - `preset-library.jsx`: papel `effect` nos marcadores, `effectWindowExpression`, roteamento do Apply.
  - `preset-colors.jsx`.
- Contratos:
  - `packages/contracts/src/motion-library-math.ts` (`libraryEffectWindow`).
  - `preset-workspace.ts` (`PresetPhaseRole`, `markerDuration`).
  - `schemas/command-request.v1.schema.json`, mais os validadores regenerados.
- Build: `scripts/build-motion-library.mjs`.
- Cliente: `apps/after-effects-cep/client/src/preset-phase-editor.ts` (`presetPhaseLabel`, `LIVE_KEYS`).
- Testes:
  - `apps/after-effects-cep/tests/preset-stacked-effects.test.mjs` (9, novo);
  - `preset-phases.test.mjs` (expectativas v3);
  - `preset-phase-editor-ui.test.mjs` (+2);
  - `packages/contracts/tests/motion-library-math.test.mjs` (+1).
- Verificação real: `scripts/verify-stacked-effects.jsx` (6 cenários, comp de QA guardada, sólidos removidos no fim).

## Evidência

| Item | Status |
|---|---|
| Testes primeiro: suíte nova falhando (7/9) antes do host | PASS |
| `npm run check` | PASS — 2.417/2.417 (eram 2.405) |
| Fases, empilhamento e Impulso focados | PASS — 33/33 |
| UI do editor no Chromium, 280/360/480/720 px, Entrada + Saída + Efeito | PASS — nenhum controle transborda; a dica invisível de botão desabilitado (opacity 0) é do componente e já existia |
| Paridade prévia × host | PASS — inalterada (parte do check) |
| After Effects real 26.5x89/Windows, `scripts/verify-stacked-effects.jsx` | PASS — 6/6: três slots, soma das rotações (erro máximo 1,7e-13 em 30 amostras), marcador arrastado e redimensionado ao vivo, ajuste/deslocamento/Restaurar/Remover isolados, migração do loop v1, Piscar sem estalo, marcador do usuário preservado. PNGs em `artifacts/stacked-effects-verify/` |
| Undo nativo do empilhamento | NOT RUN — só em projeto novo e vazio |
| Arraste ao vivo no slot de efeito | NOT IMPLEMENTED — exige ampliar o bridge nativo (Windows e macOS) |
| Painel instalado, macOS | NOT RUN |

Status: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED`. O script carregou o host compilado por `$.evalFile`, o que substitui os globais do painel instalado nessa sessão do AE: reinicie o After Effects antes de usar o painel instalado.
