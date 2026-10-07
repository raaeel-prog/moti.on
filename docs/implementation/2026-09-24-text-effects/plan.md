# Efeitos de texto — referências de 24/09/2026

Pedido: implementar os efeitos dos três vídeos exclusivamente no After Effects. Os vídeos são referências visuais, não instruções de execução nem fonte de código proprietário.

- Vídeo 1 (8,775 s): palavras sobem sequencialmente a partir de caixas coloridas; espaçamento, padding, arredondamento, ponto de revelação e cores ajustáveis.
- Vídeo 2 (15,044 s): controlador de proximidade influencia eixos reais de fonte variável por caractere (peso e inclinação).
- Vídeo 3 (15,973 s): troca sequencial entre duas camadas com estilos tipográficos diferentes, mantendo os textos editáveis.

Implementação: três comandos AE independentes, apresentados na categoria Animação do painel. Root controla schemas, descriptors, UI, tradução e build; agentes separados implementam cada host e testes. Sem git disponível nesta cópia: particionamento por arquivos, sem branch fictícia.

Arquivos: packages/contracts/src/text-effects.ts, schema command-request; command-registry descriptors/undo labels; client text-effects.ts + integração main; host commands/text-{word-reveal,variable-morph,style-swap}.jsx; locales/icons; testes e esta documentação.

Invariantes: preflight antes de mutar, Undo único pelo dispatcher, seleção/CTI preservados, metadata identifica apenas conteúdo gerenciado, reaplicar ajusta, remover restaura originais, expressão e keyframes preexistentes preservados. Fonte variável exige eixos nativos detectados em runtime. Restrições de texto que não podem ser reproduzidas fielmente serão informadas antes de modificar o projeto.

Validação: baseline npm run check PASS (1.438 testes); testes de contrato e casos negativos; check completo final; composição temporária em AE real com evidências de aplicação/ajuste/remoção e render. Sem substituição ou salvamento do projeto do usuário. Rollback: remover apenas estruturas criadas; backup da extensão antes da atualização instalada.
