# Ferramentas BRAZU e Animation Composer — estudo dos artefatos instalados

Data: 23/10/2026, America/Bahia. Objetivo: estabelecer requisitos de comportamento para implementações originais do Moti.on. Código, FFX, desenhos, presets e identidade dos fornecedores não são incorporados ao produto.

## Autoridade e limites

REA e leituras estáticas trataram os artefatos como texto/bytes inertes. **Nenhum script comercial foi executado e nenhum projeto Adobe foi modificado por este estudo.** Sintaxe, controle e fórmulas observadas não equivalem a execução, render, compatibilidade ou paridade comercial comprovada.

| Artefato | Identidade/evidência | Cobertura |
|---|---|---|
| BRAZU instalado | `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Brazu`; `jsx/index.js` SHA-256 `d965db1e22ec52221a106b350d7c2f093714d490506c5593ca0ea6f0495851a5` | Espécime instalado, com aparentes adaptações locais em shapes/exportação; não certifica distribuição original intacta |
| BRAZU, pacote | REA `ev_c3b83120ee855dd29d30c3966b71595fcda41b036c7bc3fd6be543f5b334d7fe` | Parcial: heap no bundle principal; não alegar cobertura completa |
| BRAZU, JSX | REA `ev_e45d52dcfc37034795d689b43816c577db88cc9d0ce1d96b4fb210fba0fd83aa` | 1 arquivo parseado, 20.593 nós AST; inventário completo desse diretório, semântica unknown, 4.745 incógnitas |
| Animation Composer | `C:\Program Files\Common Files\Adobe\CEP\extensions\com.misterhorse.AnimationComposer`; manifest 4.2.6 | AEFT 22.0 / CSXS 11.0 declarados no manifest; versão executada não aferida |
| Composer, JSX | REA `ev_d4a01113741f02d7adf05c0e07bc9f86efce68ffa0c43fbb9cbdae86cc9a791b`; summary `ev_3ee7faf3256f9298c984d999d7c4c2c1a22ff2302a0eff9371a84d93e5cef083` | 6 JSX, 119.636 bytes, zero falhas de parse; inventário completo do diretório, semântica unknown, 3.680 incógnitas |
| Composer, página de módulos | REA `ev_1fb748b69d04a5b298731bb8a0cf9df4c54ed62135656939a81f3e6aeff94c95` | Página 12/18 identidades; diversas funções/roles por arquivo, sem concluir ausência em módulos não examinados |

REA Evidence é retido por conexão. Uma referência ausente foi recuperada analisando somente o diretório JSX de seis arquivos; a identidade do parent permaneceu igual. Nenhum bundle completo foi reanalisado para contornar tamanho de saída.

## BRAZU: mapa das 82 exportações

Tabela `aeft` em `jsx/index.js`, linhas 3623–3704 do espécime. As linhas deste documento seguem quebras LF; CR internos podem mudar a contagem exibida em outro editor.

