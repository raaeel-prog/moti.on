# Motion blur, curvas clássicas e direções — 14/10/2026

T5, T6 e T7 do estudo do Animation Composer 4 e do BadFX (`docs/research/2026-10-12-ac4-badfx-rea.md`). Nada de terceiros foi copiado: as curvas são as fórmulas públicas de Penner, reescritas aqui; os nomes e a UI são do Moti.on.

## Entrega

### T6 — Famílias clássicas de curva

- `libraryEase` ganha `sine`, `quad`, `quart`, `quint`, `expo` e `circ`, cada uma com `-out` (desacelera até o repouso), `-in` e `-in-out`.
  - Cada família parte de uma curva "in" exata em 0 e 1. A exponencial é normalizada, sem o salto de 0,1% da forma clássica.
  - "out" e "in-out" saem por espelhamento.
  - Na Saída, a curva é lida de trás para frente, como todas as outras.
- Contratos:
  - `MOTION_PENNER_FAMILIES`, `MOTION_PENNER_SHAPES`, `parsePennerEasing` e o tipo `MotionPennerEasing`;
  - 18 valores novos em `MOTION_LIBRARY_EASINGS` e no schema;
  - a validação do host passa a usar uma expressão regular.
- Painel: cada família aparece uma vez no seletor de curva, e o seletor "Aceleração" (Out · desacelera, In · acelera, In-Out · os dois) aparece só para elas. Vale na galeria, no editor clássico e no editor de fases.

### T5 — Motion blur ao aplicar

- Opção `motionBlur` (booleana e opcional; ausente não mexe em nada). Liga o switch da camada e, se estiver desligado, o da composição. O Moti.on registra só os switches que ele mesmo ligou: `blur` nos metadados v1 e na raiz de fases.
- O Moti.on desliga só os switches que ligou quando:
  - o preset é removido;
  - a opção é desligada num ajuste;
  - sai a última fase que pedia motion blur.

  O switch da composição continua ligado enquanto outra camada usar motion blur.
- Fases: a camada usa motion blur enquanto qualquer slot (Entrada, Saída ou Efeito) pedir.
- Um rollback devolve os switches da camada e da composição ao estado anterior.
- Painel: checkbox "Motion blur" no ajuste do card, no editor clássico e em cada fase.

### T7 — Caráter e todas as direções

- No ajuste do card, chips de caráter (Suave, Recuo, Ricochete, Quique) escolhem a curva e revelam os controles dela. A curva `overshoot` passa a se chamar Recuo (Back), igual no seletor.
- A grade 2×2 "Todas as direções" mostra cada direção pintada pela mesma `paintLibraryPreview`.
  - O quadro parado é o meio do caminho, onde a curva o coloca. Por isso um Ricochete, que chega cedo, também mostra de onde vem.
  - Só a miniatura sob o ponteiro ou o foco anima, e nenhuma anima com "reduzir movimento".
  - "Original" continua como botão.

## Arquivos

- **Contratos:** `packages/contracts/src/motion-library-math.ts`, `motion-library.ts`, `schemas/command-request.v1.schema.json` e os validadores regenerados.
- **Host:**
  - `apps/after-effects-cep/host/src/commands/preset-library.jsx`: `syncMotionBlur`, validação e rollback;
  - `preset-phases.jsx`: motion blur da raiz e restauração dos switches no rollback.
- **Cliente:**
  - `apps/after-effects-cep/client/src/preset-gallery.ts`: `presetEasingChoices(locale, current)`, `createEasingShapeField`, `motionBlurField`, `directionPicker`, `characterChips`;
  - `preset-workspace.ts` e `preset-phase-editor.ts`;
  - `packages/ui-core/src/preset-approved.css`.
- **Testes:**
  - `packages/contracts/tests/motion-library-math.test.mjs` (+1);
  - `apps/after-effects-cep/tests/preset-motion-blur.test.mjs` (7, novo);
  - `preset-preview-parity.test.mjs` (+1: 18 curvas × 3 fases × 2 receitas);
  - `preset-phase-editor-ui.test.mjs` (+2);
  - `preset-gallery-ui.test.mjs` (+3);
  - `preset-phases-harness.mjs` (switches de motion blur e `comp.layer(i)`).
- **Verificação real:** `scripts/verify-motion-blur-easing.jsx`.

## Evidência

| Item | Status |
|---|---|
| Paridade prévia × host nas 18 curvas, Entrada/Saída/Ambos | PASS |
| Motion blur: liga, preserva o que é do usuário, composição compartilhada, fases, rollback, validação | PASS — 7/7 |
| UI do ajuste do card no Chromium, janela de 280/360/720 px | PASS — popover dentro da janela, nada transborda por dentro, miniaturas 117×86 (280) e 125×90 |
| `npm run check` | PASS — 2.431/2.431. Numa rodada anterior, o teste de temporização de `native-gesture.test.mjs` falhou: ele espera no máximo 2 atualizações em 20 esperas de 10 ms, e os timers do Windows arredondam para ~15,6 ms. Ele falha também isolado (2 de 3 rodadas) e não foi alterado aqui |
| After Effects real 26.5x89/Windows, `scripts/verify-motion-blur-easing.jsx` | PASS — 5/5: liga camada e composição e Remover desliga só o que o Moti.on ligou; switches do usuário preservados; composição continua ligada com outra camada usando motion blur; fases; 18 curvas × 21 frames iguais a `libraryEase` (erro máximo 2,7e-15). A primeira rodada acusou 4/5 por um bug do script (lia uma camada já apagada); corrigido e repetido |
| Painel instalado, macOS | NOT RUN |

Observação: com a janela do tamanho do painel, o popover de ajustes cabe em 280 px (264 px de largura). O transbordo de 8 px anotado na leva anterior foi medido com o painel de 280 px dentro de uma janela mais larga.
