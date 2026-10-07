# Suavizador — redesign e verificação

## Implementado

O gráfico usa proporção horizontal de 328 × 192 unidades, linha principal clara, guias discretas, referência linear pontilhada e pequenos pontos de keyframe. As alças possuem alvo de ponteiro ampliado sem aumentar o ponto visível. A transformação do ponteiro foi ajustada para o gráfico retangular, tanto pela matriz SVG quanto pelo fallback disponível em CEP.

Os modos aparecem como abas compactas; o nome da curva ativa, origem/fim e coordenadas continuam visíveis. A biblioteca mantém pesquisa, favoritos e curvas pessoais, com desenhos sem moldura e seleção por contraste suave. As miniaturas enquadram curvas com overshoot. Favoritos e exclusão aparecem ao passar o ponteiro ou focar o cartão; favoritos ativos ficam visíveis.

O contrato de aplicação e a matemática de easing permanecem nos módulos existentes. Não houve alteração de schema nem migração da biblioteca.

## Arquivos de produto

- `packages/ui-core/src/bezier.ts`: geometria, guias, endpoints e conversão das coordenadas.
- `packages/ui-core/src/theme.css`: bloco final de estilos do suavizador.
- `packages/ui-core/src/locales.ts`: quatro rótulos em português/inglês.
- `apps/after-effects-cep/client/src/ease-editor.ts`: composição visual, nome ativo e enquadramento das curvas da biblioteca.

## Verificações executadas

- `tsc -b packages/ui-core`: PASS.
- `node --test packages/ui-core/tests/bezier-editor.test.mjs packages/ui-core/tests/i18n.test.mjs`: 23/23 PASS.
- ESLint nos três arquivos TypeScript modificados: PASS.
- `node artifacts/camera-ease-0917/verify-ease-ui.mjs`: PASS; 280 × 640, 360 × 720, 480 × 800 e 720 × 900 sem overflow horizontal, gráfico horizontal e ação principal visível. Interações: teclado, arrasto SVG, overshoot, seleção/duplo clique, favorito, salvar/reabrir, modo criar e idioma inglês.
- `node artifacts/camera-ease-0917/verify-ease-scaling.mjs`: PASS; escalas 100%, 125%, 150% e 200%, teclado e arrasto pelo fallback de coordenadas.
- Capturas dos quatro tamanhos e de 200% inspecionadas visualmente. Evidência em `artifacts/camera-ease-0917/ease-*.png`.

## Limite da evidência

Esta etapa testou o componente em Chromium com o mesmo tema e código de produção. O rodapé do harness serve somente para verificar a área disponível em painéis curtos. A integração completa, build/instalação e aplicação real em keyframes de escala no After Effects pertencem à validação da tarefa principal; este relatório não as declara aprovadas.

```text
VERIFICATION REPORT

Build:             NOT RUN — build completo pertence à integração principal
Static validation: PASS — ESLint focal
Types/Lint:        PASS — ui-core e lint focal
Unit tests:        23/23 passed
Contract tests:    NOT APPLICABLE — contratos não alterados neste subtrabalho
Golden tests:      PASS — capturas de quatro larguras revisadas
AE host:           NOT RUN — integração principal
Premiere host:     NOT RUN — integração principal
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE — integração principal

Overall: NOT READY — entrega final depende da integração principal
Blocking evidence:
- Verificação do painel e aplicação de easing no After Effects real.
```
