# Web Components — primeira etapa: botão de ação

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

A etapa iniciada por Hugo foi ligada ao contrato existente: `createActionButton`
agora cria `moti-button` onde há suporte. A interface do controller permanece
`{ element, button, setState, setDisabled }`; `button` é o controle HTML nativo,
inclusive antes de anexar o componente à página. O fallback usa a mesma lógica
em um `span`, com a mesma aparência e comportamento.

## Implementação

- Registro explícito por documento, sem `HTMLElement`/`customElements` globais
  durante o import. Uma classe de outro documento ou de terceiro não é usada
  como se pertencesse ao componente. Ausência das APIs e falha de registro ou
  construção conservam o builder nativo.
- Constructor sem mutações de atributos/filhos. Inicialização e reconexão
  idempotentes, sem duplicar controles ou callbacks.
- Light DOM com botão, estado e motivo como irmãos. Preservados IDs, spinner,
  texto de estado, título, `aria-busy`, `aria-disabled`, `aria-describedby`,
  motivo por foco e `data-hidden`.
- Estados atuais: default, loading, empty, success, warning, error e unsupported.
  Loading/unsupported bloqueiam; success permite repetir a ação. Tirar disabled
  durante loading não libera a ação.
- Atributos/propriedades refletem label, variant, state, state-label, disabled,
  disabled-reason e title. Métodos validam estado/motivo antes de alterar os
  atributos. Sequências de atributos incompletas bloqueiam a ação até ficarem
  válidas. Atualizações cosméticas preservam o texto da live region e a explicação
  já aberta por foco.
- Primitivas internas extraídas de `components.ts` para `component-dom.ts`;
  comportamento do botão compartilhado em `elements/action-button-view.ts`.
  Demais componentes continuam reexportados pela API existente.
- Corrigido um prefixo `.ch-tool-filters` solto no seletor de `theme.css`, que
  restringia a geometria base dos action buttons aos descendentes de filtros.

## Arquivos

| Área | Arquivos |
|---|---|
| UI | `packages/ui-core/src/components.ts`, `component-dom.ts`, `elements/moti-button.ts`, `elements/action-button-view.ts`, `index.ts`, `theme.css` |
| Testes | `packages/ui-core/tests/moti-button.test.mjs` (14 testes novos) |
| Evidência de navegador | `artifacts/web-components-20260928/verify-browser.mjs`, `browser-results.json`, `browser-results.md`, screenshots |
| Documentação | este relatório, `plano.md`, `docs/research/moti-button-web-components.md`, matriz DOM/UXP, master e changelog |
| Host, schemas e presets | sem alterações de fonte nesta etapa |

O diretório não possui Git. Fontes originais preservados em
`artifacts/web-components-20260928/source-before/`; diff de revisão em
`artifacts/web-components-20260928/changes.diff`.

## Uso

O código existente pode continuar usando o builder:

```ts
const action = createActionButton(document, {
  id: "apply",
  label: "Aplicar",
  variant: "primary",
  onPress: applyCurrentDraft
});
container.appendChild(action.element);
action.setState("loading", "Aplicando…");
action.setState("success", "Aplicado");
```

Para uma futura tela declarativa, registrar explicitamente antes de usar a tag:

```ts
const ButtonElement = registerMotiButton(document);
// Se não houver suporte, usar createActionButton(), que fornece o fallback.
```

```html
<moti-button label="Aplicar" variant="primary"></moti-button>
```

O elemento autônomo emite `press` com bubbling. No wrapper, o callback existente
`onPress` continua sendo a integração. Escute a ação pelo mecanismo escolhido,
sem duplicá-la com um listener de clique adicional.

Usar `label` para tags registradas antes do parser; conteúdo textual já existente
antes do upgrade é aceito. Não usar somente texto filho durante parsing progressivo.
Preparar `stateLabel`/`disabledReason` antes das respectivas propriedades, ou usar
os métodos atômicos `setState(state, label)` e `setDisabled(flag, reason)`.
`MotiButton` é o tipo público; o construtor real é retornado pelo registro do
documento, evitando a dependência de uma classe global durante import.

## Verificação executada

