# CHMS-UX-005 — evidência TDD

Data: 2026-09-04

Fonte normativa: `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, principalmente A1.2,
A1.3, A1.4 e A12.

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Escopo entregue

- derivador puro `deriveQuickDefaults(context, options)`, sem leitura de host,
  relógio, storage ou estado global;
- conversão explícita de segundos para frames no FPS real, com políticas
  `floor`, `nearest` e `ceil`;
- escala espacial pelo menor lado da composição, normalizada para 1080;
- janela temporal iniciada no CTI e limitada pelo fim da composição e, quando
  há seleção, pela duração média disponível informada no `QuickContext`;
- stagger padrão de dois frames, reduzido para nunca extrapolar a janela;
- alvos semânticos por tipo de seleção, estratégia por presença de keyframes e
  eixos 2D/3D;
- resolução de preset por último uso no projeto, último uso global e fábrica,
  sempre restrita ao catálogo disponível;
- intenção de rig `create`, `adjust` ou `ambiguous`, sem escolher
  silenciosamente entre rigs distintos;
- snapshots imutáveis e validação fail-closed de objetos, arrays, accessors,
  Symbols, campos extras e valores fora do domínio.

Perfis Quick concretos não foram cadastrados neste slice: eles dependem dos
presets e previews reais de CHMS-UX-011. O derivador está disponível para ser
composto pelo `QuickProfile.derive` sem inventar ids ou assets.

## Jornadas e fixtures

| Jornada | Resultado esperado |
|---|---|
| Usuário aplica Quick em 24/25/29,97/60 fps | duração em segundos é convertida pelo FPS real, sem assumir 24 ou 30 fps |
| Usuário trabalha em 1080×1920, 1920×1080 ou 3840×2160 | valores espaciais usam, respectivamente, escalas 1, 1 e 2 |
| CTI está próximo do fim da composição/seleção | duração e stagger encolhem e permanecem dentro da janela |
| Seleção mistura texto, shape e AV | alvos são derivados em ordem estável e sem duplicatas |
| Seleção já contém keyframes ou é 3D | modo passa a modificar keyframes e inclui eixo Z |
| Preset recente foi removido | fallback usa global e depois fábrica, nunca id invisível |
| Um ou vários rigs já existem | ajusta o único id ou devolve ambiguidade explícita |

## RED → GREEN observado

| Frente | RED | GREEN |
|---|---|---|
| API pública | import falhou porque `deriveQuickDefaults` ainda não era exportado | módulo e exports compilando; fixtures centrais verdes |
| Janela e stagger | casos de limite foram escritos antes da implementação | janela começa no CTI e o span do stagger cabe na duração |
| Input hostil | 10/11; um Proxy observou duas leituras diretas de `length` | array passa a usar apenas o descriptor de `length`; 11/11 |
| Rig existente | 11/12; `rigIntent` ainda era `undefined` | `create`/`adjust`/`ambiguous` implementados; 12/12 |
| Enumeração reflexiva | o guarda novo já encontrou o hardening paralelo aplicado no worktree | `ownKeys` é consultado uma vez; 13/13 |

Os checkpoints RED/GREEN não viraram commits: outros agentes compartilhavam a
mesma branch, worktree e index. O histórico executado foi preservado neste
arquivo para não misturar mudanças alheias num commit artificial.

## Cobertura e testes focados

Comandos:

```powershell
npm.cmd run typecheck
node --test "packages/command-registry/tests/*.test.mjs"
node --test --experimental-test-coverage --test-coverage-include="packages/command-registry/dist/quick-defaults.js" packages/command-registry/tests/quick-defaults.test.mjs
```

Resultados:

- typecheck: `PASS`;
- suíte completa de `command-registry`: **39/39**;
- testes exclusivos do derivador: **13/13**;
- `quick-defaults.js`: **95,31 %** linhas, **87,34 %** branches e
  **100 %** funções.

## Verificação final

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        941/941 passed
Contract tests:    39/39 command-registry passed
Golden tests:      NOT APPLICABLE
AE host:           NOT RUN — requer aplicação por um comando em After Effects real
Premiere host:     NOT RUN — requer aplicação por um comando em Premiere Pro real
Performance:       NOT MEASURED — orçamento fim a fim depende do consumidor Quick
Packaging:         PASS — build estrutural; instalação não executada

Overall: NOT READY
Blocking evidence:
- o produtor de QuickContext e um comando consumidor ainda não foram exercitados nos hosts;
- perfis concretos, Live Control writers e previews pertencem a UX-006/007/011.
```

`npm.cmd run check` passou com lint, verificação ExtendScript, typecheck, build,
validação estrutural, 68 pares de contraste, 941/941 testes e validação das
skills. A cobertura focada permaneceu em 95,31 % de linhas, 87,34 % de branches
e 100 % de funções para `quick-defaults.js`.

Os testes automatizados provam o contrato puro. Ainda não provam o produtor de
`QuickContext` nos hosts, a aplicação de parâmetros por um comando concreto,
os writers de Live Controls de UX-006/007 ou os previews de UX-011.
