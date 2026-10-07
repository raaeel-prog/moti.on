# Texture: importação local sem placeholder

Data: 2026-09-20. Status: **IMPLEMENTED_NOT_HOST_VERIFIED**.

## Problema corrigido

O comando `ae.asset.texture` consultava `project.canImportFile`, que não faz parte da API de scripting documentada. Como o painel também não enviava um caminho, o fluxo criava um solid cinza chamado `Texture Placeholder` e retornava sucesso. Agora a aplicação exige mídia real.

Sem `assetIdOrPath`, o comando abre o seletor de arquivo nativo no preflight. Cancelar retorna `USER_CANCELLED`, sem abrir Undo ou criar itens. Um caminho local absoluto também é aceito; URLs, IDs de catálogo e arquivos executáveis não são tratados como mídia. Extensão, existência, tamanho não zero e a capacidade de importação de footage são verificados antes da primeira mutação. Não há exigência de seleção de layers, porque o resultado é um overlay da composição inteira; a seleção anterior é preservada.

A importação usa `ImportOptions.canImportAs(ImportAsType.FOOTAGE)`, define `importAs` e `sequence = false`, e então chama `project.importFile`. O footage local existente é reutilizado por caminho canônico `File.fsName`, sem modificar sua interpretação ou removê-lo em rollback. O comando cria uma nova layer de overlay por aplicação, no topo da composição, com áudio desabilitado, opacidade e modo de mescla explícitos. Imagens cobrem a duração da composição; vídeos usam o menor valor entre sua duração e a duração da composição.

A escala padrão é `cover`, mantendo proporção e compensando pixel aspect ratio. `contain` e `native` também são aceitos. O dispatcher mantém um único grupo de Undo. Falhas após importação removem somente a layer e o footage criados por aquela execução; seleção de layers, propriedades, itens do projeto e CTI são restaurados. Se a restauração falhar, o erro é `ROLLBACK_FAILED`.

## Contrato e limites desta entrega

Campos aceitos: `assetIdOrPath` opcional, `blendMode` opcional (`normal`, `overlay`, `multiply`, `screen`, `add`, `softlight`), `opacity` opcional (0–100), `fitMode` opcional (`cover`, `contain`, `native`). Valores padrão: seletor de arquivo, `overlay`, 100 e `cover`.

`applyAs`, `tint`, `loop`, `tile`, IDs de provedores e URLs são recusados explicitamente. Matte/displacement source, catálogo remoto, download, licenças/attribution ledger, checksum de conteúdo, deduplicação por conteúdo e ajuste idempotente da mesma layer continuam fora desta fatia. Reutilizar footage por caminho não equivale a implementar todo o asset pipeline do MASTER_BUILD_SPEC. A validação de codecs/containers permanece sob responsabilidade do importador do After Effects; a extensão sozinha não libera o arquivo.

O plano produzido pelo preflight é consumido uma única vez e vinculado aos argumentos, projeto e composição. Uma chamada direta de `run` sem preflight ou com argumentos/contexto diferentes falha sem mutação. Não é mantido um arquivo selecionado como padrão silencioso entre aplicações.

## Evidência da API

Fonte primária autoral: **Adobe After Effects CS6 Scripting Guide**, publicado pela Adobe e consultado em [espelho do PDF original](https://fendrafx.com/wp-content/uploads/After-Effects-CS6-Scripting-Guide.pdf). As antigas URLs Adobe do PDF estão indisponíveis; não se apresenta o domínio do espelho como pertencente à Adobe.

| Símbolo | Referência no PDF Adobe | Uso |
| --- | --- | --- |
| `ImportOptions.canImportAs(type)` | pp. 75–76 | Testar `ImportAsType.FOOTAGE` antes de importar |
| `ImportOptions.importAs` / `sequence` | pp. 76–77 | Importar uma mídia individual como footage |
| `Project.importFile(importOptions)` | p. 118 | Obter um `FootageItem` real |
| `FootageItem.file` | p. 65 | Reutilizar arquivo já importado pelo caminho |
| `LayerCollection.add(item, duration)` | p. 96 | Inserir a mídia na composição |
| `AVLayer.blendingMode` | p. 42 | Aplicar enum de blend, incluindo `SOFT_LIGHT` |

## Verificação executada

- PASS: `node --test apps/after-effects-cep/tests/texture-local.test.mjs` — 12/12 testes.
- PASS: `node node_modules/typescript/bin/tsc -p apps/after-effects-cep/tsconfig.host.json --pretty false`.
- PASS: ESLint dos dois arquivos alterados.
- PASS: `node scripts/check-extendscript.mjs` — 70 arquivos.
- NOT RUN nesta fatia: After Effects real, render, Undo visual, persistência após salvar/reabrir e verificação de codecs no host.
- Check completo do repositório: responsabilidade da integração consolidada, em conjunto com as outras ferramentas alteradas.

Os testes incluem sucesso do seletor, cancelamento, caminho explícito, footage reutilizado, enquadramento/PAR, limites de duração, preservação de seleção/CTI, argumentos inválidos, arquivo ausente/vazio/não importável, API indisponível, falha durante importação/inserção/edição, limpeza parcial, erro de rollback e rejeição de planos obsoletos.

## Smoke test consolidado no After Effects

1. Em composição de teste com layers e propriedades selecionadas, aplicar Texture e cancelar o seletor: nenhum item/layer/Undo novo.
2. Aplicar novamente escolhendo PNG/JPEG local: overlay real, opacidade esperada, composição coberta, seleção e CTI preservados.
3. Aplicar o mesmo arquivo outra vez: footage é reutilizado; a nova aplicação acrescenta outra layer, sem duplicar o item de mídia.
4. Testar vídeo curto: sua layer termina no fim da mídia, sem áudio e sem loop inventado.
5. Um Undo desfaz a última aplicação; outra layer de adjustment e conteúdo anterior permanecem intactos.
6. Salvar/reabrir uma cópia do projeto e verificar vínculo da mídia e resultado visual.
