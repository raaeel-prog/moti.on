# Marcadores editáveis da biblioteca Moti.on

Decisão: 25 de setembro de 2026; atualização em 26 de setembro. Alvo: After Effects 25+, CEP/ExtendScript. Os marcadores por arraste foram verificados na instalação 26.5x89; o novo comando de organização também passou por quatro cenários reais nessa instalação. Undo específico e pacote final permanecem pendentes.

## Comportamento

Presets de transição criam `Moti.on In` no fim da entrada e `Moti.on Out` no começo da saída. Arrastar um marcador altera a duração daquela fase imediatamente, incluindo seletores de caracteres, palavras e linhas. Os tempos de In e Out ficam independentes, usando a mesma receita; intervalos sobrepostos são reduzidos proporcionalmente para caber na camada. Marcadores coincidentes em uma camada curta usam um único `Moti.on In / Out`.

Reaplicar preserva os marcadores arrastados enquanto o valor de duração enviado permanece igual. Alterar a duração no painel reposiciona os marcadores a partir dos limites da camada. O controle nativo Duração continua sendo uma escala proporcional dos intervalos; seus keyframes e expressões permanecem intactos. Presets contínuos e efeitos estáticos não criam marcadores de transição.

O ownership usa os parâmetros `Moti.on.instance` e `Moti.on.phase`, não o comentário. Renomear um marcador não quebra a animação. Aplicação e ajuste não substituem marcadores do usuário: um tempo ocupado produz erro antes de modificar qualquer camada. Duplicações de um marcador próprio também produzem erro antes de ajuste; a remoção reconhece apenas os parâmetros da instância. Marcadores apagados usam Duração como fallback e são recriados numa nova aplicação.

O fingerprint do editor inclui os tempos dos marcadores; um ajuste com leitura antiga é recusado depois de arrastar. Undo, rollback de aplicação e de bake preservam os markers anteriores. Bake amostra a expressão resultante antes de remover os marcadores próprios e o ownership. Remover limpa os marcadores próprios; os demais conservam comentário, duração e parâmetros.

## Evidência e APIs

