# Correções dos vídeos de 17/09 — entrega

## Implementado

- O menu `≡` dos presets agora fica ancorado no próprio item, abaixo da miniatura. A prévia continua visível, as quatro direções aparecem diretamente e os demais parâmetros ficam em **Mais ajustes**. Escape fecha o menu e devolve o foco.
- A galeria deixou de desenhar a moldura cinza em volta de cada preset. A prévia ocupa o topo; abaixo ficam nome truncado com tooltip, ajustes e favorito discretos.
- A aba Câmera agora separa **Transições** de **Movimentos 3D**. Entraram oito presets originais: Fade para preto, Clarão suave, Giro para esquerda/direita, Zoom suave/profundo, Distorção fluida e Tremor amortecido.
- As transições de câmera usam efeitos nativos detectados por `matchName`, desfoque com envelope suave, tintas preta/branca e distorção turbulenta. Giro e zoom usam overscan para evitar bordas; shake usa oscilação determinística amortecida. Aplicar, Ajustar, Remover e Bake seguem o ciclo gerenciado existente.

## Evidência

- Transcrição local dos vídeos: `video-1-transcricao.txt` e `video-2-transcricao.txt` nesta pasta.
- Oito transições aplicadas no After Effects 26.5x89 (macOS), com amostras de início, meio e repouso; valores reais foram lidos no host, ajuste não duplicou controles e remoção preservou comentário: **8/8 PASS** em `artifacts/video-fixes-0917/host-results.json`.
- Testes focados de contratos, preview, galeria e Home: **37/37 PASS** em `artifacts/video-fixes-0917/targeted.log`.
- `npm run build`, `npm run validate` e `npm run skills:validate`: PASS. O check geral terminou com **1.230 PASS / 22 FAIL / 1.252**; as 22 falhas são o conjunto preexistente de Beat, inventário do bundle e globais do host.

## Instalação

Build instalada em `/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae` após backup em `artifacts/install-backups/ae-20260917-021128/previous`. Reabra o painel Moti.on para carregar.

## Limite conhecido

A matriz automática de larguras do menu foi preparada, mas o runner CEP encerrou por timeout ao alternar repetidamente o viewport; a checagem compacta manual em 280 px e o teste nativo do After Effects passaram. Não há afirmação de matriz completa de acessibilidade no host.
