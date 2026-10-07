# Suavização — interpretação do vídeo 12.19.57

- Fonte local: gravação de 106,5 segundos; 6.128 frames decodificados e analisados, 110 quadros representativos em 10 folhas de contato. Os quadros grandes de 24 s e 72 s foram inspecionados para leitura da interface.
- 0–11 s: o usuário mostra o gráfico atual e pede uma estrutura mais profissional.
- 11–28 s: pede biblioteca minimalista, sem o contorno branco dos cartões; curvas claras e seleção discreta.
- 28–49 s: pede melhor visibilidade e manuseio; demonstra o gráfico horizontal e amplo da ferramenta de referência.
- 49–101 s: seleciona dois keyframes de escala e compara a aplicação de curvas de suavização.

## Implementação delimitada

- Redesenhar o gráfico em proporção horizontal, com curva neutra clara, guias discretas, alças e keyframes legíveis; ajustar conversão de coordenadas para manter o arrasto correto.
- Exibir nome da curva ativa e manter coordenadas numéricas, navegação por teclado, overshoot, biblioteca, favoritos e curvas salvas.
- Retirar molduras dos cartões, reduzir alturas e usar seleção por contraste de superfície/linha.
- Preservar o contrato e matemática de easing; raiz da tarefa verifica aplicação real em keyframes de escala.
- Validar em 280, 360, 480 e 720 px, com interações de seleção, arrasto, teclado, favorito, salvar e aplicação por duplo clique.

Sem alteração de schema ou migração. Rollback: restaurar os blocos de apresentação do editor e tema; a biblioteca persistida mantém o formato anterior.
