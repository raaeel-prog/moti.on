# Coleção Studio — plano

32 presets próprios, 24 de texto e 8 de motion, com parâmetros calibrados por receita. Preservar os 56 presets anteriores e seus resultados. Um agente é responsável pelo contrato compartilhado; host, matemática, interface e integração ficam com o agente principal.

Contrato aditivo: referência nula nos presets originais novos, coleção Studio, defaults individuais, novas curvas silk/glide/spring, ordem dos elementos de texto e desfoque por caractere. Opções opcionais elasticity/overlap/speed preservam pedidos antigos válidos. Novos controles nativos só são criados para receitas Studio.

Curvas devem ter velocidade nula nos extremos e elasticidade limitada. A sobreposição limita o atraso acumulado para preservar pelo menos 55% da duração para o deslocamento de cada unidade, inclusive em textos longos. A velocidade ajusta os ciclos dos efeitos contínuos.

Arquivos: catálogo/contratos, matemática compartilhada, gerador do host, comando de presets, galeria e render de prévias. Atualizar testes e documentação.

Verificar todos os 88 presets no AE 26.5x89/macOS, incluindo os 32 novos renderizados, extremos das curvas, opções inválidas, ajuste sem duplicação, remoção, Bake/Undo e textos longos. Testar UI em 280/360/480/720 px. Fixtures devem usar apenas composições próprias e referências guardadas; nenhum script pode modificar a composição do usuário por estar ativa. O teste de texto normaliza estilo em objetos da fixture.

Rodar npm run check e comparar as falhas com as 22 preexistentes. Instalação local com backup, sem publicação de release. Reversão dos fontes em artifacts/studio-presets/source-before.
