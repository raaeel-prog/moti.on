# Efeitos de texto no After Effects

Revelação com caixas, Morph por proximidade e Troca de estilos ficam em **Ferramentas → Animação**. Clique uma vez no ícone para aplicar; o menu de opções abre os ajustes detalhados. Reaplicar em um efeito existente ajusta os controles, sem duplicar a montagem.

**Pulso vertical de texto** é o primeiro cartão de **Ferramentas → Efeitos** e também aparece na busca por “pulso”. Selecione um texto de ponto 2D e abra o editor do efeito para definir duração, expansão, rasgos, brilho, variação e cor antes de aplicar. O texto original permanece editável. Reaplicar ajusta o mesmo efeito; no seletor de ação, **Remover** apaga os três ecos gerenciados e restaura o original.

| Botão | Seleção | Resultado |
|---|---|---|
| Revelação com caixas | Uma camada de texto | Palavras sobem de caixas em sequência, a partir do cursor de tempo. |
| Morph por proximidade | Uma camada de texto com fonte comum ou variável | Cria e seleciona um nulo sobre o texto. Arraste-o para mudar a espessura e a forma das letras próximas. |
| Troca de estilos | Duas camadas de texto | Cria e seleciona um nulo à esquerda do texto. Arraste-o para a direita para trocar o estilo por caractere ou palavra. A camada superior é o estilo inicial. |
| Pulso vertical de texto | Uma camada de texto de ponto 2D | Expansão cíclica, brilho âmbar e bordas cromáticas com distorção breve. Fica em Ferramentas → Efeitos. |

No morph, arraste o nulo ou anime sua Posição para percorrer o texto. Raio controla a área de influência; Intensidade, Peso e Suavidade controlam a mudança e sua transição. **Automático** escolhe os eixos nativos quando a fonte oferece peso variável; nas fontes comuns, usa contornos vetoriais com aproximação de espessura. Também é possível escolher **Fontes comuns** ou **Fontes variáveis** nos ajustes. A aproximação pode engrossar ou afinar a fonte original, mas não reproduz exatamente o desenho de outro peso da família. Valores fortes podem fechar vazados ou fazer traços finos desaparecerem.

Os oito presets são **Peso suave**, **Peso marcante**, **Afinar**, **Largura**, **Inclinação**, **Lupa**, **Onda** e **Borracha**. Eles combinam espessura, escala horizontal/vertical, inclinação geométrica e elevação. No vetor, o espaçamento original permanece fixo; o modo variável preserva as opções nativas de compensação de espaçamento. Letras muito expandidas podem se sobrepor. Contraste e Eixo de itálico exigem esses eixos na fonte variável. Em fontes comuns, use Inclinação geométrica.

O texto original permanece editável. No modo de fontes comuns ele fica oculto enquanto o resultado vetorial aparece. Depois de editar conteúdo, fonte, tamanho, espaçamento ou alinhamento, escolha **Atualizar texto** para reconstruir as letras mantendo o nulo, sua trajetória e os controles animados. Use a mesma ação para trocar o tipo de fonte ou reativar um morph convertido em keyframes. Rigs da versão anterior podem ser lidos; **Atualizar para novo morph** faz a migração dos controles compatíveis.

**Criar varredura** adiciona uma passagem do nulo a partir do quadro atual, com duração e direção escolhidas. A Posição do nulo deve estar sem keyframes ou expressão; a operação recusa uma trajetória existente. **Converter em keyframes** grava o resultado por letra na interseção da área de trabalho com a duração do texto, a cada ¼ de quadro, refinando e verificando intervalos quando necessário. Mantém o nulo como referência e preserva expressões personalizadas dos controles. Reduza a área de trabalho se ultrapassar 3.600 quadros ou 120.000 amostras totais, incluindo refinamento e verificação. Textos variáveis extensos podem atingir esse orçamento em poucos quadros.

