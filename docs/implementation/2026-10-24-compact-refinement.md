# Refino compacto do painel do AE (24/10/2026)

Pedido do responsável depois de ver F1–F9 no After Effects, com prints a ~280–320 px:
otimizar o espaço em painéis estreitos, distribuir melhor os botões, deixar a interface
limpa e profissional, sem informação técnica espalhada nem formas soltas. O pedido
substitui a regra "dock das Ações rápidas congelado" para os itens abaixo. Só AE; o
Premiere não recebe nada desta frente (ver Verificação).

Estado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Ações rápidas

- **A âncora não se move mais.** Antes, abaixo de 320 px a âncora subia para cima da
  grade e ficava centralizada com o nome ao lado; quando o nome mudava ("Centro" →
  "Inferior esquerdo"), a âncora andava. Agora ela tem largura fixa à esquerda em
  qualquer largura, com o nome embaixo (cortado com reticências se não couber).
- **Botões alinhados à âncora**: duas linhas de blocos de 44 × 44 px com 4 px de vão,
  exatamente da altura do quadro da âncora (92 px). Cada filtro forma um bloco
  compacto (Efeitos 3 × 2, Favoritos 2 × 2) em vez de uma linha comprida.
- **Sem barra de rolagem.** A faixa rola para o lado com a roda do mouse (suave; no fim
  a roda volta a rolar o painel), com setas que aparecem no hover só do lado que tem
  mais ações, e as pontas esmaecem em vez de cortar seco (`quick-strip.ts`).
  Tab continua passando pelos blocos; um bloco focado nunca fica embaixo do esmaecimento.
- **Cantos**: quadrado suave (7 px nos blocos, mesma família do quadro da âncora); fundo
  liso no lugar do degradê.
- **Removidos**: o badge "● 1 camada / Sem composição" do cabeçalho, os pontinhos
  coloridos de categoria e o brilho que seguia o cursor. Um bloco indisponível continua
  explicando o motivo na dica. A estrela de favorito virou ícone, sem brilho.
- **Atalhos de letra**: cada linha espelha uma linha do teclado (QWE… / ASD…) em qualquer
  largura de bloco — em Efeitos, Q W E em cima e A S D embaixo.
- Cabeçalho recolhido: título, favoritos e pino, com o pino sempre no mesmo lugar.

## Navegação e Home

- **Uma regra para todas as telas**: só ícones enquanto os nomes não cabem; nomes a
  partir de 440 px. Antes havia "Ferramentas" e "Presets" escritos com Suavização e
  Parallax só em ícone. O ícone da biblioteca virou a grade de ferramentas (era uma
  casa). A busca de comandos aparece em qualquer largura.
- Barra da Home: cada menu ocupa só a sua largura ("Todas" era cortado para "T…");
  abaixo de 360 px o menu Biblioteca mostra só o ícone (o nome fica na dica).

## Suavização

- **Nada sobre o gráfico**: o botão Valor/Velocidade saiu do canto do gráfico, onde
  cobria o ponto final (1, 1), e foi para o cabeçalho; a dica de gestos que aparecia
  cortada no rodapé do gráfico virou texto para leitor de tela (`aria-describedby`).
- **Precisão**: ao arrastar, a alça gruda nas linhas 0 e 1 (6 px; Shift ou Alt soltam),
  Ctrl/Cmd encaixa numa grade de 0,05, e as coordenadas aparecem ao lado da alça.
  Setas: 0,01; Shift: 0,1; **Alt: 0,001** (novo). O foco do teclado na alça é um halo
  redondo, não mais um quadrado.
- **Visual**: um só acento — a curva no azul de valor editável do AE — sobre cinzas;
  traço mais fino (2 px); alças e hastes neutras (antes verde, azul e amarelo juntos).
  O botão "ao vivo" é um ícone, não mais o texto "((•))".
- Linha X1/Y1/X2/Y2 em quatro campos alinhados (rótulo à esquerda, valor à direita);
  botões de ação sem contorno.

## Parallax

- Câmera | Parallax e Coreografias | Shots individuais viraram controles segmentados
  (uma peça cada, a escolha em relevo deslizando entre as opções).
- Aviso sem moldura; título "Coreografias" repetido removido; descrição em duas
  linhas (o texto inteiro fica na dica); prévias das coreografias em paisagem (16:10),
  com metade da altura.

## Segunda rodada (mesmo dia, depois dos prints do responsável)