| Família | Qtde | Exportações |
|---|---:|---|
| Camadas | 10 | `parentLayers`, `flipVertical`, `flipHorizontal`, `flipBoth`, `renameLayers`, `pinToNullSelected`, `cutInKeyframesTime`, `reverseLayers`, `offsetSelected`, `anchorPointChange` |
| Conversão | 4 | `textToMask`, `textToShape`, `vectorToShape`, `vectorToComp` |
| Procedurais | 11 | `lookAt`, `shapeExploder`, `delayProps`, `orbit`, `kinetic`, `fastEdit`, `jump`, `clearBrazuExpFx`, `trimPaths`, `effector`, `smooth` |
| Formas | 6 | `createRectangle`, `createCircle`, `createTriangle`, `createHexagon`, `createStar`, `createRightTriangle` |
| Wrappers históricos | 19 | `butFlickerZXP`, `butGlitchZXP`, `butWiggleZXP`, `butTimeZXP`, `butInertialZXP`, `butLoopZXP`, `butEchoZXP`, `butNeonZXP`, `butCylinderZXP`, `butBeatZXP`, `butTextBoxZXP`, `butParticlesZXP`, `butWavesZXP`, `butTextureZXP`, `butTileZXP`, `butCubeZXP`, `butMarkerZXP`, `butCopyKeysZXP`, `butCreateNullZXP` |
| Biblioteca | 5 | `importSelectedTransition`, `importTransition`, `applyAnimationPreset`, `applyTextPreset`, `cleanTextPreset` |
| Copilot/frame | 3 | `removeImageZXP`, `exportFrameZXP`, `applyCopilotZXP` |
| Transição de câmera | 1 | `applyCameraThreeD` |
| Keys/easing | 7 | `easeBoth`, `applyInvertKeys`, `applyCopyKeys`, `applyCopyInvertKeys`, `applySendBack`, `applySendFront`, `applyCopyInvertSendKeys` |
| Infraestrutura | 7 | `alertFromAE`, `modalData`, `getBrazuFolderPath`, `readJSON`, `fileExists`, `loginFileExists`, `createJSON` |
| Câmera/Parallax | 9 | `butCameraZXP`, `applyProParallax`, `applyWiggleCamera`, `applyAutoFocus`, `applyCreateNull3D`, `applyFocusZoom`, `applyAutoZoom`, `applyEvalConfig`, `applyBakePosScal` |
| Total | **82** | 73 fora da família Parallax; 9 na família Parallax/câmera |

### Semântica de seleção e operação

| Função/família | Comportamento observado no código | Dependências/preservação |
|---|---|---|
| Effector, linha 397 | Shape guia controla transform pela distância, incluindo repelir/orientar | FFX; substitui expressões de posição/escala/rotação das selecionadas |
| Kinetic, 449 | Velocidade de posição da primeira selecionada dirige propriedades selecionadas | FFX por tipo; referências por nome; substitui expressões |
| Orbit, 518 | Primeira selecionada é centro, demais recebem rig | FFX + referência por índice |
| Jump, 534 | Bounce por velocidade antes da key, elasticidade/gravidade/quantidade | FFX por propriedade + expressão; não confundir com criação simples de arco |
| Delay, 607 | Primeira selecionada fornece propriedades; cadeia referencia a camada anterior | Default 5 frames; pode separar Position; substitui expressões |
| Shape Exploder, 663 | Duplica grupos; original vira disabled/guide/locked | Comando 10312; risco de alterações parciais |
| Look At, 695 | Nulo alvo e expressão de rotação 2D | FFX; referências por nome |
| Cut, 710 | Recorta in/out das selecionadas pelo mínimo/máximo das keys escolhidas | Não é exclusão de keys |
| Conversão, 745/764 | Isola cada layer e executa menu fixo | IDs 3973/3799/3781/2933; capacidade/versão precisam validação própria |
| Puppet pins, 783/818 | Cria nulos com keys dos pins e substitui expressão dos pins | Remove keys originais; captura não demonstra metadados completos |
| Parent, 892 | Encadeia selecionadas, ordem reversa por padrão | Não demonstra prevenção completa de ciclos/rollback |
| Smooth, 913 | Amostragem `smooth(width,samples)` com transição nas pontas | FFX + expressão; separado de easing temporal |
| Âncora, 1191 | Usa sourceRect e escala, compensa Position ao mover âncora | Não demonstra matriz completa de rotação/parent/3D; ramo animado usa XY |
| Offset, 1241 | Soma startTime por frames, modos normal/reverse/random/convex/concave | Não é deslocamento isolado de keys |
| Formas, 1013–1095 | Grupos nativos editáveis; triângulo retângulo em path livre | Nomes livres, centroide; aparentes alterações locais no espécime |
| Fast Edit, 1114 | Comps selecionadas no projeto prevalecem sobre comp ativa | Resolução/FPS/duração; helper não abre Undo |
| Wrappers, 2343–2458 | Alt mostra explicação; clique aplica rig/expressão/FFX | A maioria depende de assets FFX; não constitui engine independente |
| Text Box, 1623 | Caixa segue texto com shape, marcadores e preset | Altera Position/texto e usa nomes/índices convencionais |
| Glitch, 1401 | Preset no alvo + mapa em solid/precomp disabled | Nomes/índices de efeitos; nenhum rollback completo demonstrado |
| Beat, 1467 | Converte áudio para keys e aplica resposta bump/shake | Menu multilíngue; remove camada de amplitude por nome; FFX |
| Marker Loop, 1419 | Expressão valueAtTime relativa ao marcador | Só aplica onde expressão está vazia; exige marcadores posteriores |
| Cylinder/Cube/Tile, 1456/1655/1675 | Constroem texto/faces/precomps/controladores | FFX e efeitos AE; referências por nome/índice |
| Animações/textos, 2648–2835 | Presets com marcadores In/Out, famílias Basic/Bounce por unidade | FFX; remoção por padrões de nomes; sem política geral de ownership |
| Transições, 2545 | Importa AEP, ajusta resolução e marcador/corte | Conversão temporal usa 24 FPS fixos |
| Copilot, 1885–2137 | Escolhe animação por tamanho e stagger por proximidade do centro | Todas as camadas desbloqueadas; startTime redefinido em vez de preservar offset |
| Transição de câmera, 2836 | Três keys de Z e easing por duração | Exige controle Camera PRO pré-existente |

