# Preservar o último preset e a posição da biblioteca

Status: **IMPLEMENTED_NOT_HOST_VERIFIED**.

Implementação iniciada em 01/10/2026; build, QA de navegador e atualização de desenvolvimento concluídos em 02/10/2026.

Ao aplicar um preset e depois removê-lo, o painel retorna a Navegar com o mesmo preset selecionado, os filtros anteriores e a posição da lista. Remover uma fase mantém Editar quando outra fase continua aplicada; remover a última retorna à biblioteca após uma inspeção confirmada. Falha na remoção, ausência de presets afetados ou falha de leitura não provoca esse retorno automático.

## Correção

O redesenho do shell removia a galeria antes de descartá-la, permitindo que a posição do elemento desconectado fosse lida como zero. A galeria agora salva a posição real antes das ações e conserva o destino durante a restauração em dois frames. Eventos de elementos desconectados, descartes repetidos e callbacks antigos não sobrescrevem a navegação atual.

“Revelar” e “Mostrar na biblioteca” preservam a posição quando o mesmo preset já está selecionado e visível nos filtros. Ao localizar outro preset ou um item oculto, ajustam somente os filtros impeditivos e deslocam a lista o necessário para mostrar o item.

O filtro Recentes conserva a ordem exibida durante aplicar/editar/remover, para que o mesmo deslocamento continue apontando ao preset escolhido. A recência continua sendo registrada e a nova ordem aparece ao sair e entrar novamente no filtro. Um pedido de Revelar continua pendente durante trocas rápidas de abas até o cartão ficar visível; uma nova escolha explícita do usuário substitui esse pedido.

As alterações estão em `main.ts`, `preset-gallery.ts` e `preset-workspace.ts` do cliente After Effects. Os comandos, schemas, adapters e operações de projeto permanecem os existentes. A memória é da sessão do painel; fechar o painel não cria persistência nova de navegação.

## Verificação

| Verificação | Resultado |
|---|---|
| Check completo: lint, tipos, build, validação, contraste, testes e skills | PASS |
| Suíte completa | PASS: 1.857/1.857; 0 falhas, 0 skips |
| Contraste | PASS: 88 pares |
| Regressões automatizadas de galeria, workspace e handler principal | PASS |
| Chromium 151.0.7922.34 com HTML/CSS/JS distribuídos e transporte CEP simulado | PASS: 20/20; 14 capturas revisadas |
| Atualização da instalação de desenvolvimento com backup | PASS: 43 arquivos correspondem ao build; cliente corresponde ao bundle do QA |
| After Effects real: aplicar/remover/Undo/reabrir | NOT RUN |

Evidências: [check completo final](../../artifacts/preset-scroll-20261001/final-check.log), [QA do navegador](../../artifacts/preset-scroll-20261001/browser-scroll-results.md), [instalação](../../artifacts/preset-scroll-20261001/install.log), [comparação dos 43 arquivos](../../artifacts/preset-scroll-20261001/install-verification.json), [hashes das fontes e build](../../artifacts/preset-scroll-20261001/final-source-build-sha256.json), [plano](../../artifacts/preset-scroll-20261001/plan.md) e fontes anteriores em `artifacts/preset-scroll-20261001/source-before/`.

As rodadas `check.log`, `check-pre-label-fix.log` e `browser-pre-recent-fix-*` são intermediárias. O gate intermediário detectou um rótulo incorreto no teste, corrigido antes do gate final. O QA intermediário de Recentes tentou rolar antes de a seleção mostrar seus controles e reduzir a área da lista; o cenário final estabelece a posição após selecionar, exige o cartão visível e confirma o mesmo deslocamento, geometria, ordem e seleção após remover. Isso preserva a verificação do comportamento solicitado.

## Instalação e recuperação

A instalação de desenvolvimento em `/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae` recebeu o build verificado, sem reiniciar o aplicativo. A [cópia anterior](../../artifacts/install-backups/ae-20261002-121733/previous) permite recuperação. O cliente instalado tem SHA-256 `04f65425aada2ea2c003a89c7f1e2cb1b4dfc2e791c36b22e790da26cca25d3d`, igual ao usado no QA de navegador.

## Teste no After Effects

Recarregue o painel ou reinicie o After Effects para carregar o novo cliente. Em uma composição de teste, role a biblioteca, escolha um preset, aplique e remova a última fase. Confira que Navegar mostra o mesmo preset e o mesmo trecho da lista. Com duas fases aplicadas, remova apenas uma e confira que Editar continua aberto; ao remover a restante, confirme o retorno à biblioteca. Teste também Mostrar na biblioteca/Revelar e Desfazer.
