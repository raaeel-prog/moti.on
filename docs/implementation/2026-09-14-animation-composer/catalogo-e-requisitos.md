# Presets para o Moti.on — catálogo e requisitos do vídeo

**Referência:** gravação fornecida pelo usuário, 14/09/2026, 20:15:43.  
**Etapa concluída:** transcrição e levantamento visual.  
**Implementação dos novos presets:** não executada nesta etapa.  
**Transcrição:** [versão para leitura](transcricao.md), [original automático](transcricao-automatica.txt).

## 1. Entendimento da solicitação

A primeira solicitação da conversa é transcrever o áudio para compreender a referência. O conteúdo do vídeo descreve a evolução desejada da aba Presets do Moti.on. Abaixo, o que foi dito está separado do que foi observado na tela e dos critérios sugeridos para uma implementação posterior.

### Pedidos expressos na gravação

1. Organizar a aba **Presets**, considerada confusa no estado mostrado.
2. Corrigir o preview das curvas: a bolinha deve acompanhar a linha da curva.
3. Investigar o relato de presets que não funcionam.
4. Trazer animações de motion 2D e 3D, efeitos de motion, animações de texto e efeitos de texto.
5. Permitir escolher a direção da animação. O usuário exemplifica direita e esquerda.
6. Exibir uma prévia de como a animação ficará antes de aplicar.
7. Incluir extrusão, sombras e wiggle, explicitamente destacados.
8. Oferecer animações de texto de diferentes formas, inclusive por linha.
9. Entregar presets que realmente funcionem no plugin.

### Comportamentos observados na interface de referência

- A árvore separa Motion Presets de Text Presets.
- O menu de direção mostra **Bottom, Left, Right, Top** e **View all at once**.
- A área de aplicação mostra **In, Out, Both** — entrada, saída e ambas.
- Cada item tem nome e prévia animada; algumas variantes ficam em um menu.
- Favoritos aparecem como estrelas.

A observação desses controles não comprova os parâmetros internos, o timing nem todas as variantes do pacote.

## 2. Organização realmente visível

```text
Animation Presets
├── Motion Presets
│   ├── 2D Transitions
│   ├── 3D Transitions
│   └── Effects
└── Text Presets
    ├── Transitions - Characters
    ├── Transitions - Words
    ├── Transitions - Lines
    └── Effects
```

Na fala aparece “quatro pastas”. A árvore acima registra o que a tela efetivamente mostra: duas famílias com sete subcategorias. Em termos funcionais, o conteúdo pode ser resumido em transições de motion, efeitos de motion, transições de texto e efeitos de texto; a árvore preserva a separação adicional de 2D/3D e caracteres/palavras/linhas.

## 3. Catálogo identificado

Foram identificados **56 nomes de presets ou variantes** nos quadros da gravação. Os nomes abaixo são referências do Animation Composer, não nomes finais já adotados no Moti.on. O vídeo percorre uma seleção do catálogo e não permite afirmar que mostra todo o conteúdo instalado. Os tempos apontam para um quadro em que o rótulo é legível, com tolerância de cerca de um segundo.

### Motion — transições 2D — 9 referências

| Tempo | Nome exibido |
|---|---|
| 00:44 | Gaussian Blur & Fade Eased 1 |
| 00:44 | Fade Cubic In 1 |
| 00:57 | Ease Position & Rotate 1 |
| 01:11 | Overshoot Position & Rotate 1 |
| 01:12 | Ease Position & Rotate & Scale 2 |
| 01:14 | Overshoot Position & Rotate & Scale 4 |
| 01:16 | Overshoot Position & Scale 2 |
| 01:18 | Overshoot XY Scale From Anchor Point 2 |
| 01:21 | Bounce XY Scale From Anchor Point 1 |

### Motion — transições 3D — 7 referências

| Tempo | Nome exibido |
|---|---|
| 01:23 | Ease Fade & Rotate Around Edge Forward 1 |
| 01:27 | Ease Position & Rotate ND A 5 |
| 01:28 | Ease Position & Rotate ND A Two Way 1 |
| 01:30 | Overshoot Position & Rotate NS B Two Way 1 |
| 01:31 | Overshoot Rotate Around Anchor Point 3 |
| 01:34 | Bounce Rotate Around Anchor Point 2 |
| 01:35 | Ease Rotate NS From Front 1 |

### Motion — efeitos — 20 referências

