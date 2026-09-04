# Premiere UXP — capacidade DOM/CSS do kit de componentes

Verificado em: 2026-09-03

Status da pesquisa: `PARTIAL` — superfície oficial verificada; execução no
Premiere Pro real permanece `NOT RUN`.

## Pergunta

Quais primitivas de DOM, eventos e CSS podem sustentar o kit cross-host de
tile, botão, slider, chip, popover, gaveta e toast sem tratar o Premiere UXP
como se fosse um navegador completo?

## Evidência oficial

| Fonte Adobe | Evidência usada |
|---|---|
| [User Interfaces](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/user-interfaces/) | HTML padrão com CSS próprio é uma opção suportada, mas UXP não é um navegador completo. |
| [Creating HTML Elements](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/html-elements/) | `document.createElement()` é suportado para painéis; a receita corrente pede Premiere 25.6+, UDT 2.2+ e manifest v5. |
| [HTML Events and Listeners](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/html-events/) | `click`, `input`, `change`, `keydown`, `focus` e `blur` são documentados; `addEventListener()` é o caminho recomendado. |
| [CSS Styling](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/css-styling/) | CSS Grid não está disponível; Flexbox é a base segura para layout. |
| [CSS selectors](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-css/selectors/) e [pseudo-classes](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-css/pseudo-classes/) | Classes, atributos, combinadores e `:hover`, `:active`, `:focus` são listados. `:is`, `:focus-visible` e `:focus-within` não são listados. |
| [Unsupported Attributes](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-html/general/unsupported-attributes) | `aria*` e `hidden` são declarados sem suporte; `tabindex` existe com comportamento divergente da especificação. |
| [HTMLInputElement](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/global-members/html-elements/html-input-element) | Range expõe `min`, `max`, `step`, `focus()`, `scrollIntoView(boolean)` e `scrollIntoViewIfNeeded()`. |
| [`:focus`](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-css/pseudo-classes/focus) | A pseudo-classe documentada está disponível desde UXP v3.0. |
| [Known Issues](https://developer.adobe.com/premiere-pro/uxp/uxp-api/known-issues) | `<label for>` não funciona, tab order não é plenamente controlável, CSS animation/transition não é suportado e elementos de edição podem ficar acima de overlays. |

Há uma inconsistência documental: referências JavaScript específicas expõem
a propriedade `hidden`, enquanto a lista global marca o atributo como não
suportado. O código não escolhe um dos lados por palpite; mantém `hidden` e um
`data-hidden` com regra `display: none` em paralelo.

## Decisão aplicada

- O kit usa elementos HTML nativos criados com `document.createElement()` e
  listeners registrados por `addEventListener()`.
- Todo layout do package usa Flexbox; CSS Grid, `:is`, `:focus-visible`,
  `:focus-within`, shorthand `font`, logical properties e outras dependências
  não listadas foram removidas da folha do componente.
- `:focus` aplica outline normativo e borda visível de fallback. O foco não
  depende de uma pseudo-classe ausente no UXP.
- Popover, gaveta e toast aceitam `animationend`, mas também finalizam por um
  scheduler de segurança. Fechar a UI não depende de animação existir.
- O rótulo do slider chama `focus()` explicitamente porque `<label for>` não é
  confiável no runtime.
- A rolagem do grid prefere `scrollIntoViewIfNeeded()` e rebaixa para
  `scrollIntoView(false)`, sem passar o objeto de opções não documentado.
- ARIA continua no DOM para CEP e ambientes que a expõem, mas nunca é a única
  portadora de estado: status e motivos têm texto visível, e chips usam
  marcadores `●`, `○` e `—` além da cor.
- Live regions não são aninhadas: cada toast é a unidade anunciadora; a região
  contêiner apenas agrupa os itens.

## Capability gates resultantes

| Capability | Estado | Fallback |
|---|---|---|
| DOM e eventos básicos | `SUPPORTED_BY_DOCS` | nenhum método privado ou automação de UI |
| CSS Grid | `UNSUPPORTED` | linhas e células por Flexbox |
| `hidden` confiável | `UNSUPPORTED_BY_DOCS` | `data-hidden="true"` + `display: none` |
| CSS animation/transition | `UNSUPPORTED_BY_DOCS` | timeout de encerramento; estado final permanece legível |
| ARIA no Premiere UXP | `UNSUPPORTED` | texto/forma visível e controles nativos; sem promessa de leitor de tela |
| tab order conforme HTML | `PARTIAL` | teclado próprio e foco programático; validar em host |
| overlay sobre campo editável | `PARTIAL` | consumidor deve ocultar/reorganizar o campo quando necessário |

## Verificação automatizada

`packages/ui-core/tests/components.test.mjs` fixa a superfície DOM comum, os
atalhos, roving focus, retorno de foco, ranges, estados, timeout sem
`animationend`, ausência de CSS Grid/seletores não documentados e distribuição
da folha aos dois hosts.

## Incerteza aberta e prova pendente

A documentação prova disponibilidade e limitações declaradas, não o
comportamento deste bundle. Continuam `NOT RUN` no Premiere Pro real:

- tabulação/roving focus e rolagem no Windows e macOS;
- render Flexbox em 280/360/480/720 px e escala 100–200%;
- fechamento de overlays sem animação e a sobreposição a campos numéricos;
- leitura efetiva por tecnologia assistiva, que não pode ser prometida porque
  a própria referência marca `aria*` como sem suporte.

