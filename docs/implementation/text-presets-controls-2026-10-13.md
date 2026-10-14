# Presets: controles compactos e simulação removida

Pedido de 13/10/2026 (America/Bahia): remover a simulação interativa de todo o plugin, recolher a área inferior até a seleção de um preset e aproveitar melhor o espaço dos ajustes. Este pedido substitui a parte de simulação editável do plano original de texto v3.

## Comportamento

- A simulação, alternância Render AE, texto de amostra e reprodução/scrub da prévia ampliada foram removidos do navegador e do editor de presets aplicados. As miniaturas dos presets continuam na galeria; as 108 receitas e seus renders próprios continuam preservados.
- Ao abrir o plugin, a escolha anterior e seus rascunhos são lembrados, mas a área inferior inicia recolhida. Selecionar uma miniatura ou abrir seus ajustes revela a área. O botão Recolher preserva o preset e seus valores; selecionar novamente restaura os ajustes.
- O popover usa até 480 px de largura, duas colunas quando cabem e toda a altura útil. Quando não cabe acima ou abaixo da miniatura, ele se desloca dentro da janela. A antiga faixa curta abaixo do card deixou de limitar sua altura.
- Direção, números, seletores e controles de refinamento ficam acessíveis sem abrir outra seção. Restaurar padrão e salvar variação compartilham uma linha quando cabem. Em janelas baixas, o conteúdo rola dentro do popover; não há rolagem horizontal.
- Aplicação, validação de valores, favoritos, filtros, cópia e os rigs nativos permanecem nos fluxos existentes. Não há mudança no código do host ou nas receitas nesta alteração de interface.

## Validação

- Baseline: `npm.cmd run check` — 2.420 testes PASS (`artifacts/text-presets/ui-request-before.log`).
- Foco: galeria, editor de fases e validação do manifesto — 45 testes PASS (`ui-request-focused.log`).
- Browser: 30 cenários PT/EN, texto com Ricochete e quatro controles adicionais, efeito contínuo e preset antigo. Larguras 280/360/480/720 px e altura curta 360 px. Todos os controles cabem sem rolagem nas alturas padrão; zero overflow horizontal e zero aplicação durante navegação. Evidência: `artifacts/text-presets/ui-request-2026-10-13/ui-qa.json` e screenshots.
- Check integrado final: `npm.cmd run check` — 2.421/2.421 PASS, incluindo lint, tipos, build, validação e skills (`ui-request-final-check.log`). O hash do host é idêntico ao candidato anterior; os testes nativos anteriores continuam identificados como evidência daquela execução, sem nova alegação de renderização por esta mudança de interface.
- Instalação local PASS: candidato `5b4befca9ef5ee736a650dfda538be3e0dc85ae4`, 264 arquivos conferidos por SHA-256, três arquivos atualizados e estado privado preservado. Pacote `artifacts/text-presets/delivery/Moti.on-0.2.0-text-v3-local-5b4befca.zip`, SHA-256 `2edd4ecc0c07dcb0548f4bfce203015ad852b11463cdbb5579deb7ae26c4d768`. Backup e recibo estão apontados por `ui-request-2026-10-13/latest-installation.json`.
- Painel instalado PASS no After Effects 2026 26.5x89: área inicialmente recolhida, seleção revela os ajustes, popover completo sem scrollbar no dock observado, sem simulação e sem alternância Render AE. Ao terminar a verificação, a área foi recolhida novamente. Evidências `installed-panel-proof.json` e `installed-probe.json` no mesmo diretório: 345 presets totais, incluindo as 108 receitas de texto, e projeto vazio preservado.
- Na abertura, o AE exibiu aviso de recuperação referente à sessão anterior. Continuou normalmente, sem reset de preferências ou plugins; causa não determinada. Publicação, assinatura e instalação em máquina limpa continuam fora desta prova local.

## Estudo do Composer

O estudo dirigido reutilizou os records do REA e verificou os containers locais. Confirmou que os seis JSX analisados são utilitários de comunicação, não o catálogo de texto. A investigação do bundle identificou `Content.getItemTree` e o protocolo local do Composer. Uma consulta somente de leitura ao backend instalado retornou a árvore real, incluindo a pasta `Text Presets`. O arquivo completo, seu hash, a lista de itens e as contagens estão em `ui-request-2026-10-13/composer-study/installed-item-tree.json`, `installed-text-items.json` e `installed-catalog-summary.json`.

| Área instalada | Itens aplicáveis | Pastas de famílias |
| --- | ---: | ---: |
| Transitions - Characters | 33 | 5 |
| Transitions - Words | 23 | 7 |
| Transitions - Lines | 17 | 6 |
| Effects | 8 | 7 |

São 81 IDs de itens distintos, distribuídos em 27 grupos de variantes e 21 receitas diretas. Os 81 têm preview e container local presentes (`installed-local-files.json`). O total de folhas inclui diferenças de direção e ordem; não representa 81 famílias. As folhas de texto identificam explicitamente `productId: 3300`, permitindo vincular estes itens ao produto local. Essa prova não atribui todos os 639 containers desse produto a texto e não extrapola o subconjunto instalado para o catálogo público.

As fórmulas internas continuam pendentes de observação. A instância própria sem interface carregou o plugin nativo, mas seus listeners rejeitaram o handshake; os 18 representantes planejados naquela tentativa permanecem NOT RUN. O relatório dirigido, seus Evidence IDs e o resultado desta tentativa estão em `composer-study/composer-text-gap-study.md` e `composer-study/native/native-study-report.json`. Nomes de famílias não comprovam fórmulas, seletores ou implementação 3D. As famílias próprias já implementadas não declaram equivalência matemática com os presets comerciais.

## Arquivos

Cliente: `preset-gallery.ts`, `preset-phase-editor.ts` e restauração de navegação em `main.ts`. Componente de simulação removido; validação dos assets originais preservada em `text-reference-assets.ts`. Estilos: `packages/ui-core/src/preset-approved.css`. Testes de galeria/fases e QA visual atualizado em `scripts/text-presets-ui-qa.mjs`.
