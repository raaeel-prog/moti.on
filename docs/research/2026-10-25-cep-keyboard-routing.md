# Teclado de controles CEP no AE

No AE 2026 26.5x89/Windows, End seguido de Enter no seletor de receitas
encaminhava Enter ao host e abria o visualizador de camada. O controle do painel
não recebia a confirmação. Após registrar interesse nas teclas enquanto um
controle está focado, a mesma sequência selecionou Prisma e atualizou a prévia.
Evidência nativa: `artifacts/tools-audit/cep-keyboard-native.json`.

O registro é liberado ao perder foco, ocultar ou descartar o painel. Ctrl+Z não
é reservado. A aplicação da receita continua dependendo de Aplicar.
O mapeamento Mac tem teste automatizado; execução nativa Mac: NOT RUN.
Atalhos globais adicionais não estão cobertos por esta prova.

A API opcional é `CSInterface.registerKeyEventsInterest`, disponível no SDK
CEP fornecido pelo projeto. Fonte oficial:
[Adobe CEP 10 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_10.x/Documentation/CEP%2010.0%20HTML%20Extension%20Cookbook.md),
seção Register an interest in some key events.