- **Home sem campo de busca.** A busca da navegação (paleta de comandos, Ctrl/Cmd+K) já
  encontra e abre as ferramentas; o "Buscar" da Home e o menu "Filtros da busca", que só
  existia junto com ele, saíram. A categoria virou o título da linha — "Todas as
  ferramentas ▾" — com a Biblioteca à direita, e a antiga linha "Todas as ferramentas 44"
  ficou só para leitor de tela: uma linha a menos no topo.
- **Botões de keyframe (inovação pedida).** Uma barra só, em três famílias separadas por
  filetes — Duplicar · Inverter (no tempo, valores) · Espelhar (logo depois, no início,
  no fim). Pictogramas novos de 24 × 16: contorno = keyframes de origem, cheio = resultado,
  um keyframe pequeno e um grande para mostrar a ordem (a cópia espelhada aparece
  invertida), e a cabeça do indicador de tempo no Duplicar. **Ao passar o mouse ou focar
  pelo teclado, o pictograma encena a operação**: os keyframes do resultado viajam de onde
  vêm até onde ficam (`ch-ae-op-travel`, sem movimento com "reduzir movimento"). Nomes
  curtos embaixo a partir de 480 px; o nome completo e a explicação continuam na dica.
  Antes: duas linhas de seis caixas com contorno.
- **Suavização sem tanta rolagem.**
  - O nome da curva divide a linha com o menu Bézier (uma linha a menos); abaixo de
    340 px o menu mostra só o desenho do modo.
  - Em painel baixo o gráfico encolhe (`min(100%, max(220px, 100vh − 290px))`), e
    cabeçalho, gráfico e X1–Y2 dividem essa largura, alinhados à esquerda.
  - A biblioteca de curvas é **uma fileira** que a roda do mouse e as setas deslizam, com
    as pontas esmaecidas (o mesmo componente da faixa do dock), no lugar da grade com
    rolagem própria dentro da rolagem do painel. Em painel largo (≥ 600 px), quando fica
    ao lado do gráfico, volta a ser grade.
  - "Salvar curva", "Buscar" e ☆ viraram ícones (+, lupa, estrela) com o nome na dica; a
    nota sobre a barra rápida da timeline foi para a dica da estrela.
- **Um aviso só.** "Abra ou ative uma composição…" aparecia duas vezes (embaixo dos botões
  de keyframe e perto do Aplicar). Ficou só o de perto do Aplicar, como uma linha de texto
  com o ícone de alerta, sem caixa; os botões de keyframe ficam esmaecidos e dizem o motivo
  na dica. Vale para todas as ferramentas.

## Presets em painel estreito

Era o item deixado em aberto nesta rodada. Estado: `IMPLEMENTED_NOT_HOST_VERIFIED`.

- **Abaixo de 360 px a árvore sai do lado dos cards.** Em 280 px ela cortava os nomes
  ("Entrada…", "Luz e m…", "Transiç…") e deixava uma coluna estreita de cards. Agora um
  seletor de pasta ocupa a linha do caminho, acima da grade — a pasta atual por inteiro,
  a pasta-mãe em cinza (é ela que encolhe primeiro) e ▾ — e os cards usam a largura
  toda (268 px em 280).
- **O seletor abre a mesma árvore** como folha sobre os cards, do seletor até o rodapé:
  mesmas linhas, pastas recolhidas, etiquetas de cor e "Adicionar pasta"; nenhum nome
  cortado em 280, 317 e 359 px. Ela abre na pasta atual; escolher uma pasta fecha a folha
  e devolve o foco ao seletor.
- **Teclado**: Enter ou Espaço abre; setas, Home/End e ←/→ como na árvore lateral; Esc
  fecha (antes, a paleta de etiqueta, se estiver aberta) e volta ao seletor; Tab para
  fora fecha. Clique fora também fecha.
- **Nada muda a partir de 360 px**: árvore lateral, divisor com duplo clique, caminho e
  larguras como aprovado em 22/10. O painel estreito não mexe na largura salva da árvore:
  ao alargar, ela volta como estava (antes era reduzida a 120 px e gravada assim).
- Seleção só por clique (o hover não muda a prévia) e preferências (pastas recolhidas,
  etiquetas, favoritos) seguem as mesmas.
- Código: `apps/after-effects-cep/client/src/preset-folder-picker.ts` (novo) e
  `preset-gallery.ts`; CSS no fim de `packages/ui-core/src/ae-workstation.css`, todo sob
  `[data-folder-picker="true"]`.
- Rodapé, em qualquer largura: sem preset selecionado, "Selecione um preset" aparecia
  duas vezes (nome e motivo recebiam o mesmo texto). Agora aparece uma vez; a linha de
  status só diz "Abra uma composição" quando falta composição. Os botões desativados
  continuam explicando o motivo na dica.

