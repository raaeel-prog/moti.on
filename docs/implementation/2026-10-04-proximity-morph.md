# Morph por proximidade — fontes comuns e variáveis

Implementação de 04/10/2026, verificada no After Effects **26.5x89**, macOS 27.2. O mesmo nulo controla a influência por letra nos dois motores. Fontes comuns usam contornos nativos com Merge composto, Offset Paths e preenchimento; fontes variáveis continuam usando os eixos reais da família. O texto original permanece editável.

## Uso e escopo

Em **Ferramentas → Animação → Morph por proximidade**, escolha um preset, raio e intensidade. A primeira aplicação seleciona o nulo. Arraste ou anime sua posição. Avançados oferece modo Automático/Fontes comuns/Fontes variáveis, suavidade, ajustes individuais e operações. Automático escolhe eixos quando há `wght` e suporte nativo, ou contornos nos demais casos. Contraste e itálico por eixo aparecem conforme as capacidades da fonte.

| Preset | Destino na influência máxima |
|---|---|
| Peso suave | Peso +35% |
| Peso marcante | Peso +75% |
| Afinar | Peso −35% |
| Largura | Horizontal 112% |
| Inclinação | Inclinação geométrica 12° |
| Lupa | Horizontal e vertical 115% |
| Onda | Elevação de 15% do tamanho da fonte |
| Borracha | Horizontal 115%, vertical 90% |

Os demais ajustes ficam neutros ao escolher um preset. Defaults novos: Automático + Peso suave, intensidade 100%, suavidade 75% e raio de 250 px em uma composição de 1080 px de altura, escalado pela altura. Em fontes comuns, Peso +100% expande 2,5% do tamanho da fonte e −100% contrai 1%. O modo comum é uma aproximação visual; não substitui o desenho óptico de um Bold da família. Amplitudes fortes podem fechar vazados ou unir vizinhos, especialmente em fontes display.

O rig aceita uma camada de texto de ponto 2D, horizontal LTR, estilo uniforme, preenchimento sólido, conteúdo estático e quebras manuais. Limites: 128 caracteres, contando espaços e pares surrogate uma vez, sem contar CR/LF, e 12.000 vértices nativos. Associação ambígua entre texto e contornos, estilos misturados, paragraph text, 3D, máscaras, matte, efeitos e animadores externos na origem são recusados. Posição separada e hierarquias 2D animadas têm prova nativa. O espaçamento de repouso da origem é preservado no vetor; o motor variável conserva as opções nativas de espaçamento.

## Operações e preservação

Aplicar/Ajustar reutiliza o rig. O cartão rápido lê os controles existentes antes de enviar o comando. Um ajuste que substituiria um controle animado é recusado antes da mutação. Atualizar texto refaz geometria e medição após mudar conteúdo, fonte, tamanho, tracking ou layout; mantém o mesmo nulo, trajetória, keyframes, easing e expressões dos controles. Também permite mudar de motor ou reativar um rig convertido.

Criar varredura grava uma passagem de 48 quadros por padrão, em quatro direções, medida no quadro corrente. Começa e termina fora do raio. Falta de duração, posição separada do nulo, keyframes ou expressão já existentes na posição recusam a operação. O percurso considera o parent 2D do controlador.

Converter em keyframes usa a interseção da área de trabalho com a duração do texto. Amostra a cada quarto de quadro e refina intervalos quando a comparação entre amostras exige precisão adicional. O vetor grava Offset, escala, inclinação, elevação e opacidade gerenciados. O variável grava os destinos finais ponderados em um animador por glifo, com Range Selector indexado; não amostra o Amount global dependente de `textIndex`. Trechos constantes são comprimidos. Os valores intermediários são verificados antes de remover as expressões ao vivo.

Limites do Bake: 3.600 quadros e 120.000 amostras totais, incluindo refinamento e verificação. Um lote denso pode exigir uma área de trabalho menor mesmo dentro do limite de quadros. No fixture de 128 glifos variáveis, seis quadros com uma passagem de 48 quadros excederam o orçamento; dois quadros passaram. Essa recusa ocorre antes de criar os animadores baked. Os números não aprovam Bake longo de 128 letras nem garantem preview em tempo real.

