# Controles de interface — Animation Composer e BadFX

Data: 15/10/2026 (America/Bahia). Escopo: refinamento gradual do painel After Effects do Moti.on. Estado da pesquisa: **PARTIAL**; leitura visual dos recortes e inspeção estática concluídas para os controles abaixo; nova execução das interfaces de referência **NOT RUN**.

## Fontes e identidade

As dez imagens enviadas pelo usuário foram lidas na conversa. São recortes de estados visuais, não gravações de interação. A correção do usuário identifica **Animation Composer**, não Premiere Composer. Os recortes não mostram identificação de produto em todos os casos; a atribuição é corroborada onde possível pelos recursos instalados.

| Evidência | Conteúdo visível |
|---|---|
| Imagem 1, `codex-clipboard-3870da2c-d7bc-489e-b2c8-3f2b0d5405cd.png` | Menu Preset Actions aberto, grupos Copy/Remove/Paste e slider de tamanho. |
| Imagens 2–3, `a822b7e3…` / `99543a3f…` | Três ações azuis In, Out, Both sob Animate. |
| Imagem 4, `514e8ba3…` | Inspector de camada, seções In/Out, Reveal/Copy/Remove/Reset, valor de opacidade e deslocamento temporal. |
| Imagem 5, `168f92b2…` | Menu de Edit, opção marcada e ação de desacoplar painel. |
| Imagens 6 e 9, `dc645f64…` / `b19507ff…` | Árvore Text → Words/Lines/Letters, item ativo azul e categorias recolhidas. |
| Imagens 7–8, `42f80497…` / `c1e94b99…` | Valores azuis e Reset individual, linhas separadoras discretas. |
| Imagem 10, `6131807d…` | Amount X, valor 10, Reset e slider revelado com extremos 0–1000. |

Os arquivos originais das imagens estão em `C:/Users/raaee/AppData/Local/Temp/`; não são assets do produto e não foram copiados para o bundle.

Recursos instalados lidos diretamente, sem execução, alteração ou descriptografia:

| Recurso | SHA-256 medido nesta leitura |
|---|---|
| Animation Composer `client/dist/browser.bundle.js` | `bbfbaa93609efedaa0a6af1377a366c96bc5e214df1c3690012c3e799a3802d1` |
| Animation Composer `client/dist/browser.css` | `c011ec98376ecc63b7e9ca7cd76029478b3177c43f96cfa3893f300e207703a1` |
| BadFX `assets/main-3cbd389a.js` | `904cd8771cd29e543e37ba4bec4e0531567a0f26560a532230c4acb1ad67eebb` |
| BadFX `assets/main-3cbd389a.js.map` | `b56b6dca91605cd3935b007030705363fcb6712cf6425ab03bace50ee7edc591` |

Raízes: `C:/Program Files/Common Files/Adobe/CEP/extensions/com.misterhorse.AnimationComposer` e `C:/Program Files (x86)/Common Files/Adobe/CEP/extensions/com.badedits.cep`. O inventário anterior identifica Composer 4.2.6 e BadFX 1.0.4. O bundle Composer e bundle/source map BadFX continuam com os hashes do estudo salvo em `C:/dev/preset-study`; isso permite reaproveitar a evidência desses arquivos, sem alegar igualdade de toda a instalação.

REA foi usado para consultar os registros exportados por `inspect-evidence-bundle`, em modo summary e filtro `operation: analyze_javascript_application`. O registro da conexão anterior não estava retido na conexão desta leitura; não se repetiu análise integral de bundles.

| Registro REA reaproveitado | Identidade e limite |
|---|---|
| `ev_e8e2201c2ed1cdd8f12993c02a23dbc22fdcf46c877b6098819c2fb9a5d79b38` | Composer, `animation-composer/rea-evidence-bundle.json`: registro completo retido, autoridade shipped-artifact, confiança derived, 14 limitações. A análise anterior registra oito bundles limitados por heap e 3.792 incógnitas semânticas. |
| `ev_147efe4e07d7e298cd6b60969c4bb2fe013b4e86a5501aaf233c87d411687cc1` | BadFX, `badfx/rea-evidence-bundle.json`: registro completo retido, autoridade shipped-artifact, confiança derived, 19 limitações. A análise anterior registra 13 incógnitas do grafo da aplicação e 7.974 semânticas. |
| `ev_e0586d4e0130552496d6ac8aec3e9d6968021e6fe56534cc055a5f76dd1d1e53` | Identidade anterior do módulo de categorias BadFX, conservada em `badfx/rea-selected-module-evidence.json`. |
| `ev_e2f43b1e77f2a3948ab235c6d04025e2d22b7378afb9997e40f5eb0a931f68dd` | Identidade anterior do módulo de despacho de preset BadFX, no mesmo arquivo. |

