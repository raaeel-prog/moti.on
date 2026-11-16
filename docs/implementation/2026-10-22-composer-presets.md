# Presets: biblioteca e edição

Estado: IMPLEMENTED_NOT_HOST_VERIFIED. Integrado no projeto principal e instalado localmente em 23/10/2026.

## Entrega

A aba Presets adapta os padrões da biblioteca do Animation Composer 4.2.6 instalado, usando os componentes, catálogo e comandos próprios do Moti.on:

- Biblioteca com árvore redimensionável, busca, favoritos/recentes, caminho clicável, contagem real e limpeza de filtros.
- Cards compactos, estados de seleção/hover e navegação por setas/Home/End sem aplicar automaticamente.
- Rodapé fixo com preset selecionado, contexto e Entrada/Saída/Ambos; seleção fora do filtro identificada explicitamente.
- Browse/Edit separados: Editar ocupa toda a área e descarta a galeria oculta, preservando seleção e rascunhos.
- Controles compactos, botões azuis, slider circular, valores editáveis e propriedades por fase.
- Ações desabilitadas sem seleção válida. Layout verificado desde 280 px, inclusive painel baixo e escalas maiores.

Implementação em `preset-gallery.ts`, `preset-workspace.ts` e `ae-workstation.css`. Ferramentas e comandos de host foram preservados.

## Pesquisa e navegação

Graphify foi usado para localizar funções, relações e testes; o grafo do projeto principal foi atualizado: 11.753 nós, 21.680 arestas e 563 comunidades.

REA analisou os artefatos instalados. O [inventário de UI/UX](../research/2026-10-23-composer-ui-rea.md) registra observações, correspondências e limites. A análise semântica é parcial por limites de heap; não comprova equivalência integral nem comportamento em runtime. Código e assets proprietários não foram incorporados ao plugin.

## Verificação

| Camada | Resultado |
|---|---|
| Baseline anterior | PASS: 2.620 testes e 40 verificações browser |
| Check completo após integração | PASS: exit 0, 2.623 testes, zero falhas/skips; lint, typecheck, build, validate, contraste e skills |
| Browser existente após alterações | PASS: 40 verificações no candidato |
| Browser novo | PASS: 48 verificações em oito combinações de dimensão/escala, repetidas no build integrado |
| Instalação local | PASS: JavaScript e CSS instalados iguais ao build integrado por SHA-256 |
| Aplicação, edição e Undo no After Effects real | NOT RUN |

O primeiro check do candidato encontrou uma colisão no teste de marcas: o cache AST do Graphify reproduzia identificadores de testes já permitidos. A exclusão foi limitada ao diretório gerado `graphify-out` na raiz. O check completo do projeto integrado passou após a correção.

Testes de browser usam fixtures de CSInterface. Não substituem validação de comandos no After Effects.

## Integração e evidências

Origem isolada: `C:\dev\Moti.on-composer-presets-20261022`.
Destino: `C:\dev\Moti.on\implementation`.
Extensão instalada: `C:\Users\raaee\AppData\Roaming\Adobe\CEP\extensions\com.motion.plugin.ae`.

Integração seletiva com comparação de hashes do snapshot (1.642 arquivos), backups por arquivo e nenhuma divergência concorrente detectada. Somente `client/main.js` e `styles/theme.css` foram substituídos na extensão instalada. O JavaScript final foi sincronizado com o build integrado; a diferença inicial era exclusivamente o caminho de origem dos módulos emitido pelo bundler.

Evidências em `C:\dev\Moti.on-composer-presets-20261022\artifacts\composer-ui`:

- `integrated-check.log`: check completo aprovado.
- `integration-receipt.json`, `changed-files.json` e `final-install.json`: recibos e hashes.
- `source-backup`, `dist-backup` e `installed-backup`: arquivos anteriores.

Evidência browser do projeto principal: `C:\dev\Moti.on\implementation\artifacts\composer-ui\browser\results.json`, com capturas na mesma pasta.

## Teste no host pendente

Reabrir o painel Moti.on no After Effects para carregar o bundle novo. Na aba Presets, verificar biblioteca, redimensionamento, filtros e troca Biblioteca/Editar; em uma composição de teste, aplicar Entrada/Saída/Ambos, editar propriedades e conferir Undo. Registrar separadamente PASS/FAIL desse fluxo. A instalação não é uma publicação ou release.