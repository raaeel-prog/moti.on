# Presets de texto: centro visual, direções reais e acabamento (2026-10-27)

## Pedido

O usuário reportou quatro problemas e pediu correções em todos os presets de texto, além de novos presets:

1. Algumas animações pareciam crescer da direita para a esquerda, com a borda esquerda parada.
2. Com outra direção escolhida, a prévia mostrava quase o mesmo movimento.
3. Faltava acabamento profissional, e havia presets quase iguais com nomes diferentes.
4. Pediu novos presets úteis para flyers, anúncios, títulos e redes sociais.

Restrições do pedido:

- Não mover o texto em repouso nem saltar o Anchor Point da camada.
- Preservar os controles existentes e não remover funcionalidades.
- Explicar o que pode afetar projetos já criados.

## Problemas encontrados e causas

As medições estão em `docs/research/2026-10-27-ae-text-geometry.md`.

### 1. O texto esticava a partir da borda alinhada

- **Causa:** o Tracking Amount do After Effects soma espaço depois de cada caractere e o parágrafo mantém a borda do alinhamento.
- No texto alinhado à esquerda (o padrão do AE), Tracking 100 levou a borda direita de 889,7 para 2189,7 px, enquanto a esquerda ficou em 7,1.
- A prévia e o render dos cards usavam texto centralizado com âncora no centro, por isso nunca mostraram o defeito.
- Afetava cerca de 107 presets com espaçamento: todas as convergências, aberturas e "Espaço…" e as receitas antigas com `tracking`.

### 2. Escala e giro em torno da linha de base, e com pivô que se movia

- Por caractere, palavra e linha, o AE escala e gira cada unidade no centro do avanço **sobre a linha de base**. Por isso as letras cresciam e giravam a partir do pé, não do centro visual.
- O pivô das receitas de texto era o Anchor Point do animador, multiplicado pelo peso do seletor. Assim o ponto de giro andava durante a animação.
- Exemplo: "Crescer do topo" colapsava na linha de base, não no topo.

### 3. Distâncias em pixels da composição

- Deslocamento, desfoque, espaçamento e pivô eram pixels de uma composição de 1080 px. Um título grande quase não se mexia, e uma legenda pequena saltava o dobro do card.
- Nas janelas com máscara, letras grandes já começavam visíveis dentro da janela.

### 4. Direção só girava o deslocamento

- `libraryDirection` só rotacionava o vetor de posição.
- Giros, origem do pivô, eixo da escala, eixo do desfoque e ordem continuavam iguais. Em receitas com pouco deslocamento e muito giro (inclinações, aproximação 3D, porta giratória), as quatro direções pareciam o mesmo movimento.
- Receitas sem deslocamento, como arcos, flips 3D e crescer da base, nem mostravam o seletor.

### 5. Quase-duplicatas

Uma auditoria compara o que cada card desenha em 16 instantes, contra cada lado dos outros presets da mesma unidade (`scripts/text-presets-similarity.mjs`). Ela encontrou dois tipos:

- Pares iguais quando vistos de outro lado: "Crescer do topo" é "Crescer da base" vista de cima, e "Arco descendente" é "Arco de chegada" vista de cima.
- Pares que só mudavam a curva, que já é escolha do controle Caráter:
  - "Crescer da base elástico";
  - "Convergência viva";
  - "Esticar e assentar" (próximo de "Abertura vertical");
  - "Varredura de código reversa", que só invertia a ordem (escolha do controle Ordem).

## Correções no motor

Host e prévia usam as mesmas funções do pacote de contratos.

- **Espaçamento centrado** (`libraryTextLocate`; animador "Espaçamento" com seletor por caractere):
  - Cada caractere se afasta do centro da **própria linha**: (coluna − (n − 1)/2) × espaçamento × peso da unidade a que pertence (caractere, palavra, linha ou bloco).
  - A linha abre em torno do centro em qualquer alinhamento e volta exatamente ao lugar. O Tracking Amount deixa de ser usado.
  - O seletor do AE satura em ±100%, então o deslocamento viaja num vetor de 20000 px (`TEXT_SPAN`).