| Verificação | Símbolos | Fonte | Observação |
| --- | --- | --- | --- |
| Leitura de markers em expressão | `thisLayer.marker`, `numKeys`, `key(index).time`, `parameters` | [Referência Adobe de expressões](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | Fonte primária; parâmetros são pares de string. |
| Edição de marcadores na timeline | marcadores pontuais e com duração | [Adobe: layer e composition markers](https://helpx.adobe.com/after-effects/desktop/work-with-layers/work-with-layer-and-composition-markers/layer-markers-composition-markers.html) | O marcador da biblioteca representa o limite da fase. |
| Escrita pelo host | `MarkerValue`, `setParameters`, `getParameters`, `ADBE Marker.setValueAtTime`, `removeKey` | API preexistente no projeto; fixture executável `artifacts/composer-parity-2026-09-25/verify-timing-markers.jsx` | A fixture real confirma escrita/leitura dos parâmetros e avaliação da expressão. Não se trata de API privada. |

Capability gate: existência de `MarkerValue` e métodos de leitura/escrita do marker na camada. Se indisponíveis, a aplicação conserva Duração e retorna aviso explícito. A expressão faz no máximo 250 leituras de marcadores; o preflight recusa uma aplicação cujo total final ultrapassaria esse limite, incluindo os markers que ela precisa criar. Se o usuário acrescentar mais depois da aplicação, apenas os primeiros 250 são consultados e a ausência de um cue próprio usa Duração.

## Organização de marcadores em várias camadas

Question: como organizar os limites das fases já aplicadas sem alterar a animação ou os limites das camadas?

Implementation decision: `ae.presets.timing` opera somente cues de uma instância própria e íntegra do Moti.on. A interface recolhível **Organizar entrada e saída** usa os controles e o tema existentes. A referência pública de fluxo é [Transition Shifter, Mister Horse](https://misterhorse.com/transition-shifter), consultada em 26/09/2026; o código e a semântica abaixo são próprios.

| Operação | Destino do marcador selecionado por fase |
|---|---|
| `shift` / Deslocar | Tempo atual do cue + `frames × comp.frameDuration` |
| `align` / Alinhar | `comp.time`, sem quantizar o cursor |
| `stagger` / Escalonar | `comp.time + ordinal × frames × comp.frameDuration` |

O ordinal começa em zero e segue o índice da camada, crescente (`forward`), decrescente (`reverse`) ou em uma ordem aleatória determinística (`random`). A ordem aleatória parte da lista ordenada e usa Fisher–Yates com semente inteira de 0 a 9.999; o padrão é 17. O contrato exige os quatro campos `operation`, `phase`, `frames`, `order` e aceita `seed` para a ordem aleatória; `phase` é `in` ou `out`, e `frames` é inteiro entre −600 e 600. Alinhar ignora o intervalo, mas mantém a validação do contrato. Valores negativos permitem escalonar ou deslocar para antes do cursor/tempo original. Uma repetição sem mudança é sucesso sem escrita.

Preflight completo antes de mutação:

- Composição ativa, 1 a 50 camadas selecionadas e destravadas; metadata, controles e ownership íntegros.
- APIs nativas de leitura/escrita e seleção de keys de marker disponíveis; até 250 markers por camada.
- Cue próprio da fase presente e único; um preset Ambos exige os dois cues. O marker combinado `Moti.on In / Out` é recusado.
- Duração nativa estática, sem expressão/keyframes, e igual a `markerDurationFrames`. Uma duração escalada alteraria o significado visual do cue, por isso deve ser restaurada antes de usar estas operações.
- Destino dentro dos limites, com duração positiva para a fase, sem sobrepor entrada e saída e sem colidir com qualquer outro marker.

A escrita reaproveita o `MarkerValue` inteiro e restaura a seleção de markers por tempo, pois mover um key muda seus índices. Limites/startTime da camada, keys de animação, expressões, controles, comentário e CTI não são reescritos. O registro do comando fornece uma operação de Undo; se uma escrita falhar, a rotina tenta repor os cues já tocados e retorna `ROLLBACK_FAILED` quando não consegue restaurar tudo. A interface bloqueia execução durante tarefas em andamento ou ajustes locais pendentes e atualiza a inspeção após sucesso.

Fallback: recusar o conjunto antes de modificar qualquer camada quando um alvo for incompatível; a mensagem orienta corrigir os markers, a duração ou a seleção. Não converter silenciosamente esta ação em deslocamento da camada inteira.

Open uncertainty: a fixture nativa do novo comando passou em quatro cenários; o Undo específico permanece NOT RUN. Os próximos testes foram adiados a pedido do usuário para avançar na implementação. A ordem aleatória foi implementada depois dos quatro cenários reais e permanece NOT RUN. Alteração de in/out points, movimento de camadas completas, markers de outros plugins e receitas In/Out independentes não fazem parte deste contrato.

## Verificação

| Verificação | Estado e evidência |
|---|---|
| Check completo anterior à organização de markers | PASS — 1.586 testes; `artifacts/composer-parity-2026-09-25/check-final.log` |
| Criação/arraste, texto, fps, colisão, bake e rollback no AE 26.5x89 | PASS — 6 cenários; `timing-host-results.json` |
| Undo da aplicação em chamada separada | PASS — `timing-undo-results.json`; marker original, nenhum efeito e comentário original restaurados |
| Testes do novo comando e interface | Implementados em `preset-timing.test.mjs` e `preset-timing-ui.test.mjs`; consolidação do check final pendente |
| Workspace integrado | PASS — 30 testes em `workspace-integrated-tests.log`; snapshot anterior à última revisão das variações |
| Shift/align/stagger no AE 26.5x89 | PASS — 4 cenários em `timing-actions-results.json`: preservar estado, ordem da timeline, 24/29,97/60 fps e rejeitar colisão/duração incompatível |
| Ordem aleatória com semente | NOT RUN — implementação posterior à pausa de testes |
| Undo específico de `ae.presets.timing` | NOT RUN — pendente |
| Novo pacote instalado e controles no CEP | NOT RUN — instalação anterior não cobre esta continuação |

As operações acrescentam o comando e o contrato de timing; não mudam os IDs das receitas nem o catálogo. Timing baseado em markers não significa equivalência visual ou de catálogo com outro produto.

## Duração explícita por fase — implementação sem validação posterior

`operation:"duration"` posiciona o cue In em `layer.inPoint + frames * comp.frameDuration` ou o cue Out em `layer.outPoint - frames * comp.frameDuration`, com frames inteiros de 1 a 600. Mantém a outra fase e reaproveita preflight global, proteção de colisão/sobreposição e rollback. A função não altera o slider Duração nem sua referência registrada. Markers combinados e slider escalado/animado continuam recusados. Os quatro PASS anteriores não cobrem esta operação; sua validação fica NOT RUN.
