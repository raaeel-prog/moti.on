# Revelação com caixas: morph vetorial nativo

Data da decisão: 04/10/2026. Comando: `ae.text.word-reveal`. Estado: implementado e verificado no After Effects 26.5x89, incluindo painel CEP real, geometria, ciclo de vida, endpoints, Undo e persistência de controles animados. O desempenho de Bake em lotes grandes permanece fora da prova concluída.

A referência fornecida pelo usuário, `Super Morphings.jsxbin`, orienta o resultado visual. A implementação utiliza paths nativos do After Effects e uma preparação própria de curvas Bézier; o binário de referência não é uma dependência do rig.

## Capacidade e fontes

A Adobe documenta que **Create Shapes from Text** produz um grupo por caractere com preenchimento e contorno correspondentes ao texto. Caracteres compostos mantêm vários paths e um operador Merge Paths. Esse comando fornece o destino vetorial nativo; a implementação deve confirmar a camada criada, restaurar seleção/tempo e manter o texto original recuperável. [Adobe: criação de shapes e máscaras](https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/creating-shapes-masks.html).

O modo **Merge** combina paths num compound path; **Add** calcula a união das áreas. A regra Nonzero considera a direção do contorno e permite vazados ao inverter o winding. Portanto, a união direta de todos os contornos de uma palavra não é prova de preservação de letras vazadas; o compound path de cada glifo precisa continuar correto antes da união da palavra. [Adobe: operações e regras de preenchimento](https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/shape-attributes-paint-operations-path.html).

Operadores e preenchimentos alcançam paths anteriores no grupo. Os paths usados como referência devem ficar fora do grupo renderizável, sem operações comuns no ancestral que os incorporem. Apenas omitir Fill/Stroke no subgrupo não é uma garantia de isolamento. [Adobe: grupos e ordem de renderização](https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/vector-graphics-and-raster-images/overview-shape-layers-paths-vector.html).

## Critérios geométricos

- O início de uma palavra deve ser uma única caixa arredondada. Se a caixa for repartida por glifo, suas células precisam cobrir exatamente o mesmo contorno exterior, com bordas internas coincidentes e sem contorno visível nessas bordas.
- A preparação deve equalizar topologia por subdivisão exata de Bézier, preservar os contornos finais e resolver winding/início do path. A mesma quantidade de pontos, isoladamente, não evita torções.
- Vazados e contornos separados, como pontos e acentos, começam com área zero. Seu progresso deve permanecer coerente com o contorno exterior; não podem surgir como cortes inesperados fora do glifo.
- O término deve devolver a geometria vetorial nativa de destino; nenhum crossfade para uma camada de texto substitui a transformação geométrica.
- Uma varredura com atraso por vértice exige evidência visual intermediária. Ela pode introduzir dobras e cruzamentos; maior densidade de pontos não resolve esse risco por si só.

A implementação escolhe a fase cíclica do contorno por custo global de correspondência. A escolha inicial baseada apenas no vértice mais próximo do canto superior esquerdo dobrava um `U` simples durante o morph. O teste de regressão avalia 21 estados e, após a correção, não encontra cruzamentos nesse fixture. Isso não constitui garantia para todas as fontes ou todos os parâmetros.

## Evidência exigida

Testes puros devem verificar curvas subdivididas, transformações de pontos/alças, winding, caixa repartida, contornos colapsados, dados finitos e endpoints. No host real, comparar caixa única e texto nativo com frames intermediários de `B8OQ`, `áíç`, fontes serifadas, tracking negativo, opacidade de 50% e posições fracionárias. Registrar também Atualizar/Remover/Bake, preservação de controles animados, seleção/tempo, Undo e rollback. Mocks ou aprovação dos testes puros não provam ausência de seams nem comportamento dos operadores nativos.

Evidência obtida nesta integração: [15/15 testes geométricos puros](../../artifacts/word-morph-20261004/geometry-unit.log) e [4/4 cenários do motor geométrico no AE 26.5x89](../../artifacts/word-morph-20261004/geometry-native.json), incluindo avaliação nativa das expressões e exportação de frames. O roteiro de [ciclo de vida no AE](../../artifacts/word-morph-20261004/verify-morph-lifecycle.jsx) chegou até seis cenários PASS e foi interrompido durante Bake. A [migração nativa](../../artifacts/word-morph-20261004/morph-legacy-migration-results.json) passou em cinco cenários de controle/lifecycle. Os roteiros separados de [Bake](../../artifacts/word-morph-20261004/verify-morph-bake.jsx), [lifecycle sem Bake](../../artifacts/word-morph-20261004/verify-morph-lifecycle-no-bake.jsx) e [migração](../../artifacts/word-morph-20261004/verify-morph-legacy-migration.jsx) concluíram a verificação dos fluxos sem repetir o fixture longo.

A [matriz nativa](../../artifacts/word-morph-20261004/morph-visual-results.json) passou em 13 cenários, incluindo serifas, vazados, diacríticos, opacidade parcial e tracking negativo. A [comparação final por pixels](../../artifacts/word-morph-20261004/morph-pixel-results.json) passou nos 13 casos com bounds idênticos e apenas pequenas diferenças de antialiasing. Isso verifica estes fixtures, sem prometer ausência de dobras em qualquer fonte. O [Bake pequeno](../../artifacts/word-morph-20261004/morph-bake-results.json) preservou exatamente a geometria nos oito tempos amostrados e passou com Remover e preservação de expressão de cor do usuário.

O [ciclo nativo sem Bake](../../artifacts/word-morph-20261004/morph-lifecycle-no-bake-results.json) passou em nove cenários, incluindo preservação de controles animados, cores de ocorrências repetidas, rollback injetado e remoção sem atingir conteúdo externo. O fixture completo com Bake permanece registrado como execução interrompida; os resultados separados não são uma declaração de desempenho para lotes grandes.

A [demo salva e reaberta](../../artifacts/word-morph-20261004/demo-results.json) confirmou persistência dos controles/metadata e renderização do rig no AE 26.5x89. O [Undo nativo em sessão nova](../../artifacts/word-morph-20261004/native-undo-results.json) restaurou o original por um único Cmd+Z e preservou o CTI.

A [persistência de animação](../../artifacts/word-morph-20261004/morph-animated-persistence-results.json) passou em três cenários, com snapshots exatos antes/depois para Duration/Progress, keytimes/interpolation/easing, expressão de cor, opacidade do original, IDs/metadata e geometria avaliada. A [conferência do painel CEP instalado](../../artifacts/word-morph-20261004/installed-panel-results.json) passou em sete cenários, com Aplicar nativo alterando/restaurando a direção e conservando rig/seleção/tempo. A [instalação](../../artifacts/word-morph-20261004/installed-bundle-results.json) corresponde aos 43 arquivos atuais do build.