- **Pivô fixo no centro visual** (`libraryTextPivot`, `libraryTextHold`; animador "Centro"):
  - Cada unidade gira e escala em torno do centro visual, 0,36 em acima da linha de base (ou do centro do bloco com Agrupamento "Tudo"), mais a origem da receita (`text.origin`, em em).
  - Um animador separado soma c − M·c, com M a escala e o giro da própria fase, na ordem Z, Y, X medida no AE. O ponto fica parado durante a animação, e o Anchor Point do animador não é mais usado.
  - O tamanho da fonte e o agrupamento são lidos ao vivo na expressão.
- **Distâncias em em:**
  - Deslocamento, desfoque, espaçamento e coreografias são lidos em em do tamanho da fonte atual: `libraryTextReference`, o tamanho da amostra do card de cada unidade.
  - Qualquer título mantém a proporção do card. No card (amostra de referência), o resultado é idêntico ao anterior.
  - "Bloco único" continua em pixels do quadro, porque atravessa a tela.
  - Janelas com máscara começam a 1,1 em. As verticais começam totalmente escondidas.
- **Direções reais** (`libraryTextBase`, `libraryTextOrient`):
  - Cada receita tem um lado de chegada: o deslocamento, ou para onde a origem joga o centro no início, ou a borda que um giro X/Y conduz.
  - Os outros lados são o reflexo do movimento: esquerda/direita são espelho uma da outra, cima/baixo também, e o eixo trocado reflete pela diagonal.
  - Giros, origem, eixo da escala, eixo do desfoque e ordem acompanham (unidades vindas da direita andam da direita para a esquerda). A inclinação itálica é tipografia e não muda.
  - `libraryUsesDirection` passa a oferecer o seletor a todo preset de texto com lado: 181 transições, contra 149 antes. Fades, giros e escalas no lugar continuam sem seletor.
- **Intensidade acima de 100%:**
  - O AE limitava os seletores de movimento a ±100%. Intensidade 200–300% e antecipações eram cortadas no AE, mas não na prévia.
  - Posição, escala, giros e desfoque agora usam valores 4× maiores, com o seletor devolvendo um quarto (`TEXT_RANGE`). Com uma potência de dois, uma unidade que ainda não começou fica em escala exatamente 0. Com um terço sobrava 1e-14, que o AE ainda contava nos limites da camada.
  - A inclinação tem animador próprio, com o maior fator que mantém a receita dentro de ±70°, o limite do Skew no AE. Por exemplo, −28° usa 2×. Antes desse ajuste, "premium-glyph-italic" falhava ao aplicar.
  - O pivô fixo usa o mesmo alcance, então o centro não sai do lugar.
- **Prévia (cards e blocos de direção):**
  - Usa a mesma orientação, pivô, espaçamento e em, com paridade unidade a unidade testada contra o host.
  - O gerador do núcleo do host (`scripts/build-motion-library.mjs`) declara as funções numa closure, para que as auxiliares do host chamem umas às outras.

## Presets

- **Aprimorados pelo motor:** todos os 309 presets de texto oferecidos (196 da coleção de texto e 113 antigos):
  - 107 ganharam espaçamento centrado;
  - 198 que escalam ou giram passaram a fazê-lo no centro visual ou na origem;
  - todos têm distâncias proporcionais à fonte e direção real quando têm lado.
- **Origens revistas (coleção de texto):**
  - "Inclinação elegante" gira pela linha das capitais.
  - "Balanço de chegada" pende de um ponto acima.
  - "Giro com ricochete" balança sobre a linha de base.
  - "Abertura vertical" e "Crescer da base" partem da linha de base.
  - "Dobradiça 3D", "Placa que desce 3D" e "Dobra em sequência 3D" articulam no topo.
  - Os arcos giram em torno de um ponto 2,4 em abaixo.
- **Duplicatas aposentadas, não apagadas:** 12 receitas, com o campo `retired`:
  - "Arco descendente" e "Crescer do topo": o mesmo movimento visto de cima.
  - "Crescer da base elástico" e "Convergência viva": a mesma receita com outro Caráter.
  - "Esticar e assentar".
  - "Varredura de código reversa": a mesma com outra Ordem.

  Continuam no catálogo, então camadas que já as usam seguem inspecionáveis, ajustáveis e removíveis. Só deixam de ter card.