Os achados específicos abaixo foram corroborados por leitura focal de CSS, trechos do bundle e `sourcesContent` do source map instalado. Não são novos registros REA nem prova de que cada ramo executa no host. Nenhum código, desenho de ícone, vídeo, preset ou asset proprietário foi incorporado ao Moti.on.

## Ledger por controle

| Controle | Evidência observada | Interpretação e decisão própria para Moti.on | Verificação restante |
|---|---|---|---|
| Ação principal azul | Imagens 2–3 mostram três botões azuis. CSS Composer define estados emphasized separados para default/hover/pressed e estados standard disabled. | Azul indica ação; superfícies principais permanecem neutras. Usar tokens AE próprios para fundo e texto, sem copiar a paleta ou as classes do fornecedor. | Contraste de cada combinação e estados reais no CEP. |
| Valores e ações em texto | Imagens 4, 7, 8 e 10. CSS Composer `.property-value-input` e `.text-slider-control__input` têm cor de link; hover muda a cor e acrescenta sublinhado; disabled usa token distinto. | Valor editável e reset local recebem destaque azul. Hover/foco não mudam dimensão ou posição. Destruição mantém semântica distinta. | Mouse, teclado, foco e desabilitado no painel Moti.on. |
| Aplicação In/Out/Both | Imagens 2–3 e pedido explícito do usuário. `browser.bundle.js`, offset UTF-16 aproximado 1831162: caminhos animateIn/animateOut/animateBoth constroem flags para `Editor.applyTransitionPreset`. Both inclui ambas numa chamada. | Ações de aplicação separadas do seletor de fase de edição/cópia. Selecionar card apenas seleciona; ativar Entrada/Saída/Ambos aplica. O Moti.on usa seu dispatcher, validação e Undo, sem chamar a API privada de Composer. | Uma execução por ativação, busy, contexto inválido, erro e Undo no AE. A atomicidade interna do fornecedor não foi provada. |
| Reset por parâmetro | Imagens 4, 7–8, 10. Bundle Composer, próximo ao offset 1511135: ação Reset depende de `resetSupported`, propriedade presente e estado não desabilitado. | Restaurar pertence ao parâmetro, não à tela inteira. Não confundir reset de rascunho com mutação confirmada. | Reset isolado, valores mistos, preservação dos demais controles e Undo. |
| Slider expansível | Imagem 10 mostra disclosure, nome/valor/reset e limites. CSS `.slider-property__limits` distribui extremos e `.slider-property__slider` ocupa largura disponível. | Revelar slider somente em valores com intervalo finito e significado apropriado. Manter digitação e scrubbing; usar o mesmo ciclo de gesto do editor. Semente/timecode não viram sliders indiscriminadamente. | Precisão, passo, limites, Escape/cancelamento, release fora do painel e live/fallback. O recorte não comprova semântica de gesto do fornecedor. |
| Hierarquia textual | Imagens 6/9. `Category.tsx` e `SubCategory.tsx` BadFX usam caminho recursivo, expansão separada e classe ativa. `animation-composer/catalog-categories.json` conserva Text Presets → Transitions - Characters/Words/Lines e famílias Fade, Position & Scale, Scale, Scale & Tracking, entre outras. | Organizar as receitas próprias por unidade e família real; filtros não mudam unidade aplicada. Preservar IDs, busca, favoritos e recentes. Não preencher artificialmente a árvore com presets de terceiros. | Cobertura do catálogo próprio, ausência de grupos vazios e persistência de filtro/scroll. O catálogo Composer é snapshot histórico, não leitura ao vivo desta rodada. |
| Hover de prévia e favorito | Source map BadFX `presetPanel/Preset.tsx`: playback hover e pointer hover são estados separados; favorito aparece no hover real ou quando já marcado; clique de favorito interrompe propagação para aplicação. | Controles secundários não devem aplicar o card. Hover é informativo e discreto; manter as prévias próprias e alternativa por foco. Não importar autoplay sonoro ou dependência de conta. | Pointer/foco, favorito sem execução, reduced motion e limpeza ao descartar view. |
| Menus e popovers | Imagens 1/5. `navigation/PresetsDropdown.tsx` BadFX, linhas de fonte 227–270: calcula posição pelo anchor, atualiza no resize, fecha em clique externo ou Escape e remove listeners. | Aproveitar fechamento previsível e cleanup. Preservar integralmente a forma, posição e animação card–popover já aprovadas no Moti.on; não adotar o overlay de largura total do BadFX. | Foco de retorno, Escape sem perder rascunho, resize, painel baixo e ausência de callbacks obsoletos. |
| Ícones e tooltips | BadFX `ui/CustomTooltip.tsx` configura título/subtítulo, posição, preferência e atraso; fallback de atraso 400 ms e transição 100 ms. `ToolbarIcon.tsx` evita propagação nos painéis de hover. Favoritos têm aria-label/title. | Usar o conjunto próprio de ícones, nome acessível e tooltip. Manter semântica nativa de botão e foco visível; não copiar SVG nem os tempos do fornecedor automaticamente. | Teclado/assistência no CEP; presença de aria-label no fonte não comprova acessibilidade completa. |
| Slider geral de navegador | Imagem 1/2 mostra escala da grade. BadFX `ui/CustomRange.tsx` usa input range para volume ou grade, com limites próprios. | Não confundir escala da grade com parâmetro de animação. Preservar o contrato atual da grade; controles de presets só mudam seus próprios valores. | Confirmar que ajuste numérico não altera densidade da biblioteca. |

