# Presets de texto: paridade com AC4 e BadFX em código próprio — 16/10/2026

## Escopo

Pedido do usuário: trazer para o Moti.on todos os tipos de preset de texto do Animation Composer 4 e do BadFX, com identidade própria, e melhorar os presets de texto atuais que estavam com bug ou feios, sem excluir nenhum. Condições:

- Preservar o trabalho recente feito com o Codex (refinamento de UI de 16/10, `preset-navigation.ts`, elementos, revelações/looks, fases v3).
- Não mudar o layout.
- Sala limpa (§0.8/§34): só comportamento é estudado. Nenhum `.ffx`, expressão, nome ou prévia de fornecedor entra no produto.
- A tentativa anterior em `C:\dev\Moti.on-preset-integration`, que empacotava os arquivos dos fornecedores, foi descartada.

Antes de editar, a árvore de trabalho foi salva em `refs/backup/pre-text-port-2026-10-16` (via `git stash create`) e os arquivos não rastreados foram copiados para o scratchpad da sessão.

## Estudo

`docs/research/2026-10-16-text-presets-behavior.md` mediu quadro a quadro, com o REA, as prévias públicas dos dois fornecedores. O resultado é uma matriz de 53 células e 13 lacunas (GAP-01…13).

## O que entrou

**Motor text-v3**
- Portado da branch `feat/text-presets-rea` por cima da árvore atual, à mão e sem merge.
- `motion-library-text.ts` traz 177 receitas próprias (`collection: "text"`): 157 transições e 20 loops, 26 delas com 3D real.
- Bases da branch: CORE, THREE_D, TYPOGRAPHY, COMBINATIONS e EFFECTS.
- Novas nesta entrega:
  - `PARITY`: 8 variantes × 3 unidades.
  - `MEASURED`: as lacunas medidas GAP-01…06, 12 e 13.
  - Bloco único (GAP-07, unidade `all`).
  - Dois waveforms novos: `stepped` (wiggle mantido a 8 Hz, GAP-08) e `burst` (dispersão periódica, GAP-09).

**Texto 3D por caractere e agrupamento do pivô**
- A branch guardava o efeito em `textEffect`. Isso foi refeito sobre o slot `effect` das fases v3 (ADR 0005) e no preset avulso.
- `textState` na raiz das fases e `meta.textState` no preset v1:
  - definem `threeDPerChar` e o Anchor Point Grouping enquanto algum slot precisar deles;
  - devolvem os valores encontrados na remoção ou no rollback.
- Recusas antes de qualquer mutação:
  - host sem 3D por caractere;
  - agrupamentos incompatíveis entre fases;
  - animador do usuário que dependa do agrupamento atual.

**Host**
- Rotation X/Y e Anchor Point 3D no Text Animator.
- Decode guiado por Velocidade e Variação (`libraryTextDecode`).
- Blur e cor contínuos nos loops; controle Variação na coleção.
- `libraryTextDecode` e `libraryTextThreeD` passaram a fazer parte do core gerado. Antes, o host chamaria `core.libraryTextDecode` sem que ele estivesse no build. Agora um teste confere todas as chamadas `core.*`.

**Galeria**
- A coleção entra nas pastas Caracteres/Palavras/Linhas pela navegação de famílias do Codex, sem filtros novos.
- Ela não entra em Clássicos.
- Nenhuma mudança de layout.

## Melhorias nos presets existentes (nenhum excluído)

- **Bug corrigido:** 23 receitas de texto declaravam profundidade (Z) ou giro em X/Y, mas a camada ficava sem 3D por caractere, e o AE descartava esses canais. A miniatura mostrava um movimento e o AE fazia outro.
  - `libraryTextThreeD` passa a ativar o 3D quando a receita tem esses valores, sem mudar dados nem IDs (os hashes legados continuam valendo).
  - Exemplos: Desdobramento de prancheta (agora gira em X), Perspectiva forçada (vem da profundidade), Varredura Cinematográfica, Véu suspenso, Extrusão Profunda.