- **Novos (23):**
  - **Cambalhota** (caracteres, palavras): cai girando uma volta inteira.
  - **Pouso elástico** (caracteres, palavras): cai esticado e achata na linha de base ao pousar (squash and stretch).
  - **Leque da base** (caracteres, palavras): abre como leque a partir do pé esquerdo.
  - **Atração magnética** (caracteres, palavras, linhas): espalhado e ampliado, atrai-se e passa do ponto uma vez.
  - **Código que se fecha** (linhas): resolve os glifos fechando o espaçamento, da última linha para a primeira.
  - **Elástico lateral** (caracteres, palavras): chega esticado na direção do movimento e se comprime ao parar.
  - **Impacto** (caracteres, palavras, linhas): chega de 360%, rápido, com um ricochete curto. Para títulos e promos.
  - **Zíper** (caracteres, palavras): unidades alternadas chegam de lados opostos.
  - **Corte inclinado** (caracteres, palavras, linhas): sobe dentro da janela com inclinação que se endireita.
  - **Varredura de cor** (caracteres, palavras): sobe com um tom dourado que assenta no preenchimento original.
  - **Placa que desce 3D** agora também por caractere.

## Compatibilidade

- O anchor point, a posição e o texto da camada não mudam, e os metadados mantêm o mesmo formato. A remoção apaga só o que o Moti.on criou.
- **Camadas que já têm um preset aplicado** guardam as expressões antigas e continuam iguais até alguém ajustar ou reaplicar o preset. Nesse momento recebem o motor novo:
  - espaçamento centrado;
  - pivô no centro visual;
  - distâncias proporcionais à fonte.

  Isso é a correção pedida. O efeito visível é que um título que esticava a partir da esquerda passa a abrir pelo centro, e que letras que cresciam do pé passam a crescer do centro.
- Ao ajustar ou reaplicar um preset numa camada montada pelo motor anterior, as partes que o motor novo não usa são neutralizadas:
  - o Tracking Amount ancorado na borda;
  - o Anchor Point com peso;
  - um animador "Tipografia" só de espaçamento.

  A propriedade volta ao repouso e o seletor vai a 0, sempre pelos mesmos caminhos de snapshot. Assim nada anima duas vezes, e Desfazer e rollback restauram tudo exatamente.
- Os IDs das 12 duplicatas foram mantidos e os movimentos novos ganharam IDs próprios. Nenhum projeto existente troca de movimento ao ser editado.

## Validação

- Testes automatizados novos:
  - `text-direction.test.mjs`: todo preset de texto com seletor produz quatro movimentos diferentes no card, e "Original" é o lado de autoria.
  - `text-presets-v3.test.mjs`: espaçamento centrado por linha e por palavra, pivô fixo, zero em repouso, lado espelhado no host.
  - `motion-library-text.test.mjs`: contagens, novos presets, aposentados, travel das janelas e origens.
- Testes atualizados: paridade prévia×AE com a receita orientada e as coreografias em em.
- Suíte de presets, texto e contratos: 761/761 PASS, incluindo a paridade prévia × AE unidade a unidade em entrada, saída, ambos, diagonais e ordem de saída repetida.

## Resultados no After Effects

After Effects 26.5x89/Windows, instância isolada com projeto vazio e guarda do projeto do usuário. Os casos foram aplicados pelos comandos do painel (`phase-apply` / `apply`) em camadas de texto reais, com Anchor Point na origem do texto, como o AE cria. Evidência em `artifacts/text-presets/validation-report-final.json` e `validation-summary-final.json`, gerados pelo build final.

- **Todos os presets (321, incluindo os 12 aposentados), texto alinhado à esquerda em duas linhas, 90 px:** 321/321 PASS.
  - Nenhum erro de expressão em 6 instantes.
  - Nas 289 transições, o texto em repouso fica **exatamente** onde estava: 0 px de desvio.
  - Anchor Point e Position da camada intactos em 997/997 casos.
  - Remoção completa (sem animador, efeito ou marca) em 997/997.
- **Alinhamento:** 212 presets com espaçamento, escala ou giro, em texto alinhado à esquerda, ao centro e à direita.
  - O movimento em relação à própria caixa difere no máximo **0,01 px** entre os alinhamentos.
  - Ficaram de fora 25 instantes em que todas as letras estão em escala 0 e a caixa da camada vira um ponto.
