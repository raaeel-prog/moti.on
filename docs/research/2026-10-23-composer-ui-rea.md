# Animation Composer 4.2.6: UI/UX da biblioteca

## Identidade e método

Alvo instalado: `C:\Program Files\Common Files\Adobe\CEP\extensions\com.misterhorse.AnimationComposer`.
Manifest `CSXS/manifest.xml`, linhas 5–19: versão 4.2.6 e painéis browser/edit,
Anchor Mover, Keyframe Actions, Shifter, Wingman e Welcome.

REA `analyze_javascript_application`, diretório, leitura estática. Evidência:
`ev_215ac6868c16bd25236b6f1a2ddc691b9e3aed2bd40aac48d0a7b70d07c5f5f6`.
Hash do artefato observado:
`46920d80dbe6d5ec0b4d526d8ec5678bb74717e948560818c12ddf7b1e8921a3`.
15 arquivos JS parseados, 22 arquivos relevantes, 144 achados. Cobertura
semântica **PARCIAL**: oito bundles atingiram o limite de heap. Nenhum bundle
foi executado. A análise não demonstra alcance em runtime, equivalência
funcional integral nem comportamento de todos os painéis auxiliares.

Corroboração: leitura do CSS distribuído `client/dist/browser.css`, hash
`c011ec98376ecc63b7e9ca7cd76029478b3177c43f96cfa3893f300e207703a1`.
103 regras de geometria/interação foram catalogadas em
`C:\dev\composer-ui-study-20261022\css-facts.json`; o bundle REA completo está
no mesmo diretório (`rea-evidence.json`). Esses artefatos não entram no plugin.

## Inventário observado e aplicação

| Superfície | Observação no pacote | Aplicação no Moti.on Presets |
|---|---|---|
| Browse / Edit | Modos distintos; editor com conteúdo rolável e seções (CSS 47, 96) | Edição ocupa a área inteira também em painel largo; sair preserva posição, seleção e rascunhos. Galeria é descartada em Editar. |
| Biblioteca | Árvore e grade em split pane; divisor 10 px; largura persistida, default 220 no bundle (CSS 64, 76, 96) | Mantida árvore redimensionável com teclado, largura persistida; limite ajustado para grade útil em 280 px. |
| Pastas | Linha mínima 24 px, indentação 20 px; expandir, favoritos e etiquetas (CSS 67–76) | Pastas atuais preservadas; linhas 26 px, seleção azul, hover e hierarquia; nomes locais e catálogo próprio. |
| Busca | Barra, filtros e etiquetas ativas (CSS 81–83) | Busca de 250 ms, favoritos/recentes; caminho clicável, contagem real e limpar filtros sem abandonar a coleção. |
| Cards | Preview, nome, favorito, estados selecionado/hover; label 34 px (CSS 77–80) | Cards compactos, nomes em até duas linhas, borda de seleção, ajustes anexados; setas/Home/End selecionam sem aplicar. |
| Rodapé | Separado do scroll; controles de prévia e ações contextuais (CSS 84, 86–88, 92) | Entrada/Saída/Ambos existentes; nome do preset e seleção alvo visíveis, inclusive quando o filtro esconde o card. |
| Botões | Alturas 20/28 px, raio 4 px, estados hover/pressed/disabled (CSS 5) | Botões existentes com estados de progresso/erro; abas 32 px; ações azuis usam tokens próprios. |
| Sliders | Track visual 2 px, thumb circular 11 px; borda aumenta no hover/drag (CSS 9) | Slider de miniaturas circular 12 px, borda 2→4 px; largura fixa 88 px preservada. Parâmetros mantêm slider expansível e valor preciso. |
| Números | Valor arrastável e campo para digitação; commit/cancel e setas no bundle (CSS 25, 27) | Mantidos scrubbing, digitação, unidades, limites, restauração e proteção contra inspeção assíncrona durante gesto. Atalhos próprios preservados. |
| Propriedades | Disclosure, selects, checkboxes, fonte/cor e grupos (CSS 17–46) | Presets expõem somente parâmetros suportados: duração, intensidade, direção, curva, unidade, ordem, sobreposição, blur, variação e deslocamento. |
| Fases aplicadas | Seções de presets, ações copiar/remover/restaurar e time shift (CSS 31–33, 45–47) | Entrada/Saída/Efeito editáveis mantidos, ações locais e inspeção com identidade/fingerprint. |
| Popovers | Conteúdo, separadores, dismiss e estados interativos (CSS 7–8, 69) | Menus anexados ao card, Escape, foco de retorno, direção e caráter preservados. Cabeçalho compacto passa a identificar o preset. |
| Feedback | Toast, warning, empty, loader, error e notificações (CSS 12–16, 46–47, 58–63, 98–101) | Feedback existente mantido; contexto inválido bloqueia ações; nenhum comando habilitado sem preset selecionado. |
| Tema | Variáveis semânticas e temas Spectrum; neutralidade + azul | Paleta acompanha o AE e preferência Moti.on. Não transplantada a folha Spectrum nem fontes/ícones proprietários. |

## Delimitação

A reconstrução cobre o fluxo de presets no Moti.on, usando seu catálogo e seus
comandos. Controles de transcrição, conta, atualização, mídia substituível e
painéis auxiliares aparecem no pacote do Composer, mas não são apresentados
como capacidades implementadas nesta aba. Suas declarações estáticas foram
inventariadas; comportamento integral permanece não verificado.

Nenhum JS, CSS, preset, fonte, bitmap ou vetor do Composer foi incluído no build.
As medidas acima são observações; as adaptações são decisões de implementação
originais. Testes de browser usam fixture do comando, não provam aplicação no AE.

## Graphify

Consultas `query` e `path createPresetWorkspace createPresetGallery` localizaram
galeria, editor, navegação e testes. `graphify update .` atualizou o grafo após
as mudanças (AST local). O nome instalado é Graphify; não há API GraphQL/GraphiQL
necessária para essas consultas. Dois cabeçalhos C++ mantêm avisos de sintaxe
do extrator; isso não afeta a cobertura dos arquivos TypeScript alterados.