- Loops desfocam nas duas metades da onda (`Math.abs`) e podem tingir continuamente.

## Prévias renderizadas

- `scripts/text-presets-render.mjs`:
  - `--probe` sonda o AE;
  - `--prepare` monta os fixtures num projeto vazio, com guarda do projeto do usuário;
  - `--render` roda `aerender` e o ffmpeg.
- Cobre todas as receitas de texto, antigas e novas.
- Fixture: o fundo do próprio card (#212121), Arial Bold e o texto da unidade, vindo de `client/src/text-preview-sample.ts` (o mesmo módulo que desenha o card):
  - "MOTION" a 64 px para letras e texto inteiro;
  - "MOTION PRESETS" a 42 px para palavras;
  - "MOTION" / "PRESETS" a 54 px para linhas.
- 30 fps, a base em que as receitas são escritas.
- Uma receita que falhe é registrada e pulada, sem abortar as outras.
- O card mostra um pôster no meio da entrada e toca o MP4 no hover ou quando está selecionado. Quando a direção, a curva ou outro ajuste do ⚙ difere do render, ele volta à prévia SVG. O nome do card é o da variante, como "Cascata de luz"; a busca encontra pelo nome completo.
- Os arquivos ficam em `apps/after-effects-cep/assets/text-previews/`, e o manifesto é gerado em `client/src/generated/text-reference-manifest.ts`.

## Fora desta entrega

- **GAP-10** e **GAP-11** ficaram de fora em 2026-10-16 porque mudavam o painel. Entraram em 2026-10-18, depois de o usuário aprovar onde cada controle fica (seção abaixo).
- `text-dissolve` (unidade `all` em Caracteres) e `native-glitch-title` (transição em Efeitos) mantêm a categoria para não alterar o hash legado nem a posição na galeria.
- `signature-film-burn` continua "em ajuste", porque o crash do `CC Burn Film` não foi isolado.

## GAP-10 e GAP-11 (2026-10-18)

Decisão do usuário antes do código: a ordem de saída fica **só na aba Editar**; as diagonais entram no dropdown da aba Editar **e** no ⚙ do card, cuja grade passa de 2×2 para 3×3.

**Verificação prévia (GAP-10).** O renderer já espelhava a saída. `libraryTiming` e `libraryStudioTiming` usam o mesmo índice ordenado nos dois termos. O termo de saída `(fim − t − atraso_i)/movimento` zera primeiro para o maior índice. Resultado: em Saída e em Ambos, quem entrou por último sai primeiro (como no AC4). Isso vale em qualquer Ordem, inclusive Aleatória.

- **`exitOrder: "mirror" | "repeat"`** (opcional em `MotionLibraryOptions`, no schema, em `optionKeys` (agora até 17) e na validação do host).
  - Sem a opção, ou com `mirror`, a expressão é idêntica à anterior: nenhum preset aplicado muda.
  - `repeat` calcula só o termo de saída com o índice invertido `(total-1-idx)`, como no BadFX. Vale para texto por caractere, palavra ou linha. Com o texto inteiro não há ordem.
  - Aba Editar: um seletor **Saída: Espelhada / Na mesma ordem** em presets de texto, quando a fase é Saída ou Ambos (editor legado) ou na fase de Saída (editor de fases v3).
- **Diagonais** `top-left | top-right | bottom-left | bottom-right`.
  - `libraryDirection` e `libraryChoreography` giram o percurso até o canto e mantêm o comprimento. As quatro direções antigas dão o mesmo resultado bit a bit.
  - Só valem onde `libraryUsesDiagonals` é verdadeiro: a receita tem deslocamento (posição), não gira numa borda e não é revelação.
    - Revelações e pivôs de borda continuam com os quatro lados.
    - O host recusa uma diagonal nesses presets com mensagem clara.
  - Aba Editar: quatro itens a mais no dropdown Direção.
  - ⚙ do card: em presets com deslocamento, a grade vira uma bússola 3×3. Cada miniatura fica no lado de onde o movimento vem, e Original é o ponto do centro.
    - A posição já diz a direção, então a bússola não tem rótulos visíveis (`aria-label` e `title` mantêm os nomes).
    - O botão de fechar ganha uma faixa acima da grade, e a grade usa a largura toda do card.
    - Medido no Chromium com o componente real e a CSS do `dist` (card de 148 px): miniaturas de 34×17 px (eram 41×20 na 2×2), sem sobrepor o ×, popover com 200 px de altura (era 214), sem rolagem horizontal.
    - Revelações e pivôs de borda mantêm a grade 2×2 de antes.
- Testes novos:
  - paridade host×prévia: diagonais em 31 transições de camada (as 4 diagonais) e 131 de texto (dois cantos opostos), e `repeat` em Saída e Ambos nas 256 transições de texto por unidade;
  - `mirror` escreve as mesmas expressões que a ausência da opção;
  - recusa de diagonal em revelação e pivô de borda;
  - schema = `isMotionLibraryOptions`;
  - UI do ⚙ e da aba Editar.
- After Effects real: **IMPLEMENTED_NOT_HOST_VERIFIED**. A paridade roda no harness de expressões, não num AE aberto.

## Prévia fiel ao AE e correções (2026-10-18)

Pedido do usuário: a prévia mostra uma palavra nos presets de letra e duas nos de palavra, com animações coerentes. Ao mudar direção ou caráter no ⚙, o card deve mostrar o preset de verdade (antes ficava vazio).

**Medição.** `scripts/text-presets-compare.mjs` desenha o card no Chromium e compara, em 10 instantes da entrada, com o quadro do render do AE.
- A nota é a fração dos pixels de texto que o outro quadro também cobre, com tolerância de 2 px.
- `--dump` grava folhas AE | card lado a lado.
- O ciclo completo de 298 presets leva cerca de 30 s.

**Achados e correções na prévia** (`motion-library-preview.ts`, `text-preview-sample.ts`):
- **Tempo:** o render era a 24 fps, e as receitas usam quadros a 30 fps, então o AE ficava 25% mais lento que o card.
- **Layout:** o texto agora usa as larguras de Arial Bold e é centralizado como no AE. O topo das maiúsculas e a linha de base ficam centrados na composição.
- **Pivô (Anchor Point do animador):** o AE desloca a unidade pelo pivô ponderado pelo seletor e gira e escala em torno do ponto de repouso. Antes, o Arco de chegada saía invertido no card.
- **Entreletra:** no AE ela vale 0,95 px por unidade, independentemente do tamanho da fonte.
  - Medição: caracteres a 64 px e palavras a 42 px dão o mesmo valor por unidade.
  - Cada letra ganha metade antes e metade depois.
  - Dentro de uma palavra ou linha, a abertura não segue a escala da unidade.
- **3D:**
  - câmera padrão de 50 mm (zoom = 480 × 50 / 36), projetada em relação ao centro da composição;
  - ordem de giro Z, Y, X, medida contra o rodopio 3D (as outras cinco ordens erram por muito).
- **IDs:** cada SVG desenhado tem prefixo próprio. O card e as miniaturas de direção usavam os mesmos IDs de filtro, e redesenhar uma miniatura apagava o filtro do card.
- **Relógio da prévia:** clique, foco e reentrada do cursor no painel reiniciavam a prévia no primeiro quadro, transparente. Agora só uma pausa real reinicia. Há um teste de regressão.
- **Miniaturas de direção:** enquadram o texto, para que as letras fiquem legíveis.

**Correções no host:**
- **Precedência no ExtendScript:** o AE 26.5 avalia `&&` e `||` com a mesma precedência, da esquerda para a direita. Medido: `1 || 1 && 0` dá `0`.
  - `groupConditionalBranches` agora agrupa todo `&&` operando de `||`.
  - Isso corrige 26 condições em 8 módulos. Entre elas, as coreografias de texto (Espiral de letras, Constelação de letras, Dispersão que se reúne…) não criavam o animador de rotação no AE.
- **Entreletra:** passa a escalar com `comp.height / 1080`, como as outras distâncias. Em 1080p nada muda.
- **Agrupamento do pivô:** receitas antigas de palavra e linha com escala, rotação ou pivô pedem o agrupamento da própria unidade, de forma suave.
  - Elas cedem a um preset da coleção de texto que exija outro agrupamento.
  - Elas não mudam a camada quando um animador do usuário depende do agrupamento atual.
  - Antes, o AE girava cada letra, e o card mostrava a palavra inteira.

**Presets novos:** Queda com quique, Espiral de letras, Placa que desce 3D, Esticar e assentar e Batida tipográfica, totalizando 185 receitas próprias.

**Resultado final (2026-10-18):**

After Effects 26.5x89/Windows, render isolado e sem cache:
- **298/298 receitas de texto PASS**: 113 antigas e 185 novas;
- nenhum erro de expressão;
- 298 vídeos e 298 pôsteres.

Comparação card × AE (`compare-report.json`):
- média 0,970;
- 223 presets com 0,98 ou mais, 236 com 0,95 ou mais. Antes das correções desta etapa eram 191 e 214.
- Os oito abaixo de 0,80 são decodificação, glitch e efeitos de cor: o tempo e a posição batem, mas as letras sorteadas e o efeito ilustrativo diferem pixel a pixel.

Painel no Chromium com o `dist`:
- 156/156 pôsteres carregados, vídeo no hover sem erro, sem overflow;
- ⚙: o card continua tocando o preset depois de escolher direção e caráter.

`npm run check`: 2.539/2.539 PASS.

NOT RUN:
- Painel CEP instalado no AE: aplicar pelo card, Undo nativo e salvar/reabrir.
- macOS e Premiere.

**Script de render:**
- `--fresh` ignora o cache, e `--diagnose` registra no relatório os animadores, as expressões e os erros vistos pelo AE.
- Uma instância isolada que termina o trabalho mas não fecha após `app.quit()` é encerrada um minuto depois.
- O cache inclui `scripts/build-extendscript.mjs`.

## Verificação

- `npm run check`: 2.511/2.511 PASS, incluindo:
  - a paridade host×prévia de todas as receitas de texto;
  - o ciclo de vida text-v3 (fases + loop + 3D + rollback);
  - os hashes legados.
- Sonda isolada no After Effects 26.5x89/Windows: PASS.
- Fixtures e render no AE: ver a seção de resultados abaixo.

## Resultados no After Effects

After Effects 26.5x89/Windows, instância isolada com projeto vazio e guarda do projeto do usuário (`artifacts/text-presets/fixture-report.json`):

- **290/290 receitas de texto PASS**: 113 antigas e 177 novas.
- Cada uma foi aplicada pelo dispatcher real (`phase-apply` em Ambos para transições, `apply` para loops) e inspecionada como `ready`.
- Nenhum erro de expressão em 8 instantes de amostra.
- Texto continua editável em 290/290.
- 3D por caractere ligado exatamente nas receitas que `libraryTextThreeD` aponta: zero divergência.
- `aerender` gerou as 290 prévias; ffmpeg converteu para MP4 H.264 marcado como BT.709. O fundo decodifica a ±2 níveis do #212121 do card.
- Pôster: o primeiro quadro da entrada em que o texto já mostra 60–90% da tinta em repouso, para que cada card exiba o próprio movimento (`--posters` regenera sem abrir o AE).
- O total de mídia é cerca de 20 MB.

Painel (Chromium real com o `dist` servido, sem Adobe):
- Pastas Caracteres, Palavras e Linhas: 154/154 pôsteres carregados.
- O vídeo toca no hover (readyState 4, sem erro), sem overflow horizontal.
- `ui-refinement.browser.mjs` (verificação do refinamento de UI de 16/10) segue 17/17 PASS: mesma geometria de card e popover em 280/360/480/720 e pixels da grade de Ferramentas inalterados.

NOT RUN:
- Painel CEP instalado no AE: aplicar pelo card, Undo nativo e salvar/reabrir.
- macOS e Premiere.