## Verificação

- `npm run check` → EXIT 0 (lint, tipos, build, validação, contraste, **2854/2854** testes,
  skills). `node apps/after-effects-cep/tests/ae-motion.browser.mjs f9` → PASS, 69 verificações
  (matriz de larguras sem estouro, alvos ≥ 24 px, movimento reduzido, desempenho).
- Linha Entrada · Saída · Converter Hold da Suavização: caixa e rótulo na mesma linha
  (antes o rótulo quebrava em três linhas acima da caixa em 280 px).
- Testes novos: `apps/after-effects-cep/tests/quick-strip.test.mjs` (esmaecimento por
  lado, roda que para no fim e devolve a rolagem ao painel, setas, movimento reduzido,
  letras por linha) e `packages/ui-core/tests/curve-precision.test.mjs` (ímã, grade,
  Alt + seta, botão no cabeçalho, dica fora do gráfico). `quick-dock.test.mjs`:
  o teste do badge passou a garantir que não há contador.
- Capturas do fixture do navegador em 280, 317, 360, 440, 480 e 720 px (dock aberto e
  recolhido, Home, Suavização com arraste e vista de velocidade, Parallax), também em 2×;
  as finais estão em `artifacts/compact-refinement/`.
- Premiere: nenhum código desta frente no bundle (`snapCurvePoint`, `ch-quick-strip`,
  `ch-curve__header-tools` ausentes). O fingerprint segue diferente por causa da frente
  de Partículas (já registrado em `2026-10-24-motion-f6-f9.md`).
- **Presets em painel estreito**: `preset-gallery-ui.test.mjs` com 4 testes novos
  (seletor no lugar do caminho, folha na pasta atual, Esc/Tab/paleta de etiqueta, alargar
  e estreitar mantendo a largura salva) e `preset-folder-picker.test.mjs`.
  `node apps/after-effects-cep/tests/preset-folder-picker.browser.mjs` → PASS, 23
  verificações em 280, 317, 359, 280 × 400, 280 a 2×, 360 e 480 px (cards na largura
  toda, nenhum nome cortado na folha, teclado, divisor com duplo clique a partir de 360).
  Antes × depois em 360, 480 e 720 px: 0 pixel diferente fora das prévias animadas.
  Capturas: `presets-280-before.png` (antes), `presets-280.png`, `presets-280-folders.png`,
  `presets-280-chosen.png`, `presets-317*`, `presets-359*`, `presets-360.png`,
  `presets-480.png`. Na rodada final, `npm run check`: 2869/2870 — a falha era
  `quick-library.test.mjs` ("compact library migrates a legacy search…"), da Home em
  andamento; F9 → PASS, 69. Premiere: nada do seletor no bundle (`createFolderPicker`,
  `ch-preset-folder-picker`, `data-folder-picker` ausentes; `main.js` sem `ch-preset-gallery`).

## Para validar no AE

1. `implementation/Atualizar Moti.on.cmd`, reabrir o painel (100% e 200%).
2. Painel bem estreito (~280 px): abrir as Ações rápidas, trocar o ponto da âncora — a
   âncora não anda; rolar a roda sobre os blocos — eles deslizam para o lado, as pontas
   esmaecem, as setas aparecem no hover; no fim, a roda volta a rolar o painel.
3. Cabeçalho recolhido: sem badge de camadas; favoritos e pino no lugar.
4. Navegação: abaixo de 440 px só ícones, acima só nomes; a busca aparece sempre.
5. Suavização: arrastar uma alça perto do topo — gruda em 1,00 e mostra as coordenadas;
   Ctrl encaixa de 0,05 em 0,05; Alt + setas anda 0,001; o botão de velocidade fica no
   cabeçalho e o ponto (1, 1) está livre.
6. Parallax: os dois controles segmentados, cards de coreografia mais baixos.
7. Home: sem "Buscar"; "Todas as ferramentas ▾" abre as categorias e a lupa do topo acha
   as ferramentas (Ctrl/Cmd+K).
8. Suavização: passar o mouse em cada botão de keyframe — o desenho encena a operação;
   a partir de 480 px aparecem os nomes curtos. Rolar a roda sobre as curvas — a fileira
   desliza. Sem composição, o aviso aparece só uma vez, perto do Aplicar.
9. Presets a ~280 px: o seletor de pasta fica acima dos cards, que usam a largura toda;
   abrir — a árvore aparece sobre os cards, na pasta atual, com os nomes inteiros;
   escolher uma pasta, Esc ou Tab fecham. Alargar acima de 360 px: a árvore lateral e o
   divisor voltam com a largura de antes.
