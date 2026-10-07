# Transições em pré-comp e suavizador — verificação final

Build de desenvolvimento: 0.2.0, `2026-09-18T10:51:14.059Z`.

As oito transições em Câmera > Transições criam uma pré-comp curta acima das camadas. O marcador CUT identifica o pico no tempo atual; mover a pré-comp move o marcador e a animação. Duração e intensidade são editáveis no painel; os demais controles ficam nos Controles do efeito. O seletor Aplicação mantém o modo Camadas selecionadas. As miniaturas do modo pré-comp começam neutras, atingem o pico e voltam ao estado neutro.

O suavizador usa um gráfico horizontal com guias discretas, alças operáveis por mouse e teclado e biblioteca sem molduras. Favoritos, curvas salvas e o modo Criar animação continuam disponíveis.

## Evidência

- `artifacts/camera-ease-0917/check-final.log`: lint, tipos, build, validação e contraste PASS. Testes gerais: 1244/1266 PASS; 22 FAIL, os mesmos nomes de falha do registro anterior `artifacts/video-fixes-0917/check-final.log`. Nenhuma nova falha de teste.
- `artifacts/camera-ease-0917/focused-tests.log`: 39/39 testes focados PASS. A execução geral posterior também cobriu os testes focados após a correção da seleção.
- `artifacts/camera-ease-0917/host-results.json`: 12/12 cenários PASS no After Effects 26.5x89, macOS 26.6.2/64. Incluem as oito receitas com criar/reaplicar/inspecionar/ajustar/converter/remover, seleção, duração compartilhada, valores inválidos e CUT nas bordas. Um único Desfazer também PASS, removendo camada, composição e sólido gerados.
- `artifacts/camera-ease-0917/ease-native-results.json`: aplicação da curva em dois keyframes de Scale PASS. Valores e tempos preservados; influências de entrada/saída de 65%. Criação de transição preservando esses dois keyframes selecionados PASS.
- `artifacts/camera-ease-0917/native-contact.jpg`: renders nativos inspecionados, com estado neutro, aproximação do pico e pico das oito receitas.
- `artifacts/camera-ease-0917/ease-ui-results.json` e `ease-scaling-results.json`: gráfico e interações PASS em quatro larguras, com escala de 100–200%. Testes de Bézier/i18n: 23/23 PASS.
- `artifacts/camera-ease-0917/camera-ui-results.json`: galeria PASS em 280/360/720 px, sem overflow; modo pré-comp padrão, duplo clique, duração mínima, modo camada e botão Criar transição.
- `npm run skills:validate`: PASS, executado separadamente porque a suíte geral termina nos testes anteriores com falha.
- `artifacts/camera-ease-0917/install-verification.json`: comparação dos arquivos da build com a instalação local.

Conversão para keyframes usa a precisão numérica nativa do AE; a comparação dos valores usa tolerância de 0,0001. Depois de converter, a animação é editada nos keyframes. Remover a transição elimina a instância na timeline e mantém a composição de origem, como a exclusão nativa de uma camada.

## Instalação

Destino: `/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`.

Backup: `artifacts/install-backups/ae-20260918-075523/previous`.

Reabrir o painel ou reiniciar o After Effects para carregar os novos arquivos.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1244/1266 passed (suíte completa, incluindo contratos)
Contract tests:    PASS para as alterações desta entrega
Golden tests:      PASS — renders e UI revisados
AE host:           PASS — 26.5x89, macOS 26.6.2/64, fixtures isoladas
Premiere host:     NOT RUN — nenhum comportamento Premiere alterado
Performance:       NOT MEASURED
Packaging:         PASS — build e instalação local de desenvolvimento

Overall: NOT READY para release de produção
Blocking evidence:
- 22 falhas anteriores na suíte geral; esta entrega local não certifica um release de produção.
- Matriz de outros hosts/OS e empacotamento assinado não executados.
```
