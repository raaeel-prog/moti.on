# Correções e simplificação da Suavização — 02/10/2026

Duplicar copia todos os keyframes selecionados para a posição atual do cursor, preservando valores, intervalos, suavização e seleção das novas cópias. Duplicar e inverter cria todas as cópias um frame após a seleção, sem consumir o keyframe da junção. Os botões para duplicar invertido no início/fim da camada continuam no topo. Os defaults legados dos comandos usados fora dessa tela foram preservados.

Os seis botões têm tooltip próprio com nome e descrição em hover e foco; a dica também explica quando falta uma seleção. As dicas fecham ao sair, navegar, rolar, redimensionar ou pressionar Escape. Conflitos reais explicam o destino ocupado antes de qualquer alteração. O executor de mover keyframes também deixou de confundir reordenação com colisão ao atravessar keys não selecionados.

Conforme o último ajuste solicitado, foram removidos do editor os modos “Aplicar à seleção”/“Criar animação” e a linha “Mover seleção” com Início/Fim. O editor aplica a curva aos keyframes selecionados. A curva segue arrastável; as quatro coordenadas ficam em uma linha editável, com vírgula decimal e ajuste por teclado. A biblioteca ganhou miniaturas menores e ferramentas de salvar/buscar sob demanda. Buscar abre o campo diretamente. Aplicar permanece disponível no rodapé, inclusive no painel estreito.

## Verificação

| Evidência | Resultado |
|---|---|
| Check completo: lint, tipos, build, validação, contraste, testes e skills | PASS — 1.891 testes, nenhuma falha ou skip |
| Bundle de produção em Chromium, transporte CEP simulado | PASS — 24 cenários, 25 capturas; hover/foco, controles indisponíveis, precisão numérica, salvar/buscar, arraste, erros e larguras 280–720 px |
| AE 26.5x89 / macOS 27.2: executor nativo | PASS — 11 cenários, incluindo cópias no cursor, repetição, duas cópias invertidas, início/fim, colisão sem mutação e várias propriedades |
| AE: um Desfazer nativo | PASS — cópia no cursor, cópia invertida e envio ao fim; snapshots de tempos, valores, easing, seleção e CTI restaurados |
| Instalação de desenvolvimento | PASS — 43 arquivos comparados byte a byte ao build; backup anterior preservado |

Evidências: [check completo](../../artifacts/smoothing-repair-20261002/check.log), [interface](../../artifacts/smoothing-repair-20261002/browser-results.md), [executor nativo](../../artifacts/smoothing-repair-20261002/native-results.json), [Desfazer](../../artifacts/smoothing-repair-20261002/undo-native-results.json), [layout final](../../artifacts/smoothing-repair-20261002/browser-360x720.png) e [instalação](../../artifacts/smoothing-repair-20261002/install-verification.json).

As fixtures nativas criam e removem apenas uma composição temporária. `verify-native.jsx` executa os 11 cenários; `verify-undo-step.jsx` usa oito invocações separadas (preparar, aplicar, desfazer, conferir/aplicar, desfazer, conferir/aplicar, desfazer, conferir/limpar). O comando Desfazer é resolvido pelo nome localizado em runtime. A primeira tentativa teve seleção/cursor alterados entre etapas; o registro foi preservado como `undo-interrupted-attempt.json` e a sequência foi repetida de forma isolada, com rastreio a cada etapa.

Limites: as interações visuais foram verificadas no bundle de produção em Chromium; o executor foi verificado no After Effects real. Hover dentro do CEP, Windows, outras versões e salvar/reabrir projetos não foram verificados nesta revisão. O Premiere não recebeu essas ferramentas. Os arquivos da instalação de desenvolvimento são conferidos byte a byte e a instalação anterior é preservada em backup.
