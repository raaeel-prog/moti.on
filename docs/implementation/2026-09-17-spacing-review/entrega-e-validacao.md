# Revisão de espaçamento — 17/09/2026

## Entrega

Revisão estrutural de espaçamento no tema compartilhado do Moti.on (After Effects CEP e Premiere Pro UXP). O ajuste reduz apenas `padding`, `margin` e `gap` em áreas periféricas e grupos relacionados:

- topo, navegação, título e avisos;
- busca e filtros;
- categorias e linhas da árvore;
- grade de miniaturas e ações de cada preset;
- inspetor, barra de aplicação e rodapé;
- biblioteca rápida, grade de ferramentas e ancoragem.

Os tamanhos dos alvos principais permanecem próximos do grid de 4 px e nenhuma função, atalho, comando ou contrato de host foi alterado.

## Evidência visual

`artifacts/spacing-review/verify-spacing.mjs` abriu o painel em `280×640`, `360×720`, `480×800` e `720×900`, verificando ausência de overflow horizontal, presença das ações de aplicação e rodapé dentro da área visível e entrada de busca compacta. As capturas correspondentes estão em `artifacts/spacing-review/ui-*.png`.

## Validação

- `npm run build` — PASS
- `npm run validate` — PASS
- `npm run skills:validate` — PASS
- testes focados (tema, tokens, contratos, previews, galeria e espaçamento) — **27/27 PASS**
- `npm run check` — **1.230 PASS / 22 FAIL**; as 22 falhas são as mesmas falhas preexistentes registradas em `artifacts/video-fixes-0917/check-final.log` (Beat/controles agrupados, inventário de build e inventário de globais do host).

## Instalação

Build instalada em:

`/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`

Backup reversível criado em `artifacts/install-backups/ae-20260917-023417/previous`.
