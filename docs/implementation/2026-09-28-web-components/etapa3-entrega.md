# Web Components — etapa 3: notificações

Data: 29/09/2026. Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

As notificações existentes do After Effects agora usam `moti-toast` quando o
runtime oferece Custom Elements. A fila continua sob responsabilidade de
`createToastRegion`; o elemento novo cuida da apresentação. O contrato público
`ToastHandle` e a API de `createFeedbackController` permanecem disponíveis.

## Implementação e compatibilidade

- `packages/ui-core/src/elements/moti-toast.ts`: registro explícito por documento,
  sem globais DOM durante import. Construtor sem mutações, montagem fora do
  construtor, reconexão idempotente. Usa as mesmas capacidades pesquisadas para
  moti-button: `defaultView`, `HTMLElement`, `Event`, `customElements.define/get`.
- `packages/ui-core/src/elements/toast-view.ts`: montagem compartilhada entre
  elemento nativo e fallback `<article>`, mesmas classes/ARIA/movimento. Mantém
  nós de mensagem, detalhe e ações; mudar conteúdo ou idioma não recria botões.
  Detalhe ausente ocupa um nó oculto para permitir inclusão posterior sem mover
  a ação focada; CSS preserva sua ausência visual.
- `components.ts`: wrapper interno passa pela nova apresentação. A região mantém
  limite de três, fila, deduplicação, tempo restante, hover/foco, pin, persistência
  de erros recuperáveis, saída por animationend ou timeout, clear/dispose e
  callbacks inativos quando fechados/descartados/aguardando.
- Traduções e dados inválidos são rejeitados antes de modificar a fila ou os
  rótulos existentes. O registro de terceiro com o mesmo nome não é usado como
  se fosse nosso; ausência de capacidade ou falha de construção conserva o
  fallback nativo. Erros de entrada continuam sendo erros do chamador.
- `index.ts` exporta `registerMotiToast`, `MotiToast` e `MotiToastConstructor`.
  Testes novos em `packages/ui-core/tests/moti-toast.test.mjs`.

Não foi introduzido Shadow DOM, biblioteca, polyfill, flag de Spectrum/CSS,
acesso a filesystem, rede ou chamada Adobe. O Premiere ainda não usa a região de
feedback; seu bundle e suas telas de suporte foram conferidos contra regressões.
Sliders/chips continuam na arquitetura anterior: seus builders ainda não são
consumidos diretamente pelos apps, por isso esta fatia priorizou notificações
que já chegam aos usuários.

## Contrato do elemento

O caminho recomendado para o app continua sendo a região existente:

```ts
const region = createToastRegion(document, {
  id: "results", label: "Notificações", dismissLabel: "Fechar"
});
mount.appendChild(region.element);
region.push({ message: "Operação concluída", state: "success", stateLabel: "Concluído" });
```

O elemento também aceita `message`, `detail`, `tone`, `state`, `state-label`,
`dismiss-label` e `assertive`. As propriedades equivalentes usam camelCase.
`setState(state, label)` valida antes de alterar atributos; `updateLabels()`
atualiza o botão de fechamento e o estado sem substituir controles. Não se
permite `assertive` fora do estado error. Atributos sequenciais incompletos
marcam `data-invalid` e bloqueiam ações até chegarem dados válidos.

Para uso declarativo independente, registrar antes de criar a tag, informar
`message` e `dismiss-label` e escutar o evento `dismiss-request` (com bubbling).
O elemento independente pede fechamento; o consumidor decide quando removê-lo.
Não possui fila ou timer próprios. Acessar controles antes de fornecer um
contrato válido falha com validação. `configure()` é a integração interna do
wrapper e não deve ser chamado novamente em um elemento já inicializado.

Na região, mudanças cosméticas do elemento não reiniciam duração, deduplicação
nem política de persistência. Esses dados pertencem ao pedido original da
região. Remover/reinserir um nó ao percorrer a fila não implica descarte.

## Verificação executada

