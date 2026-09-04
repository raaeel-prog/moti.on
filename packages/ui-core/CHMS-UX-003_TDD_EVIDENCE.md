# CHMS-UX-003 — evidência TDD

Data: 2026-09-03

Fonte normativa: `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, especialmente A5, A6,
A7 e o aceite do backlog CHMS-UX-003.

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Jornadas cobertas

- aplicar Quick por clique/`Enter`, abrir Advanced por affordance,
  `Alt`+clique/`Alt+Enter` e pedir preview pelo atalho remapeável (padrão `?`);
- atrasar o spinner do tile por 180 ms, confirmar por 700 ms e preservar
  marcas visíveis para aplicado e indisponível;
- navegar o grid com uma parada de Tab, setas, `Home` e `End`;
- ajustar slider por range, campo numérico, setas, `Shift`, `Page Up/Down`,
  `Home`/`End` e reset por duplo clique;
- escolher chip por mouse/teclado, pular opção indisponível e não roubar foco
  em atualização programática;
- abrir/fechar popover e gaveta com retorno de foco e trap somente em overlay;
- anunciar toast, manter ação por pelo menos 8 s, fixar ao foco e limitar a
  região a três itens;
- representar `default`, `loading`, `empty`, `success`, `warning`, `error` e
  `unsupported`, sempre com texto para estados não padrão e motivo obrigatório
  quando indisponível.

## RED → GREEN observado

| Ciclo | RED | Correção / GREEN |
|---|---|---|
| Bootstrap | `ERR_MODULE_NOT_FOUND` para `dist/components.js` | API e CSS do kit criados; 21/21. |
| Ordem de foco | 21/22; gaveta agrupava foco por tag | travessia única da árvore na ordem DOM. |
| Mutação desabilitada | 30/31; campo numérico mantinha rascunho proibido | restauração imediata do valor canônico. |
| Contratos UXP | 25/32; 7 falhas de foco, visibilidade, bubbling, scroll, range e foco programático | fallback `data-hidden`, filtro de `animationend`, assinatura Adobe de scroll, validação externa e foco preservado; 32/32. |
| CSS UXP | 0/1; `display:grid` e seletores não documentados | layout Flexbox e seletores básicos; 32/32. |
| Runtime sem animação | 31/34; `<label for>` e encerramento dependiam do browser | foco explícito e timeout de segurança injetável; 34/34. |
| Semântica redundante | 0/4 focados; ancestral `aria-hidden`, live regions aninhadas, chips só por ARIA/cor e variável CSS morta | range exposto, uma live region por toast, marcadores visíveis e atributo removido; 34/34. |
| Bloqueio e foco | 32/35; motivo de chips não estava associado, `loading/unsupported` ainda mutava slider/chips e popover sem alvo não recebia foco | descrições por controle, gate comum, `data-hidden`, nome explícito do slider e foco no diálogo; 35/35. |
| Paridade de ponteiro | teste focado 0/1; `Alt`+clique executava Quick | evento de ponteiro respeita o modificador e abre Advanced; teste focado 1/1, suíte 35/35. |
| Foco visual | teste CSS focado 0/1; diálogo usado como fallback não tinha anel próprio | `:focus` cobre popover/gaveta sem depender de seletor ausente no UXP; teste focado 1/1. |
| Atalho configurável | teste focado 0/1; `?` era fixo | `previewKey` remapeia ou desliga a tecla única; suíte 36/36. |
| Feedback do tile | 0/2; sucesso persistia como `✓` e não havia delay/forma de execução e indisponibilidade | scheduler injetável aplica 180/700 ms, `✓` transitório, `●` persistente em accent e marcador indisponível; suíte 37/37. |

## Cobertura

Comando:

```powershell
node --experimental-test-coverage --test packages/ui-core/tests/components.test.mjs
```

Resultado final do módulo `dist/components.js`:

- linhas: **98,90 %**;
- branches: **93,67 %**;
- funções: **97,73 %**.

Agregado do comando, incluindo o fake DOM: **96,59 %** de linhas,
**93,80 %** de branches e **95,51 %** de funções.

## Checks executados durante o ciclo

- `npx.cmd tsc -b packages/ui-core --pretty false` — `PASS`;
- `node --test packages/ui-core/tests/components.test.mjs` — `PASS`, 37/37;
- `node --test packages/ui-core/tests/*.test.mjs` — `PASS`, 113/113;
- cobertura focada acima — `PASS`;
- `npm.cmd run check` — `PASS`, incluindo lint, typecheck, build, validação,
  68 pares de contraste, 893/893 testes e validação de skills;
- `node scripts/build.mjs` — `PASS`; os temas de AE/Premiere ficaram idênticos
  no SHA-256
  `3853C5ADA91D6CFA27717F0C712757320F973BAE8A2443D8DF82C863BA6EDD52`.

## Limites da evidência

- Os testes usam DOM determinístico, não After Effects CEP nem Premiere UXP.
- Nenhum resultado acima prova render, leitor de tela, DPI, performance ou
  lifecycle em host Adobe.
- Não foi criado checkpoint commit durante os ciclos RED/GREEN porque outros
  agentes compartilhavam a mesma branch, worktree e index. Incluir alterações
  alheias num checkpoint seria uma evidência pior do que registrar os comandos
  e resultados exatos.
