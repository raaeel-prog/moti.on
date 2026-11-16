# After Effects 26.5: geometria de texto medida (2026-10-27)

Medições feitas em instâncias isoladas do After Effects 26.5 (x89, Windows), sempre em
projeto vazio com guarda contra o projeto do usuário. Fontes:

- `scripts/text-geometry-probe.jsx`, gera `artifacts/text-presets/geometry-probe.json`;
- `scripts/text-pivot-probe.jsx`, gera `artifacts/text-presets/pivot-probe.json`;
- uma sonda pontual de leitura e espaçamento em `artifacts/text-presets/rig-probe.jsx`.

Os limites vêm de `sourceRectAtTime(t, false)`. Ele inclui os deslocamentos dos animadores
(Position de um animador move o retângulo). A fonte é Arial Bold de 100 px, com o texto
"MOTION PRESETS" e, quando há duas linhas, "MOTION PRESETS\rTEXTO".

## 1. Tracking cresce a partir da borda do alinhamento

| Alinhamento | Repouso (esq…dir) | Tracking Amount 100 | Tracking −50 |
|---|---|---|---|
| Esquerda | 7,1 … 889,7 | 7,1 … **2189,7** | 7,1 … 239,7 |
| Centro | −440,2 … 442,4 | −1090,2 … 1092,4 | −115,2 … 117,4 |
| Direita | −887,5 … −4,9 | **−2187,5** … −4,9 | −237,5 … −4,9 |

- No texto alinhado à esquerda, a borda esquerda fica parada e o texto estica para a direita.
  No alinhado à direita acontece o inverso. Só o centralizado cresce simétrico.
- Essa era a causa do "anima da direita para a esquerda com a esquerda parada".
- 100 unidades acrescentam 1300 px em 13 intervalos: 1 px por unidade, seja qual for o tamanho da fonte.

## 2. Ponto de referência de cada agrupamento (Grouping Alignment 0, 0)

Escala de 50%:

- **Caracteres (1):** cada glifo escala no centro do avanço, **sobre a linha de base**. O topo
  vai de −72,8 a −36,4 e a base fica em ~0. O centro visual de uma maiúscula fica 0,36 em acima
  da linha de base.
- **Palavras (2):** centro de cada palavra, também na linha de base.
- **Linhas (3):** centro horizontal de cada linha, na linha de base, em qualquer alinhamento.
  Por exemplo: 227,2 … 668,5 a partir de 7,1 … 889,7.
- **Tudo (4):** centro da caixa do bloco nos dois eixos, em qualquer alinhamento. Em duas
  linhas, o centro (445,9; 88,2) se mantém.

## 3. Animadores se compõem por caractere

- Âncora (0, −36) e Position (0, −36) num animador com seleção total, mais Scale 50% em outro
  animador: o glifo escala em torno de (0, −36), com topo −53,8 e base −18,0. A ordem dos
  animadores não importa. Rotação de 90° gira em torno do mesmo ponto.
- A âncora sozinha desloca o glifo por −âncora × peso: 36 px a 100% e 18 px com seletor em 50%.
- Duas escalas de 50% se multiplicam (25%).
- **O seletor de expressão satura em ±100%**, tanto escalar quanto vetorial: 300 dá 100 e −250
  dá −100. Para levar deslocamentos arbitrários, o animador usa um vetor de 20000 px e o
  seletor devolve deslocamento × 100 / 20000.

## 4. Contagem do seletor e leitura em expressão

- Em "Caracteres", os espaços contam e as quebras `\r`, `\n` e `\u0003` não contam. O texto
  "AB CD\rEF" dá 7 caracteres, 3 palavras (`Words`) e 2 linhas (`Lines`). Tabulação conta.
- A expressão lê:
  - `text.sourceText.style.fontSize`: 100;
  - `text.sourceText.style.justification`: `alignLeft`, `alignCenter` ou `alignRight`;
  - `text.moreOption.anchorPointGrouping`: 1 a 4;
  - `text.moreOption.groupingAlignment`: "0,0".
- `String(text.sourceText)` devolve o texto com as quebras.
- `threeDPerChar` **não** é legível em expressão. O host precisa decidir isso na aplicação.

## 5. Espaçamento centrado (validado)

Cada caractere desloca-se (coluna − (n − 1)/2) × espaçamento em relação ao centro da própria
linha. Num animador Position com seletor por caracteres, o bloco abre simétrico nos três
alinhamentos:

| Alinhamento | Centro em repouso | Centro espaçado |
|---|---|---|
| Esquerda | 445,9 | 448,4 |
| Centro | 1,1 | 1,1 |
| Direita | −445,7 | −446,2 |

A pequena diferença vem da segunda linha, mais curta, que abre em torno do próprio centro.
