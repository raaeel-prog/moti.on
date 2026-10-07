# Morph por proximidade: dois motores

Pesquisa e implementação em 04/10/2026. O objetivo é manter o nulo como controle espacial por letra, com fontes comuns e fontes variáveis na mesma ferramenta.

O motor de fontes comuns reúne os contornos exatos de cada glifo em um grupo vetorial: paths, Merge no modo composto, Offset Paths e Fill. Pontos, acentos e vazados pertencem ao mesmo glifo. A Adobe documenta a conversão nativa de texto em grupos e a expansão/contração dos contornos por Offset Paths. [Conversão de texto](https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/creating-shapes-masks.html), [Offset Paths](https://helpx.adobe.com/au/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/use-offset-paths.html).

Isso produz uma aproximação visual de espessura. Aumentar o contorno não redesenha proporções, espaçamento, contraste óptico e detalhes como um verdadeiro Bold da família. Valores fortes podem fechar vazados ou unir letras; contração forte pode apagar hastes. A referência inicial é expansão de 2,5% do tamanho da fonte em Peso +100% e contração de 1% em Peso −100%. Peso, raio e intensidade permitem ajustar o resultado.

O motor variável usa `designAxesData` e `addVariableFontAxis(tag)`, mantendo a interpolação desenhada pela família. O Peso positivo interpola da base original ao máximo e o negativo interpola da base ao mínimo. Contraste e itálico por eixo dependem das capacidades da fonte. O modo Automático exige eixo `wght` e a API nativa do host; caso contrário usa os contornos. [Adobe: scripting de fontes variáveis](https://helpx.adobe.com/after-effects/desktop/variable-font-axes/work-with-variable-font-axes/scripting-support-for-variable-font-axes.html).

Os dois motores medem distância em pixels da composição pelo centro **original** do glifo. Transformações da camada e de seus parentes 2D são consideradas no tempo corrente. A deformação visual não altera esse centro. A influência é a mistura entre queda linear e smoothstep, multiplicada pela Intensidade, com zero fora do raio. Os presets geométricos preservam o espaçamento original da camada; largura e inclinação deformam cada glifo em torno de sua referência original.

## Associação entre texto e glifos

A utilidade compartilhada `MotionTextGlyphOutlines` converte uma duplicata temporária sem animadores, neutraliza somente seus transforms, extrai os contornos e remove os temporários. A Revelação com caixas reutiliza essa extração e mantém seu próprio algoritmo caixa→letra.

Um probe no AE 26.5x89 confirmou que espaços contam para `textIndex`, CR/LF não contam e um surrogate válido conta uma vez. A associação exige um grupo nativo por caractere visível. Conversões com ligaturas ou estruturas ambíguas são recusadas. Escopo do Morph: texto de ponto 2D, horizontal LTR, estilo uniforme, preenchimento sólido, conteúdo estático e quebras manuais, até 128 caracteres e 12.000 vértices. [Probe do host](../../artifacts/proximity-morph-20261004/native-capability-probe.json), [revisão da extração](../../artifacts/proximity-morph-20261004/geometry-review.md).

## Conversão em keyframes

O Amount de um expression selector depende do contexto de `textIndex`; lê-lo globalmente não fornece um valor por caractere. O Bake variável prepara os valores finais ponderados de cada glifo, depois cria animadores com seletores indexados de um caractere. Preserva as opções de agrupamento e espaçamento do texto. O Bake vetorial amostra Offset, escala, inclinação, elevação e opacidade gerenciadas. [Adobe: seletores e animação de texto](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html).

A amostragem usa a interseção entre área de trabalho e duração do texto, a cada quarto de quadro, com refinamento adaptativo e verificação dos pontos intermediários. Um cache conserva os valores exatos já avaliados. Apenas trechos constantes são comprimidos. O lote é limitado a 3.600 quadros e 120.000 amostras totais, incluindo refinamento e verificação. A comparação renderizada passou nos fixtures nativos, e a persistência baked foi conferida em quadros e subquadros nos dois motores. O lote variável de 128 glifos exigiu reduzir a área de trabalho de seis para dois quadros para caber no orçamento. [Comparação live/Bake](../../artifacts/proximity-morph-20261004/pixel-results.json), [persistência](../../artifacts/proximity-morph-20261004/native-persistence-results.json), [desempenho e durações](../../artifacts/proximity-morph-20261004/performance-results.json). Essas provas delimitam os fixtures; os testes em Node não substituem o compositor Adobe.

## Compatibilidade

O protocolo conserva `ae.text.variable-morph`; envelopes antigos sem `renderer` continuam no motor legado. A leitura usa `ae.text.variable-morph.read`. Rigs v1 continuam legíveis e removíveis; Atualizar realiza a migração para v2. A fonte original permanece editável. Alterações de texto, fonte, tamanho ou espaçamento exigem Atualizar, preservando o nulo e seus controles animados.

O suporte a Offset foi confirmado no AE 26.5x89. O modo variável requer AE 26+ e a API disponível. Outras versões, sistemas operacionais e fontes dependem de validação específica; não são inferidos da prova feita nesta máquina. Morph entre arquivos separados Regular/Bold está fora do escopo.
