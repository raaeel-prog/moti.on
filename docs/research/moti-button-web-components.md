# MotiButton — migração gradual para Web Components

## Question / Pergunta

Como continuar o `<moti-button>` inicial usando Light DOM e transformar
`createActionButton()` em um wrapper sem mudar seu contrato, quebrar imports
sem DOM ou presumir que o Premiere UXP implementa um navegador completo?

## Decision date / Data da decisão

2026-09-28.

## Target host/version / Hosts alvo

- After Effects 25.0+ com CEP 12, conforme o master do projeto.
- Premiere Pro 25.6+ com UXP e manifest v5; suporte de cada API deve ser
  detectado em runtime.
- Node.js para importação dos módulos compartilhados e testes automatizados;
  esse ambiente não fornece `HTMLElement` nem `customElements` nativamente.

## Status

`partial` — documentação oficial e contrato local revisados. O caminho de
Web Components no bundle precisa de verificação real em ambos os hosts.
AE host: `NOT RUN`. Premiere host: `NOT RUN`.

## Evidence table / Evidências

| Afirmação | Símbolo ou regra | Versão mínima documentada | Fonte primária | Observação |
|---|---|---|---|---|
| O Premiere documenta registro e consulta de Custom Elements. | `window.CustomElementRegistry.define(name, constructor, options)` e `get(name)` | A página não informa a introdução individual desses métodos. | [Adobe — CustomElementRegistry](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/global-members/html-dom/custom-element-registry) | A existência da referência não substitui o probe do runtime instalado. |
| Parte da API de Custom Elements exige uma feature flag. | `upgrade(root)`, `whenDefined(name)` e `featureFlags.enableSWCSupport` | A página desses métodos não declara uma versão mínima individual. | [Adobe — CustomElementRegistry](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/global-members/html-dom/custom-element-registry) | A implementação desta fatia não depende de `upgrade` nem `whenDefined`. |
| UXP possui suporte a Web Components, mas não equivale a um navegador completo. | Web Components; Spectrum Web Components | O changelog registra suporte a Web Components no UXP 7.0.0. | [Adobe — UXP changelog](https://developer.adobe.com/premiere-pro/uxp/uxp-api/changelog3-p), [Adobe — User Interfaces](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/user-interfaces/) | A versão UXP não prova o comportamento deste componente no Premiere alvo. O guia de SWC exige `enableSWCSupport`. |
| Ativar a flag de SWC pode alterar também o comportamento CSS. | `enableSWCSupport` habilita `CSSNextSupport` por padrão. | Descrito no changelog; não se infere aqui o host mínimo dessa mudança. | [Adobe — UXP changelog](https://developer.adobe.com/premiere-pro/uxp/uxp-api/changelog3-p) | Evitar introduzir essa mudança global somente para o botão Light DOM. |
| O construtor de um Custom Element não deve acrescentar atributos nem filhos ao próprio elemento. | Requisitos de construtores e reactions, §4.13.2 | Contrato HTML da plataforma, não uma versão Adobe. | [WHATWG — Custom elements](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-conformance) | A inicialização do DOM deve acontecer depois da construção. `connectedCallback` pode ocorrer mais de uma vez. |

As fontes foram consultadas em 28/09/2026. A decisão abaixo é a aplicação
dessas evidências ao contrato do repositório; não constitui certificação de
compatibilidade Adobe.

## Implementation decision / Decisão de implementação

Usar migração gradual. O primeiro componente cobre apenas o botão stateful
exposto por `createActionButton()`. O elemento novo continua em Light DOM,
com um `<button type="button">` interno e os mesmos irmãos para estado e
motivo de indisponibilidade. Essa estrutura mantém as classes, seletores de
filhos diretos e folhas compartilhadas existentes.

O registro é explícito e sob demanda, a partir do `Document` recebido pelo
builder. Consultar `doc.defaultView`, sua classe `HTMLElement` e seu registry
`customElements`; criar a classe somente quando essa superfície existir.
Não avaliar um `extends HTMLElement` global nem registrar a tag como efeito
colateral da importação do package. Isso permite importar `@motion/ui-core`
sem DOM e mantém construção e registry associados ao documento correto.

O registro usa somente `get` e `define` e deve ser idempotente. A presença de
uma definição com o mesmo nome não autoriza presumir que ela implementa o
contrato esperado: o caminho de criação deve verificar a superfície que irá
consumir. Falhas de suporte ou de criação devem preservar o caminho nativo
de fallback. Erros de validação das opções continuam sendo erros do
chamador; não devem ser convertidos silenciosamente em fallback.

O construtor inicializa somente o estado interno permitido. A montagem do
Light DOM acontece fora dele, é idempotente e pode ser acionada pelo wrapper
antes da conexão. O controller precisa entregar seu botão nativo utilizável
mesmo quando ainda não foi anexado à página. Reconectar ou mover o elemento
não duplica nós ou listeners, nem move estado e motivo para dentro do botão.

Não adicionar `enableSWCSupport`, `CSSNextSupport`, biblioteca SWC, polyfill ou
Shadow DOM nesta fatia. `define/get` serão usados quando disponíveis; a
combinação exata de runtime, manifest e classe continua pendente de smoke
real. A ausência da flag no manifest atual não é tratada como prova de que
`define/get` sejam indisponíveis.

### API e comportamento preservados

O contrato público existente permanece:

```ts
createActionButton(doc, options) -> {
  element,
  button,
  setState(state, stateLabel?),
  setDisabled(disabled, disabledReason?)
}
```

- `element` continua sendo um `HTMLElement`; `button` continua sendo o
  `HTMLButtonElement` interno. Chamadores não precisam conhecer a tag externa.
- Opções preservadas: `id`, `label`, `variant`, `title`, `onPress`, `state`,
  `stateLabel`, `disabled` e `disabledReason`.
- Estados preservados: `default`, `loading`, `empty`, `success`, `warning`,
  `error` e `unsupported`. O `idle` do protótipo inicial não substitui
  `default` no contrato público.
- Variantes preservadas: `default`, `primary`, `danger` e `quiet`. O `ghost`
  do protótipo não remove o alias `quiet` já consumido pelo tema.
- `loading`, `unsupported` e indisponibilidade explícita bloqueiam ativação.
  `success` permite uma nova ação, como no builder anterior.
- `stateLabel` continua obrigatório para estado diferente de `default`;
  `disabledReason` continua obrigatório quando `disabled` é verdadeiro.
- Preservar IDs, título, texto de estado, spinner, motivo acessível,
  `aria-describedby`, `aria-disabled`, `aria-busy` e `data-hidden`.
- O botão permanece focalizável enquanto indisponível para explicar o
  impedimento. Clique, Enter e Espaço não podem produzir dupla ativação.
- No elemento, alterações de `label`, `variant`, `state` e `disabled` devem
  atualizar o mesmo controle interno e manter atributos/propriedades
  coerentes, sem criar uma segunda fonte de verdade para bloqueio.

ARIA é mantida para os ambientes que a implementam; texto de estado e
explicações visíveis continuam necessários para UXP. As limitações anteriores
do DOM compartilhado estão registradas em
[premiere-uxp-component-dom-capabilities.md](premiere-uxp-component-dom-capabilities.md).

## Fallback

Quando o documento não oferece o registry e o construtor necessários, ou
quando não consegue criar um elemento com a superfície esperada, usar
`<span class="ch-action">` contendo o mesmo botão nativo, estado e motivo.
Esse caminho deve preservar o contrato inteiro, inclusive bloqueio, teclado
e explicações, sem apresentar um controle inerte.

## Capability flag / Probe de capacidade

A capacidade é local à apresentação, sem acrescentar uma capacidade de
comando Adobe ao catálogo compartilhado. O gate verifica:

- `doc.defaultView` disponível;
- `typeof doc.defaultView.HTMLElement === "function"`;
- `typeof doc.defaultView.Event === "function"`, usado pelo evento público `press`;
- registry disponível com `typeof registry.get === "function"` e
  `typeof registry.define === "function"`;
- criação bem-sucedida e superfície esperada do elemento registrado.

O registro bem-sucedido apenas habilita a tentativa de criação. Não prova
renderização, acessibilidade, foco ou lifecycle corretos no host.

## Tests needed / Verificação necessária

Testes automatizados devem cobrir import sem DOM; criação com e sem registry;
registro repetido; colisão/registro indisponível; botão ainda desconectado;
reconexão sem duplicação; reflexão entre atributos e propriedades; todas as
variantes e estados; `disabled = false` durante loading; títulos e descrições;
ativação única por mouse/teclado; e paridade funcional do fallback.

Executar `npm run check` depois da integração. Revisar o botão com os CSS
reais: o Light DOM preserva seletores existentes, mas não corrige um seletor
incorreto por si só.

No host real, registrar versão, OS, build e fixture; verificar clique, Enter,
Espaço, foco, motivo de bloqueio, transições de estado, mover/remontar o
controle e reabrir o painel. Revisar larguras 280, 360, 480 e 720 px e escalas
disponíveis. AE host: `NOT RUN`. Premiere host: `NOT RUN`.

### Evidência de baseline, antes da correção

- Import de `packages/ui-core/dist/index.js`: `FAIL`, com
  `ReferenceError: HTMLElement is not defined` no módulo inicial
  `elements/moti-button.js`.
- `node --test packages/ui-core/tests/components.test.mjs apps/premiere-uxp/tests/client-runtime.test.mjs`:
  `37 PASS / 1 FAIL`. O arquivo de testes do Premiere falha durante o import
  acima, antes de executar seus casos.

Esses resultados descrevem o ponto de partida. Não são resultados do código
corrigido nem substituem o relatório de verificação final da implementação.

## Open uncertainty / Incerteza e sequência de migração

Em 28/09/2026, a busca em `apps/` não encontrou consumidores de
`createActionButton()`. Os apps importam principalmente `button()` de
`packages/ui-core/src/shell.ts`. Portanto, migrar `createActionButton()`
estabelece a primeira primitiva compatível; não significa migrar todos os
botões visíveis dos painéis.

`shell.button()` retorna diretamente um `HTMLButtonElement`, usa variantes
`primary`, `secondary`, `tertiary`, `ghost` e `destructive`, recebe `onClick`
e utiliza `disabled` nativo. Seu contrato difere do controller stateful,
que mantém o controle focalizável para explicar impedimentos. Alterar esse
helper indiscriminadamente pode mudar referências ao botão, ordem de foco,
layout e bloqueio de ações.

Próxima etapa: inventariar consumidores de `shell.button()` e escolher um
fluxo pequeno para adoção explícita, preservando suas expectativas de DOM e
interação e obtendo evidência de host. Só depois expandir para outros
componentes. Remover builders antigos exige que os consumidores tenham sido
migrados e a paridade comprovada; não é consequência automática da criação
da pasta `elements/`.
