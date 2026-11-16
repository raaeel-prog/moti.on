# Continuação do refinamento de controles AE

Escopo: melhorar controles de parâmetros e Configurações com base no estudo focal de Animation Composer/BadFX. Preservar tiles de Ferramentas, botões flutuantes, seleção sem aplicação e card–popover. Aplicação ao soltar e ausência de Aplicar ajustes no editor de fases continuam aprovadas. Não alterar contratos Adobe, categorias/IDs ou dados pessoais.

1. Conferir os recursos instalados e registrar oito achados com evidência estática/REA e limites; não copiar implementação/assets dos fornecedores.
2. Refinar o checkbox nativo para caixa visual compacta e alvo clicável acessível, azul e foco consistente apenas no AE.
3. Melhorar sliders expansíveis com trecho preenchido, estados de interação/validação e reset local; conservar expansão durante os ajustes automáticos para evitar reabrir a cada gesto.
4. Organizar Configurações com labels legíveis, descrições secundárias, grupos de ações e medidas consistentes. Preservar preferências e navegação de suporte.
5. Cobrir seleção, checkbox e sliders por teclado/mouse, confirmação única/cancelamento, valores mistos e responsividade. Comparar screenshots em 280/360/480/720 px e painel baixo, pixels de Ferramentas e geometria card–popover.
6. Executar check completo, registrar evidência real do host separadamente e integrar só arquivos desta rodada após hash guard. Instalar no painel oficial com backup e integridade, preservando conta/preferências.

Arquivos: `number-disclosure.ts`, `ae-refinement.css`, editor/workspace de presets, view de Configurações, `ae-settings.css`, build/testes e docs. Mudanças de geometria apenas em controles internos; risco principal é perder expansão/foco ou duplicar aplicação durante o ciclo de confirmação. Testes devem detectar ambos.

Rollback: cópia isolada `C:/dev/Moti.on-ui-controls-next`; manifesto inicial em `C:/dev/preset-study/ui-controls-next/source-manifest.json`; backup apenas dos arquivos integrados e da instalação substituída. Nenhum push/publicação.