| Tempo | Nome exibido |
|---|---|
| 01:37 | Gaussian Blur & Wave Warp 2 |
| 01:40 | 2 Color Chroma Split |
| 01:42 | Duotone |
| 01:43 | High Contrast Colors |
| 01:43 | RGB Split |
| 01:44 | Extrude Left Side |
| 01:46 | Extrude Right Side |
| 01:47 | Extrude Top Side |
| 01:47 | Extrude Top Side Rotated |
| 01:50 | Extrude |
| 01:51 | Long Shadow |
| 01:55 | Long Shadow & Stripes |
| 01:56 | Long Shadow with Gradient |
| 01:57 | Wiggle X Position 1 |
| 02:00 | Cosine Position & Rotate & Scale 1 |
| 02:00 | Wiggle Position & Rotate & Scale 1 |
| 02:01 | Cosine Absolute Y Position & Rotation 1 |
| 02:03 | Cosine Absolute Y Sine X Position & Rotation 1 |
| 02:04 | Cosine Position & Rotation 3 |
| 02:11 | Wiggle Position & Rotation 2 |

### Texto — transições por caracteres, palavras e linhas — 15 referências

| Tempo | Nome exibido |
|---|---|
| 02:13 | Ease Fade Separately 3 |
| 02:14 | Ease Fade Together 3 |
| 02:15 | Ease Position & Rotate & Scale Y 1 |
| 02:16 | Ease Position & Rotate & Scale Randomly 2 |
| 02:17 | Overshoot Position & Rotate & Scale 1 |
| 02:18 | Flickering Decode & Scale 3 |
| 02:19 | Flickering Decode & Scale 6 |
| 02:20 | Ease Position Together Y |
| 02:21 | Ease Position Together X |
| 02:22 | Overshoot Position & Mask Y |
| 02:23 | Ease Position & Rotate 3 |
| 02:24 | Ease Position & Rotate 6 |
| 02:25 | Wiggly Position & Rotate & Scale 7 |
| 02:26 | Flickering Position & Scale Randomly 6 |
| 02:28 | Decode 2 |

### Texto — efeitos — 5 referências

| Tempo | Nome exibido |
|---|---|
| 02:29 | Decode Continuously 3 |
| 02:30 | Flickering Decode & Scale & Tracking 3 |
| 02:30 | Wiggly Fade 1 |
| 02:31 | Skew Jiggling |
| 02:32 | Turbulent Jiggling |

As transições de texto estão listadas juntas porque a navegação entre caracteres, palavras e linhas ocorre rapidamente. A categoria e o funcionamento de cada variante devem ser reconferidos no trecho indicado ao especificar sua implementação. As siglas ND/NS e os números foram preservados como rótulos da referência; não foi inferido um significado técnico.

## 4. Problemas atuais: evidência e limites

| Ponto | Evidência disponível | Situação |
|---|---|---|
| Bolinha fora da curva | Relato em 00:13–00:20 e preview visível; o código atual desenha o círculo com altura fixa abaixo do gráfico. | Causa visual identificada por inspeção; ainda sem alteração. |
| “Nada aqui está funcionando” | Relato em 00:13–00:20. O trecho não mostra uma sequência completa de seleção válida, aplicação e erro para cada preset. | Requer reprodução no After Effects; não é possível concluir que todas as ferramentas estejam quebradas. |
| Galeria desorganizada | Relato em 00:00–00:13 e visual atual da aba. | Direção de melhoria clara: categorias, previews e opções por preset. |

Na estrutura atual há seis presets de curvas e onze movimentos de câmera. Curvas exigem keyframes selecionados e os movimentos de câmera têm pré-condições próprias. Essa diferença deve ficar clara na interface e nos testes, para que um preset incompatível com a seleção não pareça um botão sem ação.

## 5. Critérios sugeridos para a implementação

Estes são critérios técnicos propostos a partir da referência; não fazem parte da transcrição literal.

- Cada preset precisa de uma definição de comportamento própria no Moti.on, com valores, duração e variantes documentados.
- Os previews devem representar a mesma direção, fase e comportamento enviados ao After Effects.
- Transições devem declarar se o tempo segue início/fim da camada, cursor ou marcadores. A gravação não estabelece essa regra com precisão.
- Testar In, Out e Both, além das direções realmente oferecidas por cada preset.
- Presets de texto devem declarar a unidade de animação: caractere, palavra, linha ou texto inteiro.
- Definir como cada preset é ajustado, reaplicado e removido, preservando o trabalho já existente.
- Verificar seleção vazia, camada incompatível, expressão existente, keyframes existentes e Undo.
- Verificar os efeitos no After Effects real, incluindo extrusão e sombras; uma prévia no painel não comprova o resultado aplicado.
- Manter o catálogo de referência separado do catálogo implementado e registrar quais variantes passaram por teste.

## 6. Limites do levantamento

O áudio e os nomes exibidos foram extraídos localmente. O levantamento não importou arquivos de presets nem código do Animation Composer e não mediu suas curvas, expressões ou valores internos. Os quadros mostram o resultado visual, mas não garantem uma reprodução exata de todos os parâmetros ou das variantes que não foram abertas.

A transcrição conserva a saída automática original junto da versão editada. Não foi feita alteração nos arquivos-fonte do plugin nem instalação de um novo build nesta etapa.