Remover restaura a visibilidade original e remove somente os membros gerenciados. Preserva o nulo quando existem efeitos, filhos, Layer Controls ou expressões externos associados; nesse caso limpa os sliders gerenciados. Cada mutação tem um único grupo de Undo e recuperação em caso de falha. Aplicações posteriores preservam seleção e tempo; remover um membro selecionado retorna à origem.

`ae.text.variable-morph` permanece compatível. Chamadas antigas sem `renderer` conservam o comportamento variável v1. Rigs v1 continuam legíveis e removíveis; Atualizar migra para v2. A leitura `ae.text.variable-morph.read` fornece controles, capacidades, versão, modo resolvido, estados stale/baked e controles protegidos. O fingerprint considera a origem; baselines deformadas pelo animador não provocam falso stale. A base dos eixos é reconstruída a partir da fonte original ao atualizar.

## Evidências

| Verificação | Resultado e evidência |
|---|---|
| Base anterior | **PASS: 2.008/2.008** — [check inicial](../../artifacts/proximity-morph-20261004/baseline-check.log) |
| Integração final | **PASS: 2.053/2.053**, lint, tipos, build, contratos, contraste e skills — [check final](../../artifacts/proximity-morph-20261004/final-check.log) |
| Testes Morph em Node | **PASS: 34/34**, incluindo 11 legados, proximidade, transformações, migração, controles animados, rollback após remoção parcial e Bake entre amostras. São mocks, não substituem o Adobe. |
| Extração e geometria em Node | **PASS: 44/44** — [revisão geométrica](../../artifacts/proximity-morph-20261004/geometry-review.md) |
| Matrix nativa | **PASS: 9/9**, Arial, Times New Roman, Impact e Inter Tight; oito presets por família, zero influência, conteúdo `B8OQ ação i.j`, multilinhas/tracking negativo, parentes 2D, Apply/Read/Update/Remove/Bake e controles animados — [relatório](../../artifacts/proximity-morph-20261004/native-results.json) |
| Inspeção dos presets | **PASS: 32/32** — [revisão](../../artifacts/proximity-morph-20261004/native-visual-review.md), [contact sheet](../../artifacts/proximity-morph-20261004/preset-contact-sheet.jpg) |
| Pixels e live/Bake | **PASS: 12/12**; zero influência no vetor difere somente por antialiasing, VF é idêntico; live/Bake conserva suporte e aparência nas amostras exportadas — [medição](../../artifacts/proximity-morph-20261004/pixel-results.json). PNGs são uma prova de render; a validação de valores entre quadros é separada. |
| Compatibilidade e recusas nativas | **PASS: 9/9**, v1 Apply/Read/Remove, migração com easing/expressões, 3D/paragraph/estilo misto/129 caracteres, sweep protegido, falha de extração e orçamento de vértices sem mudança parcial — [relatório](../../artifacts/proximity-morph-20261004/native-extras-results.json) |
| Guards adicionais nativos | **PASS: 4/4**, posição separada nos dois motores, nulo parentado e retenção por Layer Control externo — [relatório](../../artifacts/proximity-morph-20261004/native-guards-results.json) |
| Regressão Revelação | **PASS: 52/52 PNGs idênticos em RGBA** ao baseline; 13 endpoints/caixas/intermediários preservados após extrair a utilidade comum — [medição](../../artifacts/proximity-morph-20261004/word-regression/pixel-results.json), [inspeção](../../artifacts/proximity-morph-20261004/word-regression/visual-review.md) |
| Undo real | **PASS**, um Cmd+Z restaura somente a origem visível, seu ID e CTI — [relatório](../../artifacts/proximity-morph-20261004/native-undo-results.json) |
| Desempenho | **PASS nos quatro lotes dentro do orçamento**; 16/128 glifos em cada motor, com duração de trabalho registrada — [medição](../../artifacts/proximity-morph-20261004/performance-results.json). [Diagnóstico da recusa de 128VF/6 quadros](../../artifacts/proximity-morph-20261004/performance-128-diagnostic.json). |
| UI Chromium | **PASS: cinco grupos**, PT em 280/360/480/720 px e EN em 360 px, 20 capturas, oito presets, ações, proteção de animação, stale/baked e eixos disponíveis; zero overflow/erros. Transporte CEP simulado — [relatório](../../artifacts/proximity-morph-20261004/ui-results.json), [inspeção](../../artifacts/proximity-morph-20261004/ui-visual-review.md) |
| Painel CEP instalado | **PASS: 7/7 operações reais**, aplicação automática nos dois motores, varredura, Bake, atualização e remoção; mesmo nulo e trajetória preservados na atualização, origem restaurada — [estados nativos](../../artifacts/proximity-morph-20261004/installed-panel-results.json), [conferência](../../artifacts/proximity-morph-20261004/installed-panel-review.md) |
| Salvar/reabrir | **PASS: dez rigs da demo**, IDs, controles e estados preservados — [relatório](../../artifacts/proximity-morph-20261004/demo-results.json) |
| Persistência baked e troca de fonte | **PASS: 2/2**, contornos e eixos; mesmo nulo, trajetória/easing e expressão de suavidade; 18 propriedades vetoriais e 17 variáveis com keyframes preservadas. Atualizar Inter Tight Regular → Bold reconstruiu a base de peso de 400 para 700 — [relatório](../../artifacts/proximity-morph-20261004/native-persistence-results.json) |
| Vídeo entregue | **PASS: 180/180 quadros decodificados** e três instantes inspecionados; H.264, 1920×1080, 30 fps, seis segundos — [verificação](../../artifacts/proximity-morph-20261004/video-verification.json), [revisão](../../artifacts/proximity-morph-20261004/video-verification.md) |
| Instalação | **PASS: 43/43 arquivos por SHA-256**, backup da extensão anterior, presets extras antigos preservados — [inventário](../../artifacts/proximity-morph-20261004/installed-bundle-results.json), [instalação final](../../artifacts/proximity-morph-20261004/install-final.log) |

