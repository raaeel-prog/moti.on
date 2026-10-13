# Coleção Impulso / Momentum — entrega

Data: 12–13/10/2026 (America/Bahia). Branch: `feat/momentum-presets`.
Pesquisa de origem: [AC4 e BadFX com REA](../research/2026-10-12-ac4-badfx-rea.md).

## O que entrou

Três técnicas novas no motor de presets existente, sem SDK paralelo:

1. **Assentamento físico ajustável ao vivo (T2).**
   - Duas curvas novas em `libraryEase`:
     - `settle-wave` (Ricochete): chegada rápida e seno amortecido;
     - `settle-hop` (Quique): chegada acelerada e quiques parabólicos que perdem altura.
   - As duas terminam exatamente no repouso.
   - Três opções novas (`settleAmount` 0–100, `settleCount` 0,5–8, `settleDamping` 0–100) viram sliders nativos ao vivo: "Ricochete (%)", "Oscilações" e "Amortecimento (%)".
   - Na saída, a mesma curva lida de trás para frente vira uma antecipação única, que cresce com o Ricochete.
   - Qualquer receita pode escolher essas curvas no seletor de suavização.
2. **Sair do quadro de verdade (T3).**
   - Receitas com `travel: "offscreen"` ignoram a distância autoral. Na aplicação, o host mede, na composição, quanto a camada precisa andar na direção escolhida para sair inteira do quadro, com margem.
   - Se a receita gira ou cresce, a camada vira o círculo que ela varre.
   - A medição atravessa parents 2D e converte a direção para o espaço do pai.
   - A distância fica no slider "Distância (px)" e não é multiplicada pela Intensidade.
   - Ao reconstruir a fase, uma distância editada pelo usuário é mantida enquanto a direção não muda.
   - Camada 3D ou parent 3D é recusada antes de qualquer alteração.
3. **Centro da transição (T4).**
   - `pivot: "offset"` com `pivotOffset` em frações do tamanho da camada. O ponto vira um Point Control nativo, "Centro da transição", arrastável no Monitor.
   - Position compensa a rotação em torno desse ponto, no referencial da rotação de repouso. O Anchor Point nunca muda.
   - O centro do usuário sobrevive a reaplicações da mesma receita.
   - Em camadas 3D, só no plano da camada: Orientation e rotações X/Y precisam ser zero.

Também entrou a coleção **Impulso** (`collection: "momentum"`), com 16 receitas próprias (`packages/contracts/src/motion-library-momentum.ts`):

| Categoria | Receitas |
|---|---|
| 2D | Empurrão, Arremesso giratório, Salto crescente, Mergulho de perto, Estalo na largura, Estalo na altura, Giro de chegada, Torção, Pêndulo, Atravessar a lente |
| 3D | Capotagem, Rodopio, Queda em profundidade, Pêndulo profundo |
| Efeitos | Rotação contínua (°/s, ondulação `spin`), Piscar (onda quadrada com semente, `blink`) |

Receitas sem fade começam e terminam invisíveis por geometria: fora do quadro ou com escala zero num eixo. Os testes cobram isso no preview e no host.

## Arquivos

- **Contratos:**
  - `motion-library.ts`: tipos, opções e `MOTION_SETTLE_DEFAULTS`/`MOTION_LIBRARY_EASINGS`;
  - `motion-library-math.ts`: curvas, `spin`/`blink` e `libraryOffscreenDistance`;
  - `motion-library-requirements.ts`: Point Control;
  - **novo** `motion-library-momentum.ts`;
  - `schemas/command-request.v1.schema.json`: chaves novas e lista completa de curvas. Isso corrige também `velvet`/`drift`/`snap`, antes ausentes no schema.
- **Host:**
  - `preset-library.jsx`: validação, `header()` das curvas, controles ao vivo, medição fora do quadro, pivô e preflight;
  - `preset-phases.jsx`: controles listados e valores mantidos ao reconstruir;
  - `scripts/build-motion-library.mjs`.
- **Cliente:**
  - `motion-library-preview.ts`: mesma matemática, distância medida no card e pivô;
  - `preset-gallery.ts`: pasta Impulso, ordenação depois de Signature, busca, seletor, campos de refino e dicas;
  - `preset-workspace.ts` e `preset-phase-editor.ts`: campos de assentamento.
- **Testes:**
  - novos: `packages/contracts/tests/motion-library-momentum.test.mjs` e `apps/after-effects-cep/tests/preset-momentum.test.mjs`;
  - estendidos: matemática, paridade, galeria, preview, workspace e contagens.
- **Verificação real:** `scripts/verify-momentum-presets.jsx` e `scripts/verify-momentum-undo.jsx`.

## Evidência

