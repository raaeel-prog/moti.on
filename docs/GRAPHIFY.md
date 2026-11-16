# Mapa do plugin com Graphify

Instalado em 2026-10-22 a partir do pacote oficial `graphifyy[sql]==0.9.94`,
em ambiente isolado do uv com Python 3.12. Fonte:
https://github.com/Graphify-Labs/graphify

## Abrir e atualizar

- Mapa de conexoes: `graphify-out/graph.html`.
- Arvore de arquivos e simbolos: `graphify-out/GRAPH_TREE.html`.
- Relatorio: `graphify-out/GRAPH_REPORT.md`.
- Dados consultaveis: `graphify-out/graph.json`.

Execute `Mapear plugin.cmd` na raiz para reconstruir todos esses arquivos.
O comando interrompe em caso de erro. A saida gerada fica fora do Git.
Os HTMLs usam bibliotecas JavaScript de CDN; a extracao do codigo e local,
mas abrir a visualizacao pode exigir internet para carregar essas bibliotecas.

Para reinstalar a ferramenta em outra maquina:

```powershell
uv tool install --python 3.12 "graphifyy[sql]==0.9.94"
graphify install --project --platform codex
```

O instalador registrou a skill em `.codex/skills/graphify/` e acrescentou
orientacoes ao `AGENTS.md`. Reinicie o chat se a skill nao aparecer como
`$graphify`. O hook oficial instalado e um no-op; as instrucoes de uso
persistentes ficam no `AGENTS.md`, sem prometer atualizacao automatica.

## Consultar

Execute na raiz `C:\dev\Moti.on\implementation`:

```powershell
graphify query "preset-workspace preset-gallery" --budget 2000
graphify explain createPresetGallery
graphify path createPresetWorkspace createPresetGallery
graphify god-nodes --top 10
```

Se o terminal atual ainda nao reconhecer `graphify`, abra um novo terminal
ou use `& "$env:USERPROFILE\.local\bin\graphify.exe"`.

## Escopo e limites

O mapa cobre o codigo da suite em `implementation`, incluindo cliente CEP,
ExtendScript, contratos compartilhados, testes, Premiere, servicos e fontes
nativos. Nao inclui o SDK externo em `C:\dev\Moti.on\AfterEffectsSDK_26.5_win`.
`.graphifyignore` remove dependencias, builds, copias geradas, bibliotecas,
assets e arquivos de configuracao sensiveis. `.graphifyrc` identifica os
cabecalhos `.h` como C++.

O pipeline usa `--code-only` e clustering com `--no-label`: nao faz chamadas
a modelos e nao envia documentos, imagens ou codigo para um backend de IA.
As comunidades possuem identificadores numericos. Os documentos nao recebem
extracao semantica. Recursos Adobe Rez `.r` sao excluidos, pois nao sao R.

Na primeira geracao final: 10.081 nos, 21.176 relacoes no JSON, 650 caminhos
de origem representados e 402 comunidades. O relatorio resume 19.652 pares
de conexoes apos a projecao usada no clustering; nao e a contagem de todas
as relacoes do JSON. Existem caminhos sem simbolos extraiveis e dois
cabecalhos com avisos de sintaxe: `plugin/host/MotionCore.h` e
`plugin/host/GradientMetalSource.h`. O filtro preventivo da ferramenta
tambem omite quatro arquivos de tokens CSS/JSON pelo nome. Portanto este
mapa e uma ajuda de navegacao estatica, com cobertura parcial desses casos.

## Evidencias

- PASS: instalacao oficial, registro Codex, execucao de `Mapear plugin.cmd`.
- PASS: integridade do JSON, 0 arestas com endpoints ausentes, fontes CEP,
  ExtendScript e SQL representadas, HTMLs e relatorio gerados.
- PASS: consultas `query`, `explain createPresetGallery` e `god-nodes`.
- PASS: `npm run skills:sync` e `npm run skills:validate` (14 skills,
  31 arquivos, 42 casos de roteamento e espelho Claude).
- PASS: `npm run check` antes e depois da instalacao; ambos concluiram com
  2.620 testes aprovados, zero falhas, lint, types, build, validate,
  contraste e validacao das skills aprovados.
- Visualizacao no navegador: NOT RUN. Playwright nao tinha extensao disponivel;
  o navegador do Codex bloqueou a navegacao para URL `file:`. A validacao
  estatica dos artefatos nao comprova a interacao visual.
- AE/Premiere: NOT RUN nesta tarefa de ferramenta; este mapa nao comprova
  comportamento do plugin nos hosts Adobe.

Logs locais da instalacao/verificacao ficam em `C:\dev\graphify-motion-*.log`.
