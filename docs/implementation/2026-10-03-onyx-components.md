# Moti.on — evolução Onyx sobre Web Components

Data: 03/10/2026. Direção aprovada pelo responsável; estado do GM preservado.

## Resultado implementado

- Fonte única de tokens Onyx em `packages/ui-tokens/src/tokens.css`, espelhos CSS/JSON e bloco do tema gerados no build por `scripts/sync-theme.mjs`. Superfícies #121212/#1A1A1A/#212121/#2E2E2E, área gráfica #101010; raios 2/4/6 px e movimentos compartilhados.
- Catálogo tipado de vetores preserva desenhos do GM, separa base/detalhe, família de ferramenta e gesto de 320 ms. Cores de feedback continuam próprias. Tema claro possui cores legíveis correspondentes.
- `moti-button` aceita ícone e apresentação compacta, com rótulo acessível, botão nativo e spans estáveis. Os aliases convergem para as variantes existentes. Factory, registro por documento, Light DOM e fallback preservados.
- Ações comuns das ferramentas, seis ações da Suavização e ações principais de Presets usam a factory. Editores de curva e números arrastáveis conservam seus contratos e comandos.
- Suavização recupera seis blocos retangulares em grade 3×2 e diagramas originais de 76×28 px. Correção posterior impede o estilo compacto de 28 px de encolher esses blocos. A geometria mínima foi acrescentada à verificação visual.
- Nomes das ferramentas aparecem em dicas externas, com nome/requisito no ponteiro e no teclado. Grade compacta, filtros, ordem, recentes, favoritos, âncora e dock preservados.
- Configurações do AE contém Interface, Acessibilidade e Ajuda. Contexto/Sistema/Diagnóstico são rotas de suporte dentro de Ajuda, com retorno. Sem rodapé de conexão nem conta fictícia.
- Premiere conserva suas rotas de suporte e estado de indisponibilidade para ferramentas ainda não implementadas. As alterações compartilhadas entram no seu bundle.

## Evidência e limites

| Verificação | Resultado |
|---|---|
| Estado inicial do GM | Preservado: 224 arquivos iniciais + cópias auxiliares, hashes e bundle distribuído |
| Check inicial | FAIL: cinco problemas de lint preexistentes; demais etapas não executadas nesse check |
| Check integrado antes da alteração concorrente de Encarar | PASS; 1.906 testes, nenhuma falha |
| Último check do workspace | FAIL; 1.905/1.906 PASS: teste de Encarar esperava um alvo aplicado e recebeu dois, após alteração de `three-d-look-at.jsx` às 00:40. Lint/tipos/build/contraste PASS. Código de Encarar não editado nesta entrega. |
| Contraste de tokens dark/light | PASS; 152 pares incluindo famílias de vetores |
| Botão: factory/WC/fallback/reatividade | PASS; testes dedicados integrados ao check |
| Suavização no Chromium, bundle real e transporte CEP simulado | PASS; matriz 280/360/480/720 px, altura reduzida, PT/EN, dark/light, escalas 100/125/150/200%, clique único, bloqueios, erro/retry, curvas e persistência |
| Telas compartilhadas no Chromium, fronteiras CEP/UXP simuladas | PASS; 113 cenários, 89 capturas, rotas/foco/ativação única, Settings/Presets/parâmetros e fallback |
| After Effects 26.5x89, macOS 27.2 | PASS; sete casos de easing + dez casos de operações de keyframes; fixtures temporárias removidas e composição anterior reaberta |
| Instalação local AE | Atualizada com backup reversível da instalação anterior |
| Interface restaurada no AE após reabertura pelo usuário | PASS visual: seis blocos 3×2 com diagramas legíveis; requisitos por seleção preservados. Captura `ae-suavizacao-real.png`. |
| Undo nativo nesta entrega | NOT RUN; não inferido dos testes de comando |
| Premiere real | NOT RUN; boot/bundle e testes simulados não substituem UXP real |
| Leitor de tela e orçamento de frames no host | NOT RUN |

A prova funcional de host cobre comandos executados por script na distribuição nova,
não uma certificação de todas as telas e operações do produto. O usuário reabriu o painel e a geometria restaurada foi conferida no host. Não foi salvo,
fechado ou substituído o projeto pessoal aberto. Revisão individual de todas
as ferramentas, Undo e a matriz completa nos hosts permanecem gates de aceite.

## Artefatos

Evidências em `artifacts/onyx-components-20261003/`:
`check.log`, `ease-browser-results.json`, `browser-panels-results.json`,
`ease-native-results.json`, `native-actions.json`, `changed-files.json` e
`final-source-sha256.json`. Capturas `before-*` usam o bundle GM preservado;
`after-*` usam o bundle novo. `source-before/` e `baseline-dist/` são backups,
não fontes do build. `install.log` identifica a cópia da instalação anterior.

![Suavização corrigida](../../artifacts/onyx-components-20261003/after-360x720.png)

![Biblioteca preservada](../../artifacts/onyx-components-20261003/after-quick-grid.png)
