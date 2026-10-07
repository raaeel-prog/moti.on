# Pulso de texto V3 — propagação por caractere

## Problema visual e escolha

A V2 escalava a camada inteira em Y e usava perturbações a cada quadro. O resultado não produzia o arco na entrada nem a ampulheta no retorno observados no vídeo local. A V3 usa um animador de texto e um seletor por caractere; a camada mantém a escala Y em 100%. A mesma ordem de atraso na entrada e na saída faz o centro crescer e encolher antes das bordas. Os modos laterais usam a ordem dos caracteres; Uniforme elimina o atraso. Entrada e retorno usam uma curva quintic com velocidade e aceleração nulas nas extremidades. Luz e ecos acompanham a transição.

## Fontes primárias

- [Adobe — Animating text](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html): animadores, expressão de Amount por caractere, textIndex/textTotal e alinhamento dos pontos de ancoragem.
- [Adobe Scripting Guide — Text Layer Match Names](https://ae-scripting.docsforadobe.dev/matchnames/layer/textlayer/): ADBE Text Animators, Animator, Selectors, Animator Properties, Scale 3D e Anchor Point Align.
- [Adobe Scripting Guide — PropertyGroup.addProperty](https://ae-scripting.docsforadobe.dev/property/propertygroup/#propertygroupaddproperty): adição com nomes de correspondência e invalidação de referências nos grupos indexados; referências são recuperadas por caminhos após adicionar propriedades.

## Inspeção no host real

Probe executado no After Effects 2026 26.5x89, macOS 27.2.0 em 28/09/2026. [Relatório PASS](../../artifacts/reference-effect/v3/text-animator-probe.json). A composição temporária foi removida e a contagem de itens do projeto retornou de 0 para 0.

| Caminho nativo | Valor ou observação |
|---|---|
| Text Animators / ADBE Text Animator | canAddProperty = true |
| Animator Properties / ADBE Text Scale 3D | canAddProperty = true; valor [100,360,100] |
| Selectors / ADBE Text Expressible Selector | canAddProperty = true; grupo começa sem seletores |
| ADBE Text Expressible Amount | expressão com textIndex/textTotal avaliada e renderizada |
| ADBE Text Range Type2 | 1, Characters |
| More Options / ADBE Text Anchor Point Option | 1, agrupamento por caractere |
| More Options / ADBE Text Anchor Point Align | [0,-50] produz expansão em torno do centro vertical; [0,0] mantém a baseline fixa |
| Animator Properties / isModified | só Scale foi marcado como modificado no probe; propriedades neutras permaneceram false |

Os nomes de Expression Selector/Amount e Anchor Point Option foram também inspecionados no runtime, pois a lista estática não enumera todos esses filhos. A implementação verifica capacidade e propriedades presentes antes de usá-los. Esse probe valida a API e a ancoragem; não substitui a validação do build V3 final, de migração ou Undo.

## Limites

A referência é usada para orientar ritmo, forma e luz; fonte e texto pertencem ao usuário. O probe cobriu texto de ponto, fonte Avenir Next Condensed, uma linha e 30 fps. Texto bidirecional, fontes/formatação variadas, outras versões de AE e salvar/reabrir permanecem NOT RUN até uma verificação explícita.
