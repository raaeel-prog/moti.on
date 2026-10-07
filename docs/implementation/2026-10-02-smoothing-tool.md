# Suavização como ferramenta dedicada — 02/10/2026

Suavização ganhou entrada própria na navegação principal do After Effects, fora da grade Quick. No topo do editor ficam seis ações: clonar, inverter, inverter valores, duplicar invertido, duplicar invertido no início e duplicar invertido no fim. Mover a seleção para início/fim continua disponível logo abaixo. O gráfico Bézier, seus pontos arrastáveis, campos, biblioteca e modo Criar animação foram mantidos.

Os destinos da camada respeitam seu intervalo visível na composição, preservando a diferença de tempo entre propriedades da mesma camada. Cada camada usa seus próprios limites. A validação recusa colisões e grupos que não cabem antes de escrever qualquer keyframe. Seleção é restaurada depois de escrever todas as propriedades, inclusive após rollback; isso corrige a perda de seleção de propriedades irmãs observada no AE 26.5.

Aplicar mantém o editor aberto e conserva a curva. Seleções sem segmento utilizável recebem orientação específica. Ações ficam indisponíveis durante execução ou sem keyframes selecionados. Avisos de erro permanecem acima do rodapé, deixando Aplicar acessível para uma nova tentativa mesmo em 280 px.

## Verificação

| Evidência | Resultado |
|---|---|
| Check completo: lint, tipos, build, validação, contraste, testes e skills | PASS — 1.881 testes; nenhuma falha ou skip |
| Interface com bundle de produção e transporte CEP simulado | PASS — 21 cenários, 22 capturas; larguras 280/360/480/720, painel curto, escalas 100–200%, teclado, arraste, seleção, busy e recuperação de erro |
| AE 26.5x89 / macOS 27.2: ações de keyframes | PASS — 10 cenários; duplicação/inversão, offsets, limites, colisões, seleção, metadata, expressões e CTI |
| AE 26.5x89: suavização | PASS — 7 cenários; orientação de seleção, valores escalares/vetoriais e preservação do caminho espacial |
| AE 26.5x89: um Desfazer nativo | PASS — duplicação invertida e suavização; valores, tempos, easing, labels, seleção e CTI restaurados |
| Instalação de desenvolvimento | PASS — 43 arquivos comparados byte a byte ao build; backup anterior preservado |

Evidências reproduzíveis: [pasta de QA](../../artifacts/smoothing-tool-20261002/), [check](../../artifacts/smoothing-tool-20261002/check.log), [interface](../../artifacts/smoothing-tool-20261002/browser-results.md), [ações nativas](../../artifacts/smoothing-tool-20261002/native-actions.json), [suavização nativa](../../artifacts/smoothing-tool-20261002/ease-native-results.json), [Desfazer](../../artifacts/smoothing-tool-20261002/undo-native-results.json) e [instalação](../../artifacts/smoothing-tool-20261002/install-verification.json).

`verify-all.jsx` executa ações e suavização em composições temporárias, removidas ao final. Para a prova de Undo, executar `verify-undo-step.jsx` seis vezes: preparar, aplicar clone, desfazer clone, conferir/aplicar ease, desfazer ease e conferir/limpar. O comando Desfazer é resolvido pelo nome localizado em runtime, sem fallback numérico. A primeira tentativa manual teve sequência de Undo não isolada; a prova acima foi refeita com etapas separadas e comparação integral dos snapshots.

Limites: outras versões do AE, Windows e salvar/reabrir não foram testados nesta entrega. O cálculo anterior de velocidade espacial permanece; o teste espacial comprova aplicação e preservação das tangentes, não equivalência da curva normalizada por comprimento de arco. O Premiere não recebeu essas ferramentas. A instalação foi atualizada sem encerrar o projeto do usuário.
