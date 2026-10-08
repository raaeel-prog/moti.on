# Coleção Signature: 24 presets de texto premium

Data: 2026-10-07 · Host: After Effects 26.5x89, macOS 27.2.0 (arm64), interface em português.

## O que foi entregue

Uma coleção nova na galeria de presets, **Signature**, com 24 receitas originais em quatro famílias de seis. Elas reaproveitam o pipeline da biblioteca: receita declarativa, a mesma matemática no preview e na expressão, fases independentes de entrada e saída, controles editáveis, Undo, remoção e marcadores.

| Família | Presets |
|---|---|
| Entrada e saída | Véu ascendente, Respiro de entreletra, Cascata de glifos, Horizonte dividido, Troca de foco, Desdobrar da base |
| Cinema | Filme em chamas, Feixe de luz, Projetor antigo, Feixe anamórfico, Quadro deslizante, Foco cromático |
| Luz e matéria | Ignição de brilho, Raios de luz, Tinta que se espalha, Poeira que se forma, Névoa que dissolve, Halo que respira (loop) |
| Variação | Decodificar e revelar, Rolagem de slot, Letras que se reorganizam, Digitação fluida, Palavras alternadas, Entreletra em maré (loop) |

### Caráter de tempo

Cada receita declara `tempo` com o caráter e a janela de duração, em frames da referência de 30 fps:

- **Cinemático** (14 receitas): os efeitos seguem o progresso da transição, não o relógio. A mesma fração do movimento produz o mesmo visual em qualquer duração (teste: `cinematic looks are duration invariant`).
- **Cinético** (8 receitas): o caráter depende da velocidade. Por isso a janela de duração é estreita, e nos looks com rastro o desfoque direcional é proporcional à velocidade real da curva: durações menores rendem rastros mais longos, até 2× o autoral.
- **Loop** (2 receitas): ritmo ajustado por Velocidade (25–200%).

A galeria converte as durações da referência de 30 fps para os frames da composição (por exemplo, 48 f a 30 fps viram 96 f a 60 fps) e limita o campo Duração à janela da receita.

### Curvas novas

`velvet` (Bézier .16, 1, .3, 1), `drift` (.22, 1, .36, 1) e `snap` (chegada criticamente amortecida). As três são monotônicas, terminam exatamente em 1 e não ultrapassam o alvo. Aparecem em Suavização como Aveludada, Cauda longa e Precisa.

### Efeitos

Só efeitos nativos e Cycore instalados com o AE. Os parâmetros são resolvidos por match name (ver `docs/research/after-effects-signature-text-effects.md`). Todo envelope de transição é exatamente zero no repouso. Os efeitos Cycore e o Glow também têm a Opacidade do efeito ligada ao envelope; no Glow ela cai de forma contínua, porque intensidade 0 ainda deixa um halo de alfa em texto.

## Correções de bugs existentes encontrados no caminho

1. **Presets com máscara pela galeria quebravam** (`word-curtain`, `smooth-word-slide`): o caminho de fases não passava os limites do texto (`plan.rect`), e o rollback também falhava. Corrigido em `preset-phases.jsx`, com teste de regressão.
2. **Presets contínuos aplicados pelo painel falhavam**: o dispatcher chama `run(args, context, options)`, e `apply` interpretava `options` como o mapa de Ajuste por camada. Isso afetava os loops de todas as coleções. Corrigido em `preset-library.jsx`, com teste que chama `run` como o dispatcher.
3. O rollback de fases após falha no meio da renderização tentava restaurar expressões de efeitos já removidos e terminava em "Falha ao restaurar". `removeLayer` agora ignora propriedades que já não existem; isso só ocorre em rollback.

## Verificação

| Verificação | Resultado | Evidência |
|---|---|---|
| `npm run check` (lint, tipos, build, validação, contraste, testes, skills) | PASS: 2.190 de 2.190 testes | execução local de 2026-10-07 |
| Testes de host da coleção (`preset-signature.test.mjs`) | PASS: 14 de 14 | expressões finitas, primeiro quadro transparente, repouso neutro, invariância de duração, rastro proporcional à velocidade, glifos determinísticos, rollback ao faltar parâmetro, ciclo de vida, regressões |
| Varredura de parâmetros no AE real | PASS | `artifacts/signature-text-20261007/capability-probe.txt` |
| Aplicação real das 24 receitas pelo dispatcher (`phase-apply`; loops por `apply`) | PASS: 24 de 24, zero `expressionError` | `artifacts/signature-text-20261007/host-results.json` |
| Repouso idêntico ao original (PNG antes × depois, por canal) | PASS: 22 de 22 transições, diferença 0 | `rest-identity.json` |
| Undo nativo em um passo | PASS (8 efeitos e 4 animadores → 0, comentário restaurado) | `host-results.json` → `undo` |
| Re-aplicar, ajustar e remover | PASS (sem duplicar; remoção volta a 0) | `host-results.json` → `lifecycle` |
| Quadros por preset (início, 15%, 35%, 60%, repouso) | gerados | `frames/`, `contact-*.png` |
| Feixe de luz com redução de exposição | IMPLEMENTED_NOT_HOST_VERIFIED | alteração posterior ao último passe no host |
| Painel instalado (CEP) e larguras 280/360/480/720 | NOT RUN | o build do cliente incluiria o trabalho em andamento de outra sessão |
| Salvar e reabrir o projeto; 24/60 fps no host | NOT RUN | — |
| Premiere Pro | não se aplica | animadores de texto são do AE |

## Limites conhecidos

- **Filme em chamas:** nos quadros renderizados, o `CC Burn Film` não abriu buracos de queima visíveis no texto; o que aparece é o tom âmbar e o brilho. O look precisa de uma rodada de ajuste no host.
- **Crash do After Effects:** durante uma sonda isolada do `CC Burn Film` (valores 0–100 com `saveFrameToPng`), o After Effects 26.5 travou e registrou um evento fatal às 20:07. Os três passes completos de verificação, que também usam esse efeito, terminaram sem crash. A causa ainda não foi isolada. Até lá, o look fica marcado como em ajuste.
- **Falta de parâmetro chega ao painel como erro genérico:** a recusa por parâmetro ausente é `CAPABILITY_UNAVAILABLE` no handler, mas o dispatcher só repassa `ROLLBACK_FAILED` e normaliza o resto como `HOST_OPERATION_FAILED`. O projeto volta ao estado anterior, mas a mensagem que o painel mostra é genérica.
- Os três presets que trocariam o conteúdo do texto (ciclo de palavras, contador, digitação com cursor) ficaram fora desta leva, como previsto no plano.