### Partículas: camada múltipla confirmada por RIFX

`applyParticleZXP`, linha 1593: cria mapa NM desabilitado, quatro solids P1–P4 e nulo controlador; precompõe os seis. Ativa motion blur na composição e nas quatro camadas.

Inspeção local por parser big-endian dos chunks `RIFX/LIST`, sem chamar AE ou avaliar expressões. Em cada arquivo, o parser respeitou o comprimento raiz declarado; **3.607 bytes finais permaneceram fora dessa interpretação**. Nenhum valor não decodificado foi tratado como default conhecido.

| Arquivo | Efeito/controlador observado | Recibo estático |
|---|---|---|
| `controlBP.ffx` | Pseudo/Particle | 267 folhas, zero erros de limite; SHA `24336165b3eaef53fc096b12d6d950726932af9729f6f47baf3d6f4cf1cd7999` |
| `mapBP.ffx` | Fractal Noise + Colorama + Gaussian Blur | 647 folhas; SHA `2269f1fd0b0a46036fca56c98ea2494bd8fc72a49fb732cffa97394ee68733f4` |
| `part1BP.ffx` | Particle Playground (`ADBE Playgnd`) + Fast Box Blur (`ADBE Box Blur2`) | 1.148 folhas; SHA `009cfb934a37c22a76b8cf0cf7bc2051523bb765f798119ce46cb3d61a2068b5` |
| `part2BP.ffx` | Mesmos engines nativos | SHA `309e6d09cabf99aa17c4acf1d0aa5aec28806b2ec06b31f0460a42d8d56ff0d0` |
| `part3BP.ffx` | Mesmos engines nativos | SHA `12d71330901df68d584a6fdaca554cc119a870f95e83df2b1d3cf5bdca1f4f34` |
| `part4BP.ffx` | Mesmos engines nativos | SHA `dfa66e01d2ff41e95ab87af4695796345474f77eefcbdb7d8b56e5009b3b8dc2` |

O controle expõe Universal Amount/Size e quatro grupos simultâneos: **Particle Fast, Up, Mid, Back**, cada um com Amount/Size/Opacity/Color, mais Evolution. Offsets de chunks `pard`: globals 744/948; grupos 1152/2376/3600/4824; Evolution 6048. Há quatro fluxos juntos, não um dropdown exclusivo de quatro engines.

Aplicação original no Moti.on: manter CC Particle World existente e acrescentar engine/modos próprios de Particle Playground com capacidade detectada. Não redistribuir os FFX do fornecedor. Visual, valores iniciais e equivalência de render dos fluxos: **NOT RUN/unknown**.

### Falhas do espécime que viram cenários negativos