## Mapeamento e restrições de integração

- `preset-gallery.ts`: separar `createPresetPhaseActions` do seletor `createPresetPhaseControl`; os fluxos de efeito contínuo, câmera, preset pessoal e cópia têm contratos próprios. Navegação nunca deve disparar comando.
- `scrubbable-number.ts` e a apresentação expansível: manter começo, atualização, confirmação e cancelamento do gesto; não recriar toda a árvore em cada pixel do slider. Expansão e reset não são mudanças globais de configuração.
- Filtro atual e metadados próprios de navegação: classificação por receita, sem renomear IDs persistidos nem transportar identidades dos plugins de referência.
- Tokens e CSS da aplicação AE: aparência isolada do Premiere. Tiles de Ferramentas, seus ícones e interações estão protegidos pelo pedido do usuário. Card–popover continua integrado com a geometria e movimento atuais.

Leitura normativa: `MASTER_BUILD_SPEC.md` foi percorrido em blocos, junto com `AGENT_SKILLS_GUIDE.md` e skills de orquestração/UI. As restrições que afetam esta entrega são: componentes não chamam host diretamente (§8/§22); validação antes de mutação e Undo coerente (§10); IDs e metadata existentes preservados (§11/§13); seleção, rascunho, ordem de recentes e scroll não se perdem com aplicar/editar/revelar (§13.1); primitivos Light DOM e fallbacks existentes permanecem (§22.2.1); teclado, localização, estados e 280 px mínimos (§22); browser tests e instalação não substituem host QA (§28/§33).

O azul solicitado e a aplicação direta por fase são decisões explícitas do usuário para esta revisão, superando as recomendações antigas de ação branca e seleção de fase seguida por Apply. Isso não autoriza mudar os tiles de Ferramentas nem tornar todo seletor de fase uma ação. Não há necessidade de nova API Adobe ou de protocolo de fornecedor.

## Cobertura e aceite

**PASS — pesquisa:** imagens fornecidas examinadas; hashes dos quatro recursos medidos; resumos de evidência REA exportada consultados; CSS/bundle/source map lidos em recortes; árvore histórica e contratos próprios cruzados; decisões e lacunas registradas.

**NOT RUN — nesta pesquisa:** sequência completa de cliques/hover/teclado nos fornecedores; medição temporal das animações; foco e contraste calculado das interfaces proprietárias; execução/Undo de comandos nativos nesta rodada. Estudos anteriores de aplicação de presets não promovem esses itens a PASS.

**Aceite da implementação, a registrar separadamente:** comparação antes/depois em 280/360/480/720 px e painel baixo; seleção sem aplicar; ações Entrada/Saída/Ambos com guards e busy; números/slider/reset/cancelamento; filtros combinados e rascunhos; preservação de Ferramentas e card–popover; reduced motion; testes integrados; fluxo e Undo no After Effects real. Este documento não declara esses gates concluídos.

A pesquisa dá suporte aos controles pedidos, mas não equivale a uma reprodução completa de todas as telas, estados, atalhos ou versões de Animation Composer/BadFX. Pontos desconhecidos foram mantidos como desconhecidos, e não preenchidos por inferência de screenshots.
