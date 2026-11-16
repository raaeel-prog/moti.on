# Refinamento gradual da interface AE

Data: 16/10/2026. Referências: Animation Composer e BadFX. Implementação própria em `codex/ui-refinement`, incluindo as alterações locais existentes no início da tarefa.

## Resultado

- Ações de aplicação separadas dos seletores de fase. Entrada, Saída e Ambos executam uma única operação e exibem o resultado real; selecionar, navegar ou dar duplo clique no card não aplica uma transição. A aplicação direta conserva Navegar.
- Botões flutuantes sobre a grade, de 24 px e texto de 11 px, entrada pelo sistema de movimento existente e sombra suave nos próprios botões. Não há faixa reservada, fundo ou borda ao redor. O inspector vazio não ocupa espaço. O fim da grade conserva espaço de rolagem para alcançar o último card.
- Texto azul de valores, ações e categorias com tokens próprios para texto/fundo e contraste verificado. Ícones e tiles de Ferramentas mantêm suas cores e aparência.
- Parâmetros numéricos têm número editável/arrastável, reset individual e slider expansível. Semente mantém campo numérico; timecode continua com entrada e setas próprias.
- **Decisão final do usuário:** no editor de fases, soltar o número ou slider confirma automaticamente; não há botão Aplicar ajustes. Digitação confirma em Enter ou saída do campo; escolhas e checkbox confirmam na mudança. Escape cancela o gesto sem enviar ajuste. O caminho nativo ao vivo mantém seu ciclo próprio; quando indisponível, envia um único `ae.presets.phase-adjust` ao terminar o gesto. Os fluxos legados/câmera/cópia conservam seus controles adequados.
- Caudas Float32 retornadas pelo AE, como `76.5999984741211`, aparecem como `76.6`. A apresentação conserva duas casas disponíveis para passos finos e não cria alteração pendente só por ler a camada. A coluna numérica tem largura limitada.
- Filtro existente aprofundado por unidade textual e família estrutural da receita. Grupos vazios ocultos, Efeitos de texto separado e nenhuma receita criada para preencher a árvore. IDs, dados salvos, favoritos e busca preservados.

## Evidência

| Camada | Resultado | Limite |
|---|---|---|
| Repositório | `npm run check`: 2.496 testes, lint, tipos, build, validação e skills | Executado na cópia isolada com o trabalho local preservado. |
| Contraste | 188 combinações PASS | Inclui 36 pares para novos tokens de ação. |
| Dependências | `npm audit --json`: zero vulnerabilidades | PostCSS explicitado como dependência de desenvolvimento de um teste já existente; atualizações transitivas pontuais. |
| Navegador | 17 verificações PASS | Componentes reais com dados e respostas simulados; não equivale a execução no Adobe. |
| Responsivo | 280, 360, 480 e 720 px, mais 280 × 280 px | Capturas antes/depois; sem overflow horizontal. Pixels dos tiles de Ferramentas idênticos e geometria card–popover preservada. |
| AE real 26.5x89 / Windows | Selecionar sem aplicar, Entrada, Saída, Ambos, feedback e um Ctrl+Z nativo revertendo Ambos: PASS | Projeto de QA não salvo, extensão `Moti.on UI Review` instalada em paralelo. |
| AE real, confirmação automática | Duração antes/durante/depois de arrastar: 85 / 85 / 90 frames; botão Aplicar ajustes ausente | Uma liberação envia o ajuste. O caminho de arraste ao vivo nativo estava indisponível nesta sessão; esse caminho foi coberto automaticamente, não observado ao vivo. |
| Estudo de referência | Imagens, leitura estática e evidências REA registradas | Execução das interfaces dos fornecedores nesta rodada: NOT RUN. Não é alegada auditoria dinâmica completa. |

Capturas e relatórios locais ficam em `artifacts/ui-refinement/` e `artifacts/ui-refinement-host/` na cópia isolada. O relatório do navegador registra claramente suas respostas simuladas. O recibo do host distingue a rodada inicial com confirmação manual, substituída pela confirmação automática pedida depois.

## Preservação e integração

A cópia inicial incluiu arquivos modificados e novos do checkout compartilhado. A integração copia somente os arquivos desta tarefa, após verificar SHA-256 contra o manifesto inicial, com backup e recibo em `C:/dev/preset-study/ui-refinement-baseline/`. Alterações concorrentes fora desse conjunto, inclusive `plugin/install-dev.ps1`, são preservadas. Nenhum código de host/contrato Adobe precisou mudar para os novos controles.

A folha `ae-refinement.css` é adicionada somente ao bundle AE. Premiere não recebe essa aparência. Após aprovação do resultado, a versão oficial `com.motion.plugin.ae` foi atualizada: 49 arquivos verificados por SHA-256, conta preservada e backup em `C:/dev/preset-study/ui-refinement-baseline/official-install-backup-20261016-002431`. O recibo está em `official-install-receipt.json` nesse diretório. O candidato de avaliação continua com ID e menu próprios. A reabertura/validação visual da instalação oficial foi interrompida pelo usuário com Escape; a evidência real de execução continua identificada como a do candidato.

## Reproduzir

```powershell
npm.cmd run check
node apps/after-effects-cep/tests/ui-refinement.browser.mjs
npm.cmd audit --json
```

O teste de navegador requer o runtime Playwright disponível na máquina; aceita seu caminho como primeiro argumento e o CSS da distribuição anterior como terceiro. O script `scripts/verify-ui-refinement.jsx` prepara somente um projeto vazio e não salvo de QA; os gestos e inspeções reais foram feitos no painel CEP instalado.

O estudo por controle, com fontes e pontos não verificados, está em `docs/research/2026-10-15-ui-controls-ac-badfx.md`.