| Gate | Resultado |
|---|---|
| `npm run build` | PASS: bundles AE e Premiere |
| `npm run typecheck` | PASS |
| Lint de componentes/index/novos arquivos/teste | PASS |
| `npm run check` antes e depois | FAIL: mesmos quatro erros globais de lint |
| `npm run validate` | PASS |
| `node scripts/check-extendscript.mjs` | PASS: 77 arquivos |
| `npm run a11y:contrast` | PASS: 88 pares |
| `npm run skills:validate` | PASS: 14 skills, 31 arquivos, 42 rotas |
| Testes focados | PASS: 72/72 |
| `npm test` | FAIL: 1709/1758; mesmas 49 falhas nominais da etapa 2 |
| `verify-toast.mjs` | PASS: 33/33; 16 screenshots |
| `verify-panels.mjs` | PASS: 93/93; 66 screenshots |
| Adobe After Effects/CEP real | NOT RUN |
| Adobe Premiere/UXP real | NOT RUN |
| Leitor de tela, escalas adicionais e desempenho no host | NOT RUN |

Comando do recorte:

```text
node --test packages/ui-core/tests/components.test.mjs packages/ui-core/tests/feedback.test.mjs packages/ui-core/tests/moti-button.test.mjs packages/ui-core/tests/moti-toast.test.mjs apps/after-effects-cep/tests/support-views.test.mjs
```

Os quatro erros globais continuam nos trechos anteriores: dois `any` em
`host-adapter.ts`, um `any` na sincronização de tema do main AE, e `MotionJson`
não usado no teste text-vertical-pulse. Nenhuma falha nova na lista nominal da
suíte em comparação com o log preservado da etapa 2. Não se afirma que todos os
problemas globais foram diagnosticados ou corrigidos por esta migração.

### Browser e revisão visual

Chromium real com o package compilado; versões/horários/hash no JSON de evidência.
Cobertos: import sem DOM, registro/constructor, instância real, atributos e
propriedades, bloqueio/recuperação, atualização de idioma sem perder foco,
reconexão dez vezes, fila com tempo restante, dedup de item aguardando,
hover+foco, retorno à origem, callbacks antigos, markup antes/depois do registro,
evento declarativo, iframe com classe/controles/Event do próprio realm,
colisão com classe de terceiro, fallback e Enter/Espaço sem duplicação.

Comparação nativo/fallback em PT-BR/EN, claro/escuro e 280/360/480/720 px:
geometria, tamanho dos controles, rótulos sem corte, cores e screenshots.
Amostras visuais escuras/claras foram inspecionadas. A verificação dos bundles
AE/Premiere usa HTML/CSS/JS de produção com somente a fronteira Adobe simulada;
confirma `moti-toast` nos resultados do AE, foco, alvos de clique livres sob
notificações e as telas de suporte migradas anteriormente.

A evidência Chromium não representa execução dentro de um host Adobe. Não
houve instalação/publicação nem alteração de projetos do usuário nesta etapa.

## Evidência, revisão e reversão

Diretório `artifacts/web-components-stage3/`:

- `source-before/` e `changes.diff`: fontes anteriores e revisão da etapa;
- logs de cada gate e `tests-summary.txt` com comparação das falhas;
- `verify-toast.mjs`, `browser-toast-results.json/.md` e 16 PNGs;
- `verify-panels.mjs`, `browser-panels-results.json/.md` e capturas dos bundles,
  incluindo `ae-native-toast-integration.png`;
- `changed-files.json`: arquivos novos/alterados.

Workspace sem Git. Para reverter, restaurar os arquivos de source-before,
retirar apenas os módulos/teste novos listados no diff e compilar novamente.

```text
VERIFICATION REPORT
Build:             PASS
Static validation: PASS
Types/Lint:        FAIL — types e lint do recorte PASS; 4 erros globais anteriores
Unit/contract:     PASS 72/72 no recorte; suite geral FAIL 1709/1758
Browser:           PASS 33/33 componente + 93/93 painéis
AE host:           NOT RUN
Premiere host:     NOT RUN
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE
Overall:           IMPLEMENTED_NOT_HOST_VERIFIED
```