Na revelação, ajuste duração, intervalo, largura/altura das caixas, espaço entre caixas, arredondamento, ponto de revelação e cor global. Cada caixa também recebe cor própria opcional nos Controles do efeito. O texto original fica preservado e oculto enquanto o efeito está ativo.

Na troca, os dois textos precisam ter a mesma quantidade de caracteres ou palavras, conforme o modo escolhido. **Arraste o nulo da esquerda para a direita sobre o texto**: a troca acompanha a posição mesmo com o tempo parado. Para gravar a animação, adicione keyframes à **Posição** do nulo. As duas camadas originais permanecem preservadas e ocultas.

Nos Controles do efeito do nulo, `Follow Null` vem ativado. Para usar `Progress` manualmente ou com keyframes, desative `Follow Null` e mantenha `Automatic` desligado. Para animação automática pela linha do tempo, desative `Follow Null` e ative `Automatic`; nesse modo valem Duração e Intervalo. Reaplicar uma troca da versão anterior acrescenta o controle pelo nulo, sem duplicar camadas.

Para remover, selecione uma camada do efeito e abra seus ajustes: escolha **Remover** e aplique. A remoção restaura os originais. Cada aplicação também pode ser desfeita com um único Cmd+Z.

## Compatibilidade

- Morph: texto de ponto 2D horizontal, estático, uniforme, da esquerda para a direita, com uma ou mais linhas e quebras manuais; até 128 caracteres, contando espaços e ignorando quebras de linha, e 12.000 vértices nativos. Requer conversão nativa em shapes e leitura do estilo uniforme; eixos variáveis exigem After Effects 26+ e os eixos solicitados disponíveis. Sem stroke na origem, outros animadores ou efeitos, máscaras, matte, solo ou guia; a hierarquia deve ser 2D. Ligaduras, caracteres combinados e outras conversões com mapeamento ambíguo entre caracteres e grupos são recusados. Use Atualizar texto após editar a origem. A seleção muda de propósito para o nulo na primeira aplicação. Edição manual da estrutura gerenciada e membros travados bloqueiam operações que substituiriam o rig.
- Revelação: texto de ponto 2D, uniforme, da esquerda para a direita; até 60 palavras/2.000 caracteres, com quebras manuais. Sem animadores, efeitos, máscaras, matte, solo ou guia na origem. As transformações são herdadas da origem.
- Troca: dois textos 2D estáticos, visíveis e sem parent, até 500 unidades por camada. Sem máscaras, mattes ou animadores anteriores; transformações estáticas e sem dimensões separadas.
- Pulso vertical: texto de ponto 2D visível, sem efeitos, máscaras, animadores, matte, solo, guia ou posição separada. Requer controles nativos, Gaussian Blur e Turbulent Displace. No After Effects 26.5x89 foram verificados o cartão e o editor no painel CEP, a aplicação com três ecos e original desativado, um único Desfazer nativo que restaurou o original e a remoção pelo painel. Outras versões e salvar/reabrir ainda não foram verificados. [Validação e imagens](2026-09-28-vertical-text-pulse.md).
- O cursor precisa estar dentro das camadas. A revelação e o modo automático da troca precisam de tempo suficiente para a animação; o modo por posição da troca funciona no próprio quadro atual.
- Controles com keyframes ou expressões personalizados são preservados: ajuste-os diretamente no After Effects.

Validação destas ferramentas: After Effects 26.5x89 em macOS 27.2. Outras versões e sistemas não foram verificados. Premiere não faz parte destas ferramentas. O Morph v2 tem prova de salvar/reabrir nos dois motores, ao vivo e convertido; a persistência das outras ferramentas não foi repetida nesta rodada.

O Morph v2 foi validado no host: fontes comuns e variáveis, oito presets, atualização, varredura, conversão, remoção, Undo e salvar/reabrir. O painel CEP instalado passou por sete operações reais; o check completo passou em 2.053/2.053 testes. [Entrega, evidências e limites](../2026-10-04-proximity-morph.md).