- `callFunctionAlt:1308` ignora retorno false do gate de seleção e segue para mutação.
- `countFx:226` chama `_readOnlyError` quando encontra instância existente; reaplicação precisa prova.
- `lookAtExp:695` itera até `<= selected.length`.
- `renameLayers:837` termina usando identificadores inexistentes `layerToRename`/`iterator`; reverseLayers:971 consulta índice de string de nome.
- Smooth:913 avisa sobre menos de duas keys, mas só processa mais de duas. Exatamente duas pode não fazer nada. Template:374 referencia controle `(Position)` apesar do nome específico da propriedade.
- `applyExpressionZXP:1341` escreve expressão antes de concluir FFX; falha posterior pode deixar projeto parcial.
- Retornos/erros em operações com Undo não têm `finally` sistemático; Undo aberto não equivale a rollback.
- `specKeys:3561` captura tempo/valor/ease/interpolação sem todo estado espacial; colisões e restauração precisam implementação própria.
- `applySendFront:3463` move ao inPoint, mas reseleciona usando fórmula de outPoint.

### Parallax/câmera: decodificação estática do integrador

Position/Scale/Auto Focus foram decodificados por AST e aritmética constante, sem executar código comercial. Rotações limitadas 10/8/4 bateram os checksums 446782, 890171 e 486726; SHA do espécime permaneceu inalterado. Os trechos correspondem aproximadamente a linhas LF 2990/2999/3000; sete CR internos explicam diferenças para localização AST. A descrição abaixo é matemática, sem transcrever expressão proprietária.

- Distribuição: primeira selecionada é deslocada em Z pelo offset total; última termina em Z=0. A ordem da seleção define profundidade.
- Posição: Z fica entre zero e menos a distância/zoom do controlador. X/Y interpolam entre o centro da composição, no plano zero, e as coordenadas-base do objeto, no plano traseiro. Assim a distribuição exige compensação conjunta de posição e escala para conservar enquadramento.
- Escala: fator proporcional a `1 + posiçãoZ / distânciaControlador`, multiplicado pela escala-base. O mesmo parâmetro controla a profundidade normalizada; não se trata apenas de converter a camada para 3D.
- Auto Focus: referencia o controlador pai da câmera, compõe plano-base com posição Z/foco/zoom e procura a camada mais próxima desse plano entre as que estão abaixo da câmera na pilha. Ajusta distância de foco com interpolação pela faixa; desativado ou com faixa zero mantém o foco configurado.

Esse comportamento específico não implica que nomes/índices e limites do espécime devam ser reproduzidos. A implementação original do Moti.on precisa preservar posição aparente, ordem, parent/3D, expressão/keys, câmera ativa e reaplicação com testes próprios. Decodificação estática não comprova resultado visual ou runtime.

O integrador forneceu ainda `artifacts/tools-audit/particle-capabilities.json`: **PASS de capacidade nativa** no AE 26.5x89. Isso confirma disponibilidade/IDs sondados; não promove a ferramenta Partículas, seus quatro modos ou render a HOST PASS.

## Animation Composer: controles e fronteiras

### Keyframe Actions

`jsx/mh-kf-actions.jsx:779` despacha Copy, Paste Value, Paste Easing, Mirror, Clone, Reverse, Align First/Last, shifts crescente/decrescente/aleatório e Select by Order. `:821` encerra Undo em `finally`.

- Clone: primeira key global selecionada serve de origem, cópia começa no playhead (`:1131`). Mirror: referência no último tempo global, cópia invertida ao playhead (`:1099`).
- Reverse conserva tempos e inverte valores/easing, lados e sinal da velocidade (`:1176`). Não é sinônimo automático de inversão temporal do Moti.on.
- Align First/Last alinha cada propriedade ao playhead e restaura seleção (`:1213/:1230`).
- Paste Easing normaliza pela duração e variação de valores, adapta dimensões e reconstrói velocidades no destino (`:599–699/:937`).
- Paste Value preflight de tipo/quantidade; repete padrões de propriedades/keys ciclicamente (`:883`).
- Select by Order usa uma camada modelo e índices relativos a primeira/última key, explicando incompatibilidade (`:1265`).