- **Tamanho:** fontes de 40, 100 e 220 px. O movimento escala exatamente 0,4× e 2,2× em todos os 8 presets medidos (espaçamento, deslocamento, escala, giro, janela, coreografia).
- **Direções:** 10 presets × 4 lados. Cada par de lados difere em pelo menos 6,5 px. A menor diferença é a do Zíper de cima contra o de baixo, que são espelhos com metade das unidades em comum.
- A validação encontrou e confirmou a correção de dois problemas desta entrega:
  - a inclinação de −28° × 3 excedia o Skew;
  - com um terço, letras ainda não iniciadas ficavam em escala 1e-14 e entravam nos limites.

## Prévias renderizadas dos cards

Atualizado em 30/10:

- Todos os presets de texto oferecidos (309) têm vídeo renderizado no After Effects com o motor final.
- Cada lado que o seletor de Direção oferece também tem o seu próprio vídeo (`<id>--<lado>`, 731 variantes, em 15 fps e 3 s, porque os blocos são pequenos). São 4 lados para os presets com entrada lateral; esquerda/direita ou cima/baixo para as varreduras no lugar.
- Os cards de texto não desenham mais SVG:
  - o card mostra o render do lado escolhido;
  - mudar intensidade, duração ou curva mantém o vídeo do preset, porque um vídeo pré-renderizado não acompanha esses valores;
  - o SVG fica só como reserva para uma receita sem render, e `text-preview-coverage.test.mjs` exige que não exista nenhuma.
- Os blocos de Direção ("Ver todas") mostram o pôster do lado e tocam o vídeo ao clicar.
- O render roda numa instância isolada do After Effects (`-m`), sem tocar no projeto aberto, e funciona mesmo com o AE do usuário aberto:

  ```bash
  node scripts/text-presets-render.mjs --prepare --render
  ```

  `--shards=8` divide a fila em 8 projetos renderizados em paralelo (padrão 6). Os renders ficam em cache pelo hash da receita, das opções e do motor de texto; só o que mudou é renderizado de novo. `--no-directions` pula as variantes.

## Texto editável depois de aplicar (30/10)

- Problema: depois de aplicar um preset, a ferramenta de texto do AE não apagava e digitava na frente do texto.
- Causa provável: as expressões dos seletores liam o próprio Texto de origem (`text.sourceText`: tamanho da fonte para as distâncias em em e o texto para localizar coluna e linha). O AE reavalia essas expressões a cada tecla durante a edição. O motor de 26/10 não lia, e o problema apareceu junto com essa leitura. A relação foi deduzida, não reproduzida na interface do AE.
- Correção: o host lê o tamanho da fonte e o texto ao aplicar (`textSnapshot`, `textLocateCode`) e grava os valores na expressão. Nenhuma expressão de preset lê mais o Texto de origem (teste em `text-presets-v3.test.mjs`).
- Consequência:
  - mudar o tamanho da fonte depois mantém as distâncias aplicadas até ajustar ou reaplicar o preset;
  - editar o texto para outro número de caracteres troca a ordem por linha por uma estimativa numa linha só, também até ajustar ou reaplicar.

## Limitações

- Em texto de caixa (parágrafo com quebra automática), as linhas visuais não aparecem na expressão. O espaçamento centra pelo parágrafo, não pela linha quebrada automaticamente.
- O centro visual usa 0,36 em, o centro de uma maiúscula. Em texto só de minúsculas, o centro real fica um pouco abaixo.
- Um Grouping Alignment diferente de 0, 0, escolhido pelo usuário, não é compensado.
- Quando entrada, saída e efeito estão ativos no mesmo instante, o AE aplica uma única transformação por unidade: o pivô de cada fase só é exato enquanto ela anima sozinha.
- Caracteres fora do plano básico (emoji, marcas combinantes) contam diferente em JavaScript e no AE. O espaçamento pode desalinhar o escalonamento nesses textos.
- Na prévia, o espaçamento interno de palavras e linhas gira junto com a unidade. No AE, ele é aplicado depois do giro. A diferença só aparece em presets que combinam espaçamento e giro por palavra.
- As janelas com máscara horizontais (como "Janela lateral") escondem só as unidades das bordas no início. A janela é o bloco inteiro, e esse é o desenho do preset.
