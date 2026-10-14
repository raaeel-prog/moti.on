# Continuação dos presets de texto — 14/10/2026

## Fatia de implementação

Preservar a galeria, os controles compactos e a remoção da simulação. Completar observação das 25 pastas de famílias instaladas do Composer em uma instância própria do AE. Acrescentar receitas autorais para combinações de decode, movimento com acomodação e dobradura 3D, além de Effects combinados. Corrigir Velocidade e Variação do decode contínuo, compartilhando a função determinística entre expressão e miniatura.

Arquivos previstos: `motion-library-text.ts`, matemática compartilhada, geração do catálogo do host, `preset-library.jsx`, miniaturas, testes, manifesto/assets de render, matriz de cobertura e empacotamento. Sem novo schema ou substituição da área de Presets. IDs existentes preservados; receitas novas usam IDs adicionais.

Riscos: preservar comportamento das coleções antigas, manter componentes IN/OUT/efeito independentes e invalidar os renders quando o motor muda. Testar controles ao vivo, intensidade zero, determinismo, agrupamento, composição e remoção. Rodar o check completo, fixtures reais, render de cada receita, lifecycle e QA de interface. Comparações comerciais ficam somente nos artefatos de pesquisa.

Baseline: `npm.cmd run check` PASS, 2.421/2.421; `artifacts/text-presets/continuation-2026-10-14-before.log`. Instalação anterior confirmada pelos hashes de cliente e host. Trabalhar apenas em `C:/dev/Moti.on-text-presets`; checkout compartilhado preservado. Instalar candidato imutável com backup, inventário/hash e rollback, sem encerrar projeto do usuário.

## Resultado

Biblioteca ampliada de 108 para **120 receitas próprias**: 105 transições e 15 efeitos contínuos, incluindo 23 receitas com 3D real por segmento. Os IDs existentes foram preservados. A galeria anterior, o painel inferior recolhido e os ajustes compactos permanecem; a simulação ampliada continua removida.

| Novidade | Variantes |
| --- | ---: |
| Código em ascensão: decode, posição, escala e tracking | Caracteres, Palavras, Linhas |
| Chegada vibrante: movimento, escala e acomodação irregular | Caracteres, Palavras, Linhas |
| Dobra em sequência 3D: profundidade, X/Y/Z e pivô local | Caracteres, Palavras, Linhas |
| Decodificação e respiro | Effect por caracteres |
| Ondulação tipográfica | Effect por palavras |
| Vibração suave | Effect por linhas |

Velocidade e Variação agora dirigem o decode contínuo e sua miniatura com a mesma função determinística. A condição de criação do controle Variação recebeu agrupamento explícito para o ExtendScript. Intensidade zero mantém os pixels do texto original. Coleções antigas conservam sua rotina de decode.

Foi corrigido o rollback da atualização de rigs antigos: regenerar uma receita com o motor novo não restaurava exatamente um template anterior. A regressão real acrescentava três controles (12 → 15) e deixava a inspeção em conflito. A recuperação agora captura expressões e controles do DOM validado antes da operação, restaura esses snapshots e remove controles introduzidos apenas pela tentativa malsucedida. Não executa fonte de expressão armazenada nos metadados. O teste com o host da instalação anterior confirma comentário, 12 controles, inspeção e identidade restaurados.

O checkout compartilhado recebeu trabalho paralelo de efeitos empilhados durante esta continuação. Seus arquivos e índice não foram escritos por este trabalho. Esse formato também usa a versão 3, mas guarda o efeito em `slots.effect`, enquanto o texto desta entrega usa `textEffect` sem marcador. A leitura agora recusa o formato alternativo antes de editar, evitando ignorar ou apagar seu componente. A união desses formatos requer uma integração específica; não foi feita uma substituição do trabalho paralelo.

## Pesquisa e comparação

O Composer instalado foi observado em **25/25 pastas de famílias**, com 28 aplicações de 26 representantes. Foram registrados seletores, agrupamento, pivôs, easing, máscaras, blur, controles e características/hashes das expressões. Os 25 representantes visuais ficaram em 2D: `Position 3D` ou `Scale 3D` como matchName não comprovam modo 3D. As receitas 3D do Moti.on têm prova nativa própria.

Foram preparados e renderizados 25 pares locais Composer/Moti.on, com texto, fonte, enquadramento, fps, duração, fundo e motion blur equivalentes. Defaults, segmentação de alguns Effects, máscaras e curvas diferem de forma explícita. São comparações de famílias, sem alegação de fórmula ou quadros idênticos. Os arquivos comerciais de estudo ficam fora do pacote. As quatro comparações centrais do BadFX foram atualizadas com os novos renders próprios; a observação anterior dos 48 FFX permanece identificada como evidência anterior.