| Verificação | Resultado |
|---|---|
| `npm run check` (lint, ExtendScript ES3, tipos, build, validate, a11y, testes, skills) | **PASS** — 2.405/2.405 testes (build final, após a revisão de código) |
| Paridade prévia × host, 237 receitas, fases in/out/both | **PASS** — distância fora do quadro normalizada pela medição; pivô verificado na suíte própria |
| Suíte do host Impulso (harness ExtendScript) | **PASS** — 13/13, incluindo os quatro casos da revisão:<br>• escala travada acima de 100% de Intensidade;<br>• Distância ou Centro animados bloqueiam a edição;<br>• parent com escala zero recusado sem mutação;<br>• Reset volta ao padrão e um rollback preserva a geometria ajustada.<br>Também cobre: bordas ocultas, repouso neutro, sliders ao vivo, antecipação, distância medida com parent 2D, recusa 3D sem mutação, centro fixo (rotação base 0° e 30°, ponto movido, reconstrução), loops, remoção completa |
| UI Chromium com CEP simulado, 280/360/480/720 px | **PASS** — 16 cards, campos e dicas presentes, sem rolagem horizontal da raiz. O popover de ajustes fica 8 px cortado em 280 px também nas coleções antigas (pré-existente) |
| After Effects 26.5x89 real, Windows (`scripts/verify-momentum-presets.jsx`) | **PASS** — 21/21 cenários, repetidos no build final:<br>• as 14 transições em "Ambos" aplicam sem erro de expressão em 150 quadros, ocultas nas bordas e neutras no repouso;<br>• o Ricochete muda ao vivo (553,253 → 579,760 px, igual à conta em Node);<br>• distância medida de 678,4 px, idêntica com parent 2D;<br>• 3D recusado sem alteração;<br>• deriva do centro do pêndulo de 1e-13 px, também após mover o ponto;<br>• rotação 90/180° e piscar 0/100;<br>• três receitas 3D renderizadas;<br>• remoção completa.<br>Resultado e PNGs em `artifacts/momentum-verify/` |
| Undo nativo em chamadas separadas (`scripts/verify-momentum-undo.jsx`) | **PASS** no build anterior à revisão: um Desfazer removeu 14 controles e as expressões, restaurou o comentário e preservou o marcador do usuário. No build final, **NOT RUN**: o script agora exige um projeto novo e vazio (a pilha de Desfazer é do projeto inteiro) e recusou o projeto aberto, sem alterá-lo. O caminho de aplicar e desfazer não mudou na revisão. |
| Interação pelo painel CEP instalado | **NOT RUN** |

Status: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED` (AE 26.5x89/Windows por script; painel instalado, macOS e outras versões NOT RUN).

## Correção encontrada no host real

Na primeira execução real, o slider do Ricochete não alterava nada. No motor JavaScript de expressões do AE, `effect(...)(1)` devolve um objeto Property: as contas o convertem em número, mas `typeof` não diz `"number"`, e as curvas compartilhadas testam `typeof` antes de usar os parâmetros.

A correção (`controlExpression` em `preset-library.jsx`) lê todo controle com `Number(effect(...)(1))`. Pontos têm leitura própria (`pointExpression`).

O mesmo defeito fazia o AE ignorar o slider de **Elasticidade** das curvas `spring` já existentes, que voltava sempre ao padrão de 30.

O harness de expressões (`preset-phases-harness.mjs`) agora imita o AE. Sem a correção, falham a suíte Impulso e a paridade das receitas com elasticidade, em camada e em texto.

## Limites conhecidos

- Entrada e Saída têm controles independentes, como já acontecia com duração e intensidade. Em "Ambos" existem dois "Centro da transição".
- A distância é recalculada ao reaplicar se o usuário mudar a direção ou nunca tiver editado o valor. A camada é medida na pose de repouso do início de cada fase.
- Bake de transições aplicadas por fases não faz parte deste comando (limitação anterior do `ae.presets.bake`).
- Empilhar um efeito contínuo com Entrada/Saída, motion blur na aplicação, famílias Penner e variantes por card ficam para as próximas levas (T1, T5–T7 da pesquisa).

## Revisão de código

O agente `code-reviewer` não encontrou nada CRITICAL nem HIGH. Os quatro achados MEDIUM e dois dos LOW foram corrigidos, cada um com teste:

| Achado | Correção |
|---|---|
| Acima de 100% de Intensidade, receitas ocultas por escala zero passavam do zero e apareciam espelhadas | O fator de escala das receitas Impulso com escala negativa fica travado em 0, no host e na prévia. |
| Distância ou Centro animados eram achatados ao reconstruir a fase | A inspeção devolve conflito, como acontece com os outros controles animados. |
| Um parent com escala zero só falhava no meio da reconstrução, e o rollback também falhava | O preflight mede antes de mutar e recusa o caso. |
| O rollback perdia a geometria ajustada | O rollback carrega os valores ajustados para as fases restauradas. |
| O Reset carregava a geometria antiga | O Reset volta ao centro autoral e à distância medida. |
| O script de Undo podia desfazer outro trabalho no mesmo projeto | Só roda em projeto novo e vazio. Remove a comp se a preparação falhar e confere o estado antes de desfazer. |
| Os padrões das curvas de assentamento existiam em três lugares | Teste de concordância entre a curva, o painel e o host. |
