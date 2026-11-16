# Interface do After Effects — 22/10/2026

Implementação da paleta escolhida e de ajustes contextuais no plugin existente, preservando comandos, presets e Undo. Nenhum framework ou biblioteca visual foi adicionado.

## Comportamento

Ferramentas tem nomes, grupos e ajustes diretos. O clique de aplicação rápida continua separado da abertura de controles. O inspetor ocupa 300 px a partir de 720 px e usa o conteúdo abaixo disso. Biblioteca, filtros, favoritos e drafts mantêm seus controladores existentes. Os campos rolam sem levar a ação principal para fora do painel.

A biblioteca de presets mostra categoria, favoritos, recentes e busca na mesma região. Os ajustes do preset escolhido são locais; a ação Ajustar camada abre os controles da seleção. No painel largo, a biblioteca permanece ao lado do editor da camada. Voltar à biblioteca devolve o foco à ação visível.

## Evidência

- Base anterior: `artifacts/ae-layout/baseline-check.log` (2600 testes passaram).
- Regressões focadas: `artifacts/ae-layout/focused-final.log` (153 passaram) e `apply-navigation-final.log` (17 passaram).
- Check completo final: `artifacts/ae-layout/integrated-full-check.log` — PASS no projeto principal: 2601 testes, zero falhas; lint, tipos, build, validação, contraste e skills passaram.
- Navegador: `artifacts/ae-layout/browser/results.json`, capturas em 280/360/480/720 px, 280×280 e escala 200%. Fixtures de CEP/conta explícitas; não é prova do Adobe.
- Contraste: 282 pares auditados, incluindo tema específico do AE. CSS do Premiere comparado por SHA-256 à base.
- Instalação: somente client/index.html, client/main.js e styles/theme.css. Backups, guardas e hashes em `artifacts/ae-layout/installed-receipt.json`.
- Integração de fontes: arquivos seletivos com proteção contra mudanças concorrentes em `artifacts/ae-layout/integration-receipt.json`.
- Desempenho local de filtros: cinco amostras, mediana de 1,5 ms antes/depois. Orçamento absoluto de 100 ms passou; percentual relativo fica INCONCLUSIVE por estar abaixo de um frame e sujeito a ruído de temporização.
- Execução real: consultar `artifacts/ae-layout/host-runtime.json`; passos sem evidência terminal permanecem NOT RUN.

## Roteiro de teste no After Effects

Reabrir o painel Moti.on pelo menu Janela → Extensões. Conferir a paleta e nomes das ferramentas, abrir Ajustar em Wiggle, redimensionar o painel e fechar ajustes. Em composição descartável, selecionar uma propriedade numérica, aplicar Wiggle uma vez e desfazer. Em Presets, selecionar um preset e conferir os ajustes, Entrada/Saída, Ajustar camada e retorno à biblioteca.

## Recuperação

Restaurar os três arquivos da pasta indicada por Backup no recibo de instalação e reabrir o painel. O instalador desta rodada não substitui host, assets, licença, configurações de conta, manifesto ou binários nativos.