Evidência: `artifacts/text-presets/continuation-2026-10-14/composer-native/finding-ledger.json`, `family-coverage.json`, `visual/paired-comparison.json`, `composer-comparisons-25.mp4` e `new-text-presets-12.mp4`. O ledger vincula o estudo aos records REA e hashes dos artefatos instalados.

## Verificação

- `npm.cmd run check`: **2.425/2.425 PASS**, incluindo lint, tipos, build, validação, contraste e skills. A primeira execução final encontrou somente dois totais antigos da galeria; foram atualizados para 368 cards (357 receitas + 11 câmeras), e o check completo passou novamente.
- Aplicação real das 120 receitas em oito tempos: PASS no AE 2026 26.5x89/Windows x64, com 23 casos de 3D por segmento e zero erros de expressão.
- **120 MP4 + 120 posters**: PASS, 480 × 270, 24 fps, 96 frames. Datas e hashes dos AVIs, vídeos e posters foram conferidos. A prévia usa receitas e defaults próprios.
- Lifecycle real: **10 casos PASS**, incluindo texto curto, multilinha, paragraph text, acentos/Unicode, estilos mistos, parenting, animação do usuário, 3D, migração da instalação anterior e recusa do formato alternativo. Migração inclui falha parcial com restauração exata.
- Seis verificações de pixels PASS: spring (8.669 pixels alterados), settle-wave (1.103), settle-hop (6.396), velocidade do decode (5.867), seed (6.016) e intensidade zero (zero pixels alterados, igualdade esperada).
- UI: **50 cenários PASS**, PT/EN, 280/360/480/720 px e dock curto. Nas alturas padrão todos os parâmetros cabem; no dock curto a rolagem é limitada ao popover. Zero overflow horizontal, zero aplicação durante navegação e zero simulação ampliada.
- A projeção do código que renderiza uma camada nova é idêntica à usada nos 120 renders. O hash exclui somente a recusa de metadata alternativa e a recuperação de um rig anterior, caminhos que não executam nas fixtures novas. O bundle final foi exercitado separadamente nos dez casos de lifecycle. Os hashes distintos e essa fronteira estão em `final-verification.json`.

Instalação local **PASS**: candidato `99f9fc815b57b828430fbf4841ebbe146ee6cbe7`, ZIP SHA-256 `508d2fe608db9a6c2a8366d627dfc25a0b3f778aec5bcf8f704a9e7695ffdd06`. Foram conferidos 288 arquivos, atualizados 30 e preservado um arquivo privado, com backup integral verificado fora da pasta CEP. O painel foi fechado e reaberto sem encerrar o After Effects ou salvar o projeto do usuário.

O painel recarregado confirmou 357 receitas, incluindo os 120 presets de texto, e a presença da função de decode. A galeria e os ajustes de “Dobra em sequência 3D · Caracteres” foram observados. O inspector abriu na seleção e foi recolhido novamente. A recarga reorganizou o encaixe nativo; o Moti.on ficou no grupo lateral com Propriedades. A biblioteca e a interface de presets permanecem as mesmas. Antes e depois, o projeto manteve um item, nenhuma composição ativa, nenhuma seleção, nenhum arquivo salvo e o estado dirty existente.

Os **12 novos presets instalados** também foram aplicados numa instância própria do AE, em oito tempos cada, com texto editável e zero erros de expressão; três confirmaram 3D por segmento. O host instalado tem SHA-256 `71b29b1060752d31befbcaf8cac40a79e2d9739990b7f6474ad9af96cec9a075`, igual ao bundle do lifecycle final. A instância de teste encerrou normalmente. Recibo, snapshot, hashes e resultados: `artifacts/text-presets/continuation-2026-10-14/latest-installation.json`, `installed-panel-proof.json`, `candidate-receipt-final.json` e `installed-smoke/fixture-report.json`.

Build, análise estática, tipos, contratos, testes e empacotamento local: PASS. Aplicação nativa no AE 26.5: PASS. Premiere, assinatura, publicação e clean-machine: NOT RUN. Performance não foi medida nesta continuação; o gerenciamento de previews está coberto por testes. O Undo real anterior permanece evidência histórica, sem nova execução nesta rodada. A entrega é um candidato local; a decisão de release público continua HOLD.

## Arquivos e limites

Receitas e matemática: `packages/contracts/src/motion-library-text.ts` e `motion-library-math.ts`. Host: `preset-library.jsx`, `preset-phases.jsx` e catálogo gerado. Cliente: miniaturas em `motion-library-preview.ts`. Testes: contratos, galeria, lifecycle de previews e texto v3. Ferramentas: render, lifecycle, verificação de pixels, QA, cobertura e pacote. Manifesto e mídia: `apps/after-effects-cep/assets/text-previews`.

As fórmulas internas do Composer não foram reconstruídas integralmente. O catálogo público permanece separado do subconjunto instalado de 81 itens. A evidência atual confirma cobertura das famílias instaladas e implementações autorais funcionais; não declara reprodução de todos os presets comerciais ou paridade exata.