A matriz nativa ocorreu em uma instância separada criada para QA. O teste de Undo e a conferência do painel usaram composições temporárias no projeto já aberto. A composição final e suas fontes de nulo foram retiradas; os quatro itens anteriores mantiveram seus IDs e o viewer foi restaurado. Nenhum `.aep` do usuário foi salvo ou sobrescrito. [Preservação após Undo](../../artifacts/proximity-morph-20261004/original-project-preservation.json), [preservação final](../../artifacts/proximity-morph-20261004/original-project-final-preservation.json).

O [projeto de demonstração](../../artifacts/proximity-morph-20261004/proximity-morph-demo.aep) mantém dois motores e os oito presets editáveis. O [vídeo](../../artifacts/proximity-morph-20261004/proximity-morph-demo.mp4) demonstra o nulo percorrendo o texto. [Render nativo](../../artifacts/proximity-morph-20261004/render-results.json).

## Compatibilidade delimitada

After Effects 26.5x89/macOS é a combinação validada. O modo variável requer AE 26+ com a API nativa e os eixos necessários. O modo comum depende da conversão nativa e de Offset Paths; versões anteriores e outros sistemas operacionais não foram testados nesta entrega. Ligaturas, textos complexos e fontes coloridas/bitmap não têm suporte universal. A comparação nativa e os testes de subframes cobrem os fixtures registrados; não prometem equivalência óptica para qualquer fonte, expressão arbitrária, velocidade ou amplitude.

Persistência foi verificada nos rigs ao vivo da demo e nos dois motores já convertidos em keyframes, incluindo valores em subquadros. Morph entre arquivos Regular/Bold separados permanece fora desta etapa. [Pesquisa e fontes Adobe](../research/after-effects-proximity-morph.md).
