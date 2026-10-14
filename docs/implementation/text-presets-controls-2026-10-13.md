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
- A instalação será registrada separadamente no recibo final desta alteração.

## Estudo do Composer

O estudo dirigido reutilizou os records do REA e verificou os containers locais. Confirmou que os seis JSX analisados são utilitários de comunicação, não o catálogo de texto. O bundle do navegador obtém os itens por `Content.getItemTree`; não contém os nomes das famílias. A leitura amostral dos containers não identificou nomes legíveis. Não se atribui `Products/3300` ao pacote Text Presets sem evidência semântica.

O inventário recursivo e as fórmulas internas do Composer permanecem parcialmente investigados. O relatório dirigido, seus Evidence IDs e as fronteiras de cobertura estão em `artifacts/text-presets/ui-request-2026-10-13/composer-study/composer-text-gap-study.md`. As famílias próprias já implementadas não declaram equivalência matemática com os presets comerciais.

## Arquivos

Cliente: `preset-gallery.ts`, `preset-phase-editor.ts` e restauração de navegação em `main.ts`. Componente de simulação removido; validação dos assets originais preservada em `text-reference-assets.ts`. Estilos: `packages/ui-core/src/preset-approved.css`. Testes de galeria/fases e QA visual atualizado em `scripts/text-presets-ui-qa.mjs`.