| Comando | Resultado |
|---|---|
| `npm run check` antes das alterações | FAIL: 5 erros de lint, incluindo o protótipo de moti-button |
| `npm run check` após integração | FAIL: 4 erros de lint anteriores fora desta etapa |
| `npx eslint packages/ui-core/src/components.ts packages/ui-core/src/component-dom.ts packages/ui-core/src/elements/*.ts packages/ui-core/src/index.ts packages/ui-core/tests/moti-button.test.mjs` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, artefatos AE e Premiere gerados |
| `npm run validate` | PASS |
| `node scripts/check-extendscript.mjs` | PASS: 77 arquivos |
| `npm run a11y:contrast` | PASS: 88 pares |
| `node --test packages/ui-core/tests/components.test.mjs packages/ui-core/tests/moti-button.test.mjs apps/premiere-uxp/tests/client-runtime.test.mjs` | PASS: 62/62 |
| `npm test` | FAIL: 1.681/1.730; 49 falhas |
| `npm run skills:validate` | PASS: 14 skills, 31 arquivos, 42 rotas e mirror |
| `node artifacts/web-components-20260928/verify-browser.mjs` | PASS: 34/34 |

Os quatro erros de lint estão em `host-adapter.ts` (2), `main.ts` (1) e
`text-vertical-pulse.test.mjs` (1). Foram reproduzidos antes das alterações.

As 49 falhas da suíte geral incluem limites do adapter, catálogo de presets,
previews, biblioteca Quick e arraste numérico. Seus detalhes estão em
`artifacts/web-components-20260928/tests-summary.txt` e `tests.log`. Não foram
corrigidas nesta fatia. O check inicial parou no lint: não existe comparação
completa antes/depois da suíte que permita atribuir formalmente cada falha.
Nenhuma delas pertence aos 62 testes focados listados acima.

### Navegador

Chromium real via Playwright, macOS; versão exata e horário no JSON de evidência.
Foram verificados registro repetido e constructor limpo; criação desconectada;
10 reconexões preservando identidade dos filhos; callback único por clique,
Enter e Espaço; todos os estados; propriedades/atributos; validação e recuperação;
registro e evento no realm de iframe; colisão com classe de terceiro; fallback
com Document real sem defaultView; markup antes/depois do registro; foco,
explicações e preservação de live region.

Comparação com o fallback nos temas escuro e claro, em 280/360/480/720 px.
As imagens foram inspecionadas; geometria/cores de 11 casos comparadas por
propriedades computadas. Sem overflow horizontal nas larguras ensaiadas;
explicações por foco dentro da viewport; sem erros de página ou console.
A página de comparação empilha os dois exemplos abaixo de 720 px para não
reduzir cada amostra a um painel abaixo da largura mínima do produto.

A evidência é do componente, não de todas as telas do painel. Escalas 125–200%,
leitor de tela e execução nos runtimes Adobe: NOT RUN.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        FAIL — types e lint do recorte PASS; 4 erros globais anteriores
Unit tests:        62/62 no recorte; suite geral 1681/1730
Contract tests:    PASS no recorte (incluído nos 62)
Golden tests:      PASS — comparação browser + screenshots de componente
AE host:           NOT RUN — novo componente não instalado/testado no CEP
Premiere host:     NOT RUN — novo componente não instalado/testado no UXP
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE

Overall: NOT READY — release/adoção ampla ainda não aprovados
Blocking evidence:
- Smoke do componente nos dois hosts Adobe.
- Lint global e 49 falhas da suíte geral.
```

## Continuação da reestruturação

1. Validar a primeira primitiva nos hosts, com clique/Enter/Espaço, mudança de
   estado, foco/motivo, remontagem e painel estreito; registrar runtime e versão.
2. Inventariar e migrar um fluxo consumidor por vez. Os apps usam principalmente
   `shell.button()`, cujo retorno e semântica de disabled diferem deste controller;
   essa migração não está feita por efeito da mudança em `createActionButton`.
3. Migrar o próximo componente com fallback e contrato preservado, usando
   `elements/` e as primitivas comuns. Não criar componentes vazios antecipadamente.
4. Substituir chamadas nos consumidores apenas após paridade comprovada. Remover
   builders antigos somente quando não houver consumidores restantes.

Pesquisa de capacidades: [moti-button-web-components.md](../../research/moti-button-web-components.md).
Plano e reversão: [plano.md](plano.md).
