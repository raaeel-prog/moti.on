# Animation Composer instalado — auditoria funcional e inventário

Question: quais funcionalidades estão comprovadas na instalação local e nas fontes públicas do Animation Composer, e quais têm correspondência no Moti.on?

Decision date: 2026-09-25 (America/Bahia). Pesquisa concluída durante a continuação da tarefa.

Target host/version: Animation Composer 4.2.6 para After Effects; instalação local macOS. Esta auditoria não alterou o projeto aberto no After Effects.

Status: partial. Os metadados legíveis e o catálogo público foram auditados. Não houve teste exaustivo da interface instalada, aplicação de todos os itens nem comparação visual quadro a quadro.

## Método e alcance

A inspeção leu o manifesto CEP e o `Info.plist` do bundle nativo, contou arquivos por extensão e pasta e consultou documentação pública oficial da Mister Horse. O relatório compara essas evidências com contratos, catálogo compilado, interface e comandos host do próprio Moti.on. O inventário estruturado acompanhante contém esses números e as fontes.

Não foram decompilados executáveis, decodificados formatos proprietários nem copiados presets, expressões, bibliotecas JavaScript, imagens, fontes ou previews da Mister Horse para o produto. Arquivos de perfil, dados de autenticação, conteúdo de logs e crash reports não foram usados. Os nomes do catálogo de referência já existente continuam sendo apenas rótulos de pesquisa.

As conclusões distinguem quatro conjuntos: **plugin instalado**, **arquivos de conteúdo encontrados**, **catálogo comercial público** e **conteúdo efetivamente implementado no Moti.on**. Esses conjuntos não são intercambiáveis. Encontrar um arquivo não comprova que sua licença esteja ativa, que apareça na interface ou que tenha aplicação funcional.

## Instalação confirmada

| Evidência local | Resultado |
|---|---|
| Manifesto CEP | `~/Library/Application Support/Adobe/CEP/extensions/com.misterhorse.AnimationComposer/CSXS/manifest.xml` |
| Versão do bundle CEP | 4.2.6 |
| Identificador do bundle | `com.misterhorse.animationcomposer` |
| Host declarado no manifesto | AEFT 22.0 |
| Runtime declarado | CSXS 11.0 |
| Bundle nativo | `~/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/MisterHorse/AnimationComposer4/AnimationComposer4.plugin` |
| Versões curta e interna do bundle nativo | 4.2.6 / 4.2.6 |
| Identificador do bundle nativo | `com.misterhorse.AnimationComposer4` |
| macOS mínimo declarado no bundle | 11.5 |
| Dados de execução encontrados | `~/Library/Application Support/MisterHorse/AnimationComposer4` |

O manifesto declara onze entradas. Nove são painéis funcionais: navegador principal, navegadores adicionais 2/3/4, editor separado, Keyframe Wingman, Keyframe Actions, Anchor Point Mover e Transition Shifter. As duas restantes são janela de boas-vindas e entrada de testes. Isso comprova a estrutura instalada; não comprova que cada painel tenha sido aberto nesta auditoria.

