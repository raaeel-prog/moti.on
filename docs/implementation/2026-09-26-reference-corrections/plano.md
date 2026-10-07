# Correções de Navegar/Editar por referência — implementação

Plano aceito em 26/09/2026. Primeiro: prova AEGP de atualização ao vivo e Undo único; se falhar, bloquear somente a interação dependente. Depois: contratos por fase e compatibilidade v1, aplicação/ajuste/remover/restaurar por fase, cores, editor profissional e catálogo de modelos/transições próprios.

Alterações: contracts/command registry, host preset-library e módulos próprios, client workspace/gallery, ui-core numeric lifecycle, AEGP SDK bridge, build/instalação.

Invariantes: #1D1D1D, dados/seleção/CTI preservados, preflight antes de mutar, propriedade compartilhada com contribuição das fases combinada, sem código/ativos do Composer, sem migração por leitura.

Provas necessárias: build/check; fixtures de migração, duas fases, cores, modelos; Undo/Redo real; widths 280/360/480/720; prévias/render e instalação com backup. Backup fonte: artifacts/composer-reference-20260926/source-before. Não restaurar arquivos fora dos alterados nesta rodada.
