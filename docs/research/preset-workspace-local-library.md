# Editor de presets e biblioteca local

Data: 2026-09-16. Alvo: After Effects 25+; execução real em 26.5x89/macOS.
Status: disponível, sujeito aos limites abaixo.

## Evidências

- [Adobe: Scripts](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html) confirma ExtendScript e aponta explicitamente para o guia de scripting.
- [Layer.applyPreset](https://ae-scripting.docsforadobe.dev/layer/layer/#layerapplypreset): File de preset; aplica a **todas** as camadas selecionadas na composição. Sem seleção cria sólido: o comando do Moti.on recusa esse estado. Guia mantido pela comunidade e indicado pela Adobe, não documentação hospedada pela Adobe.
- [Folder](https://extendscript.docsforadobe.dev/file-system-access/folder-object/): selectDialog, getFiles, absoluteURI, alias e exists. Seletor cancelado retorna null. Guia ExtendScript mantido em docsforadobe. Métodos testados no runtime local.
- Layer.id, comment, CompItem.id, Property.value/numKeys/expression compõem o snapshot de edição. O editor lê controles efetivos e revalida alvo+fingerprint antes de escrever.

## Decisões

Editor: uma camada gerenciada, sem conflito de propriedade, desbloqueada. Controles animados ou com expressão são editados no AE, pois setValue/reaplicação não devem apagar animação. Commit explícito para agrupar todos os ajustes em um Undo. Leitura apenas com aba Editar aberta e documento visível, sem concorrência; respostas de abas fechadas são ignoradas. Draft local permanece até commit ou descarte; mudança externa exige recarregar.

Biblioteca: adicionar pasta pela API nativa, persistir referências em app.settings, listar subpastas e somente .ffx. Tokens de aplicação opacos têm sessão+geração para não reutilizar IDs após recarga do host. Não recebe paths no bridge. Confere raiz aprovada, extensão, existência, aliases, assinatura RIFF/RIFX + FaFX e tamanho antes de aplicar. Uma chamada applyPreset para toda seleção, nunca uma chamada por layer.

Limites: 20 raízes, 1.000 presets, 5.000 entradas, 8 níveis e orçamento de varredura de 1,5 s; .ffx entre 12 bytes e 20 MB. getFiles é síncrono, portanto o tempo de uma listagem individual do sistema não pode ser interrompido. Pastas indisponíveis aparecem como tal. Atualizar refaz catálogo e invalida tokens antigos. Remover da biblioteca só retira referência.

Confiança: arquivos .ffx são escolhidos pelo usuário e aplicados pelo parser nativo do AE; scripts .jsx/.jsxbin nunca são listados/executados. Presets pessoais podem conter expressões e dependências nativas/terceiras; não há alegação de sandbox de conteúdo .ffx. Sem uploads, download, telemetria ou cópia para pacote distribuído. Caminhos absolutos ficam apenas nas preferências do host, sem UI/log de diagnóstico.

Prévias de .ffx não são sintetizadas: a lista mostra nome e caminho relativo; controles permanecem em Effect Controls. Prévia animada e aba Editar com parâmetros completos pertencem aos presets originais Moti.on. Não há fallback visual inventado.

## Validação

`artifacts/design-review/host-results.json`: aplicação e ajustes reais, conflitos, seleção/tempo, biblioteca Unicode, aliases, arquivo inválido, aplicação em duas camadas e remoção de referência. `ui-results.json`: abas, árvore, etiquetas, atalhos, autoplay visível, pausa/reduced motion, drafts, seleção obsoleta e quatro larguras. Undo e seletor gráfico documentados separadamente no relatório de entrega.