A compatibilidade publicada atualmente é After Effects 2025 ou posterior. O changelog identifica 4.2.6 como lançamento de 11/08/2026, com melhorias de preview e correção do seletor de fontes. Portanto, a declaração AEFT 22.0 no manifesto não deve ser usada como promessa de suporte comercial ao AE 2022. [Changelog oficial](https://misterhorse.com/changelog/animation-composer-plugin/1), [produto para After Effects](https://misterhorse.com/animation-composer-for-after-effects).

## Conteúdo local: contagem de arquivos, sem inferir nomes

A árvore com conteúdo está em `~/Library/Application Support/MisterHorse/ProductManager/Products`, fora das duas pastas inicialmente indicadas.

| Pasta de produto | `.mhcitem` em `Items` | Previews `.webm` em `Items` | `.mhcitem` em `SupportItems` | Metadados |
|---|---:|---:|---:|---|
| `1` | 0 | 0 | 0 | `Product.mhprodmeta` e ícone |
| `3283` | 341 | 341 | 0 | `Product.mhprodmeta` e ícone |
| `3300` | 471 | 471 | 168 | `Product.mhprodmeta` e ícone |

Também existe `/Library/Application Support/MisterHorse/ProductManager/Products/3`, contendo metadados e ícone, sem catálogo de itens nessa pasta.

Os arquivos `Product.mhprodmeta` examinados são binários, não JSON/XML legível. O nome e o host dos produtos 3283/3300 **não foram resolvidos com evidência suficiente**. Nomes amostrados em 3283 contêm `-pc`, mas esse sufixo sozinho não fundamenta atribuir todo o produto ao Premiere. Não tratar os 812 arquivos de `Items`, nem os 168 auxiliares, como “todos os presets do After Effects”. Cada item pode representar um asset, uma composição ou uma variante; arquivos auxiliares não equivalem a itens navegáveis.

Não foi encontrado um catálogo textual legível com nome, categoria, variante e parâmetros de todos os itens instalados nessas árvores. A próxima evidência adequada é percorrer/exportar o catálogo pela interface suportada do plugin, anotando os nomes exibidos. A contagem completa por nome permanece **NOT RUN**, e não foi substituída por decodificação do formato proprietário.

## Catálogo oficial público

Estes números foram lidos das páginas de produto; não são contagens da instalação deste computador.

| Família | Categorias publicadas | Total publicado no navegador |
|---|---|---:|
| Motion Presets | Effects 82; 2D Transitions 792; 3D Transitions 1018 | 1892 |
| Text Presets | Effects 143; Transitions — Lines 253; Words 392; Characters 626 | 1414 |
| Transitions for After Effects | Light Leaks 20; Creative 13; Glitch 54; Camera Pan 48; Camera Zoom 27; Shapes 101; Camera Pan & Rotate 42; Split 18; Blurs & Fades 11; Matte Transitions 54; Camera Zoom & Rotate 17; Camera Zoom & Twirl 20; Camera Rotate 19; Camera Roll 14; Camera Shake 10 | 468 |

Fontes: [Motion Presets](https://misterhorse.com/products/the-most-handy-motion-presets/43), [Text Presets](https://misterhorse.com/products/text-presets/42), [Transitions for After Effects](https://misterhorse.com/products/transitions-for-after-effects/3266).

A página de Transitions também usa o texto promocional “600+ presets”, enquanto lista 468 itens no navegador e nas categorias somadas. Essa divergência não foi resolvida: registrar os dois critérios é mais correto que inventar um total único. As páginas de Motion e Text têm nomes repetidos em diferentes entradas/variantes; a quantidade de entradas não deve ser apresentada como quantidade de receitas matemáticas únicas.

O catálogo de produtos inclui ainda títulos, componentes gráficos, fontes animadas, sons e bibliotecas de mídia: Scale Titles, Social Media, Essential Typography, Timers & Counters, Cinematic Titles, 3D Titles, Overlays, Hand Drawn Stuff, Shape Elements, Backgrounds 2, Textures, Animated Illustrations e Essential Sound Effects. A existência pública desses packs não comprova instalação ou direito de distribuição dentro do Moti.on. [Produtos para After Effects](https://misterhorse.com/products-for-after-effects).

## Funcionalidades comprovadas e comportamento público

| Área | Comportamento estabelecido | Evidência e limite |
|---|---|---|
| Navegação | Categorias, grade de previews, variantes; pastas com cor e foco; navegador e editor separados | Manifesto local, changelog e referência em vídeo de 14/09. Persistência de todos os estados: não testada agora. |
| Aplicação de animação | Transições animam entrada/saída; efeitos podem atuar durante a duração da camada; controles por preset; personalização sobre keyframes existentes | Páginas Motion/Text. Não foram medidas curvas ou fórmulas internas. |
| Entrada/saída e direção | In, Out, Both; direções Bottom/Left/Right/Top e visualização conjunta das variantes | Vídeo do usuário já catalogado em `docs/implementation/2026-09-14-animation-composer/`. Nem todos os itens oferecem todas as direções. |
| Edição | Controles organizados, fontes pelo editor, edição de presets selecionados e ações Copy/Paste/Remove/Reveal | Changelog oficial. O conjunto exato de controles varia por item. |
| Transições entre camadas | Inserção no corte, substituição por outra transição e ajuste de velocidade pelos limites da camada | Página Transitions. São uma família distinta de animar uma camada entrando/saindo. |
| Texto | Transições por caracteres, palavras e linhas; efeitos contínuos; famílias Mask & Position, Position 3D, Typewriter, Fade & Tracking e ordem reversa | Página Text Presets e [changelog do pack](https://misterhorse.com/changelog/text-presets/42). Não confirma igualdade visual das receitas Moti.on. |
| Keyframe Wingman | Ajustar easing de keyframe único ou múltiplos e utilizar presets | [Página oficial](https://misterhorse.com/keyframe-wingman). Curvas exatas e tratamento de todos os tipos de propriedade não medidos. |
| Keyframe Actions | Copiar/colar easing ou valores, espelhar, inverter, alinhar primeiro/último, clonar, deslocar, randomizar e selecionar por ordem | [Página oficial](https://misterhorse.com/keyframe-actions). A semântica de cada caso extremo precisa de fixture própria. |
| Anchor Point Mover | Reposicionar âncora preservando animação, inclusive com keyframes em Position/Anchor | [Página oficial](https://misterhorse.com/anchor-point-mover). Cobertura 3D/parenting de cada modo não demonstrada aqui. |
| Transition Shifter | Deslocar In/Out e marcadores por arraste, setas ou números; escalonar transições/camadas em ordem crescente, decrescente ou aleatória; alinhar limites/marcadores | [Página oficial](https://misterhorse.com/transition-shifter). Não é equivalente a apenas atrasar `startTime`. |
| User Library | Navegar composições de projetos AE, MOGRTs, footage e áudio; preview de vídeo com scrub; ajuste de pitch para áudio; limite gratuito de 500 itens | [Página oficial da User Library](https://misterhorse.com/products/animation-composer-unlimited-user-library/3298). Não foi testada a biblioteca pessoal deste usuário. |
| Compartilhar projeto | O suporte informa que o resultado usa camadas/efeitos nativos e dispensa o plugin após a criação | [Artigo oficial de 18/06/2020](https://help.misterhorse.com/hc/en-us/articles/360010106497-When-I-share-a-project-does-my-colleague-need-Animation-Composer-too). É orientação histórica; não prova automaticamente todas as dependências de cada pack atual. |

## Moti.on: baseline observado, antes da integração desta rodada

O catálogo compilado `packages/contracts/dist/motion-library.js` carregado durante a auditoria contém **165 receitas**: 25 motion 2D, 19 motion 3D, 54 efeitos de motion, 25 caracteres, 19 palavras, 13 linhas e 10 efeitos de texto. As coleções são original 56, studio 51, gemini 24, premium 30 e native 4. O código da galeria adiciona seis curvas e onze movimentos de câmera, resultando em **182 entradas**, usando aquele snapshot compilado.

A contagem não substitui teste no host. Os arquivos do workspace estão sendo alterados em paralelo pela implementação da tarefa; esses números identificam o baseline inspecionado, não uma promessa de estado final instalado. Recontar após o build final. Documentos anteriores que falam em 73 ou 88 itens registram etapas históricas, não a contagem atual.

As 56 referências do vídeo de 14/09/2026 cobrem 9 transições 2D, 7 transições 3D, 20 efeitos de motion, 15 transições de texto e 5 efeitos de texto. Os nomes e tempos já estão em `docs/implementation/2026-09-14-animation-composer/catalogo-referencia.json`. Esse vídeo não mostra todo o catálogo; o relatório original já explicita essa limitação. A implementação de setembro usou receitas próprias e não demonstrou equivalência exata com os parâmetros comerciais.

## Matriz de correspondência e lacunas

“Presente” abaixo significa encontrado no código próprio ou em evidência histórica indicada, não um novo PASS de host.

| Recurso | Baseline Moti.on | Diferença ainda relevante |
|---|---|---|
| Navegar/pesquisar/favoritos/recentes/preview | Presente em `client/src/preset-gallery.ts` | Preview ilustrado próprio; não medido contra todos os renders AE. Foco/cor de pastas e navegadores simultâneos não comprovados. |
| In/Out/Both, direção, duração, intensidade | Presente nos contratos e galeria | Transições de entrada/saída ainda usam uma receita por camada; não comprova presets independentes em cada fase. |
| Texto em caracteres/palavras/linhas, ordem e variação | Presente no catálogo/engine e controles | Cobertura parcial das milhares de entradas públicas; sem equivalência exata. |
| Editar preset aplicado | Presente em `preset-workspace.ts`, `ae.presets.inspect/adjust` | Contrato baseline só aceita uma camada gerenciada; estado `multiple` não é edição múltipla. Sem font picker genérico do Composer. |
| Trocar/copiar/colar/revelar preset | Remover/aplicar existem; novas alterações paralelas não avaliadas | Baseline não tinha equivalência completa com Preset Actions. Revalidar ao integrar a tarefa atual. |
| Remover e bake | Presente em `preset-library.jsx` | Bake não cobre texto e possui limites documentados; modificar grupos gerenciados pode impedir remoção segura. |
| Transição sobre corte | `ae.presets.camera-transition` usa precomp/camada e marcador CUT | Não representa todo o pack de 468 entradas públicas, nem comprova substituição um a um. |
| Easing | `ae.keys.ease.apply`, editor e presets | Não foi provada equivalência do fluxo de keyframe único/múltiplo de Wingman. |
| Espelhar/inverter/clonar keys | `ae.keys.reverse`, `reverse-values`, `clone` | Reverse Values e Mirror são operações diferentes; não confundir nomes. |
| Copiar/colar keys | Snapshot completo presente em `keys-copy.jsx` | Baseline não comprova copiar somente easing ou somente valores como modos independentes. |
| Escalonar | `ae.keys.delay`: camadas ou grupos de keys, seleção/timeline/nome/distância/random | Não equivale a deslocar marcadores e transições In/Out separadamente. |
| Alinhar keys | `ae.keys.send-to-edge` | Não comprova alinhar primeiros/últimos keys entre propriedades; seleção por ordem não encontrada no baseline. |
| Âncora | `ae.anchor.align` e preview, grade de nove pontos e compensação | Equivalência funcional por casos precisa de comparação real; modos recusados no próprio código não podem ser anunciados. |
| Biblioteca pessoal | `personal-preset-library.jsx`: pastas `.ffx`, seleção nativa, lista e aplicar | Não navega `.aep`, MOGRT, vídeo ou áudio; não tem geração de previews/scrub/pitch nessa biblioteca. Limites próprios: 20 raízes, 1000 itens por scan, profundidade 8, 1500 ms. |
| Packs de mídia/títulos/sons/fontes | Há outras ferramentas próprias no Moti.on, fora deste catálogo | Não foi demonstrado um catálogo correspondente a cada pack público. Não confundir uma ferramenta geradora com toda uma biblioteca de assets. |
| Portabilidade do projeto | Presets próprios majoritariamente nativos; há coleção `native` e engine C++ própria | Itens que dependem de efeito Moti.on nativo exigem verificar a dependência no destinatário. Não prometer genericamente que o plugin nunca é necessário. |

Fontes do baseline: `packages/contracts/src/motion-library.ts`, `packages/contracts/src/preset-workspace.ts`, `packages/command-registry/src/descriptors.ts`, `apps/after-effects-cep/client/src/preset-gallery.ts`, `apps/after-effects-cep/client/src/preset-workspace.ts`, `apps/after-effects-cep/host/src/commands/{preset-library,preset-camera-transition,personal-preset-library,keys-copy,keys-delay,keys-clone,keys-reverse,keys-reverse-values,keys-send-to-edge,anchor-align}.jsx`.

## Continuação implementada em 26/09/2026

A matriz anterior é o baseline da auditoria. A integração posterior mantém as 165 receitas próprias e amplia os seguintes fluxos; o estado da validação é registrado por etapa na [entrega](../implementation/2026-09-25-composer-parity/entrega.md).

| Capacidade | Implementação Moti.on da continuação | Evidência e limite |
|---|---|---|
| Navegar/Editar e cópia | Abas explícitas, fases Entrada/Saída/Ambos, reset local, cópia de receita inspecionada e colagem na seleção | Check da primeira fatia PASS; interação final em CEP permanece pendente |
| Variações com nome | Receita e opções podem ser salvas, carregadas/aplicadas, renomeadas, duplicadas, atualizadas, excluídas/restauradas e transferidas por backup JSON aditivo | Limites de 100 itens, 80 caracteres por nome e validação estrita. Salvar/atualizar inspeciona novamente os alvos. Gerenciamento ampliado/backup e Mostrar na biblioteca foram adicionados depois da pausa de testes, NOT RUN; sem código arbitrário ou assets comerciais |
| Cues de entrada/saída | Fim da entrada e início da saída em markers próprios, arraste, duração, preflight de colisão e rollback | 6 cenários reais e Undo da aplicação PASS no AE 26.5x89 |
| Deslocar, alinhar e escalonar | `ae.presets.timing` move cues próprios em 1 a 50 camadas; alinhar usa CTI, escalonar segue a timeline nos dois sentidos ou uma ordem aleatória com semente | 4 cenários reais PASS no snapshot anterior à ordem aleatória; esta adição, Undo específico e nova instalação pendentes |
| Edição conjunta | Até 50 camadas com mesma receita, mesmas opções e controles estáticos; lista de alvos/fingerprints revalidada | Implementada depois da pausa de testes, NOT RUN; lotes heterogêneos e câmera em lote recusados |
| Ajuste numérico e fluxo após aplicação | Arraste e teclado em campos numéricos, reset individual, percentuais decimais; aplicação bem-sucedida abre Editar com inspeção nova | Código integrado depois da pausa de testes, NOT RUN |
| Mídia e projetos da biblioteca pessoal | Imagens/áudio/vídeo entram na composição; `.aep` importa no projeto atual; `.ffx` mantém aplicação nativa | 6 cenários PNG/WAV/AEP e 2 regressões PNG-sequence/FFX PASS; sem MOGRT, exploração interna de `.aep`, scrub ou pitch |

A validação adicional foi adiada por orientação do usuário para continuar a implementação. Evidências já executadas permanecem válidas para seus snapshots; não aprovam alterações posteriores.

A escolha das três operações de organização deriva do comportamento público de mover, alinhar e escalonar transições descrito na [página oficial do Transition Shifter](https://misterhorse.com/transition-shifter), consultada novamente em 26/09/2026. O Moti.on implementa a semântica explícita de seus próprios marcadores: deslocamento relativo em frames, alinhamento ao cursor e escalonamento a partir do cursor, de cima para baixo, de baixo para cima ou em uma ordem aleatória própria com semente. Esta última foi implementada depois das fixtures reais e ainda não foi validada. Não reproduz toda a ferramenta: ficam fora mover limites/camadas completas e manipulação de marcadores de outros plugins. Consulte o [contrato e as restrições dos marcadores](preset-editable-timing-markers.md).

Permanece uma receita gerenciada por camada. A edição conjunta implementada aceita até 50 camadas com a mesma receita e os mesmos valores, ainda sem validação final; não mistura receitas ou valores diferentes. Entrada e saída podem ter tempos independentes, mas **não possuem receitas independentes**. Isso exige uma mudança própria de contrato e composição de propriedades; retirar apenas a rejeição de conflito sobrescreveria expressões/controles da receita existente. A evolução deverá representar cada fase e seu ownership separadamente, preservar o estado original e tratar migração, remoção, cópia, variantes e rollback de modo conjunto. Nenhuma migração desse tipo foi entregue nesta rodada.

## Decisão para implementação e verificação necessária

Implementation decision: implementar comportamentos independentes nos contratos e engine existentes do Moti.on. A estrutura própria do produto já suporta biblioteca, edição e comandos host; não criar um segundo sistema paralelo nem distribuir conteúdo da instalação comercial. Critério de cobertura é uma matriz por capacidade e caso de uso, não renomear presets ou aumentar artificialmente a contagem de variantes.

Fallback: quando uma capacidade não estiver implementada ou comprovada, a interface deve informar o escopo suportado. A biblioteca pessoal anuncia apenas as ações implementadas por formato; o catálogo de extensões não comprova todos os codecs/importadores disponíveis. Efeitos que exigem Moti.on Motion Core devem declarar essa dependência.

Capability flags: usar requisitos existentes por comando e sondagem de efeitos nativos; não introduzir um sinalizador global “paridade Animation Composer”. Um único booleano ocultaria lacunas de catálogo, workflow e render.

Tests needed:

1. Para cada recurso novo, aplicar/ajustar/remover/desfazer em AE real, preservar seleção, tempo, keyframes e expressões alheias.
2. Separar fixtures para presets de camada, transição entre clips, texto e ações de keyframes.
3. Verificar cópia de easing versus valores, primeiro/último key, colisão de tempos, 2D/3D, propriedades espaciais e temporais.
4. Verificar mudança de seleção no editor e edição múltipla, reaplicação, troca de preset, remoção de uma fase e Undo.
5. Para marcador/timing, testar In e Out separados, camadas curtas, limites, duração e ordenação da timeline nos dois sentidos. A ordem aleatória com semente foi adicionada posteriormente e requer fixture própria para comprovar repetibilidade e preservação de estado.
6. Para equivalência visual, comparar fixtures próprias com comportamentos observados na UI, em diferentes frames e framerates. Isso ainda não foi executado para todo o catálogo.
7. Para User Library ampliada, testar cache, arquivo ausente, importação, mudança de pasta, dependências e preview de cada formato realmente implementado.

Open uncertainty: identidade legível dos produtos locais 3283/3300; inventário completo de nomes instalados; total de variantes realmente disponíveis na conta; parâmetros de cada item; categorias atuais da interface instalada; edição independente de múltiplos presets por camada; dependências particulares dos packs atuais; equivalência visual e temporal individual.

## Verificações desta auditoria

| Verificação | Resultado |
|---|---|
| Ler manifesto CEP e versão nativa | PASS |
| Contar arquivos de conteúdo em ProductManager/Products | PASS |
| Consultar páginas oficiais e changelog | PASS |
| Recontar catálogo compilado Moti.on e revisar caminhos principais | PASS — snapshot compilado, sem novo build |
| Decodificar formatos proprietários/decompilar/copiar assets | NOT RUN — fora do método |
| Abrir todos os painéis e itens da instalação | NOT RUN |
| Aplicar e medir todos os presets | NOT RUN |
| Igualdade funcional/visual total entre produtos | NOT RUN |
| Testes de produto nesta sub-tarefa documental | NOT RUN — nenhum código de produto alterado por esta auditoria |

## Implementação posterior: edição parcial, curvas e prévia local

A continuação própria amplia a edição da mesma receita em até 50 camadas com valores misturados, preservando opções não alteradas; acrescenta override de suavização e duração explícita de uma fase pelos cues. A User Library própria ganha preview de imagens compatíveis e player local de áudio/vídeo com seek, loop e velocidade/tom apenas na prévia. Isso não comprova reprodução idêntica ao Composer, todos os codecs, processamento do áudio importado ou preview de composições AEP. Estas mudanças foram compiladas/instaladas com backup, mas permanecem sem validação funcional conforme orientação do usuário. [Estado da implementação](../../artifacts/composer-parity-2026-09-25/implementation-current.json).