### Wingman

`jsx/mh-wingman.jsx:314`: Single modifica lados escolhidos; Pairs considera pares adjacentes selecionados (`:352`). Preserva lado oposto; influência zero escolhe LINEAR, influência positiva usa BEZIER; canal de ease não equivale ao número de componentes do valor (`:406–498`). Roving recebe tratamento específico.

`client/dist/wingman.bundle.js`, offsets base zero em caracteres 1.254.000–1.260.250: modo depende da seleção; valores/trava, presets salvos/reordenáveis/removíveis e reset. Cliente serializa aplicações (`1.005.007`); JSX usa Undo com `finally` (`:344/:393`). Preservação completa do estado espacial não é demonstrada somente por esses helpers.

### Anchor Mover e Shifter

- Anchor Mover: grade 3×3 e escolha explícita entre inserir keyframe no playhead ou modificar existentes, default inserir. Bundle offsets 1.165.740–1.167.400. RPC `AnchorPointTool.align` leva alinhamento e política de keys.
- Shifter: shift de In/Out ou marcadores; align início/fim/marcadores ao playhead; stagger de layers/In/Out com ordem crescente, decrescente, aleatória ou de seleção. Bundle offsets 1.134.920–1.140.780. Há fila/merge de comandos e delimitação de Undo por interação.
- Seus JSX são inicializadores PlugPlug/Ready. Os algoritmos finais são externos via RPC `TransitionShifter.*`/`AnchorPointTool.align`: matriz espacial exata, colisões e regras internas continuam desconhecidas sem análise nativa ou observação controlada.

### Browse/Edit e preview

Manifest permite Browser/Edit separado, painéis auxiliares e Edit desacoplável. `browser.bundle.js`, offsets 1.398.070–1.401.510: estado real, árvore/valores, eventos de instância/keys/propriedades; 1.809.310–1.810.200: Dock/Undock/Auto Switch; 1.830.150–1.831.440: aplicar In, Out ou ambos.

O cliente Edit chama `Editor.getState/getPropertyValues/setPropertyValue/callPropertyAction`, reset, copy/paste/remove presets e delimitação de Undo. Isso prova contratos do cliente, não o algoritmo nativo inteiro.

Preview tem player com fallback, pausa durante aplicação, preferência de pausa quando inativo e cache limitado (`browser.bundle.js`, 1.857.410–1.858.940). A biblioteca distingue seleção simples e ação de aplicação, além de variantes/favoritos. Microanimação de ícone, arquivo de preview e render nativo devem permanecer categorias distintas de evidência.

Hashes: `mh-kf-actions.jsx` = `644c0f85de395abb9c85274118c0c5b66dd7c6dcf4c2d37b18baafb9dd9ed413`; `mh-wingman.jsx` = `6588fb8c512f68d5bab5ae8112ea7d6ebf9634de7f30ae392445b8702ba4fc40`; `browser.bundle.js` = `bbfbaa93609efedaa0a6af1377a366c96bc5e214df1c3690012c3e799a3802d1`.

## Critérios transportados ao Moti.on

1. Intenção consistente entre Quick, editor, preview e reaplicação; defaults de fábrica explícitos e restauráveis.
2. Copy/Paste valor e easing separados, normalização por duração/distância, metadados espaciais completos e colisões sem perda.
3. Rig próprio com ownership, leitura/ajuste/bake/remove e Undo coerente; sem remover pelo nome comercial.
4. Partículas novas preservam engine legado; controles globais e fluxos simultâneos têm contratos/capability gates próprios.
5. Âncora/3D usam coordenadas e compensação reais, incluindo parent, câmera, dimensão separada, expressão e keys.
6. Todo botão explica indisponibilidade e confirma operação observável; erro parcial exige rollback.
7. Testes Node, navegador, instalação e host real ficam separados. Estudo estático dos fornecedores permanece **runtime NOT RUN**.
