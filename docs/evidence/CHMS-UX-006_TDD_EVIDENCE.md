# CHMS-UX-006 — evidência TDD

Data: 2026-09-04

Fonte normativa: `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, principalmente A2 e A12.

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Escopo entregue

- módulo ES3/ExtendScript `MotionLiveControls`, interno ao bundle AE e sem nova
  superfície de dispatch;
- writer para Slider, Angle, Color, Checkbox, Point e Dropdown, sempre por
  `matchName` e propriedade interna `(1)`;
- nomes localizados no momento da criação, unidade no nome e colisão resolvida
  com sufixo curto do `rigId`;
- Dropdown com `canAddProperty`, `isDropdownEffect`,
  `setPropertyParameters()` e troca obrigatória para o handle retornado;
- fallback de Dropdown para Slider inteiro com opções documentadas no nome;
- registros JSON-safe com nome, `matchName` e índice para persistência dentro de
  `RigMetadata.userOverrides` pelo comando consumidor;
- reader vetorial com fingerprint, resolução nome + tipo antes de índice + tipo,
  refresh de índice após reorder e warning recuperável quando ausente;
- relink explícito após rename, sem restaurar o nome anterior do usuário, com
  reescrita e rollback das expressões indicadas pelo comando;
- updater que preserva keyframes e mudanças manuais, devolve `userOverrides`,
  recria somente controles ausentes e não apaga órfãos;
- rollback de criação, atualização e relink, com `ROLLBACK_FAILED` quando a
  restauração também falha;
- limites de 12 controles por layer e 24 por controller, com planejamento de
  promoção para controller/Control Room.

O módulo deliberadamente não abre Undo Group. O dispatcher e o comando
consumidor continuam responsáveis pelo único Undo da operação completa.

## Jornadas e fixtures

| Jornada | Resultado esperado |
|---|---|
| Seis tipos em ordem não alfabética | efeitos seguem `order`; toda propriedade interna é lida por índice 1 |
| Nome já existe na layer | novo controle recebe `#<rigId curto>` sem tocar o efeito existente |
| Dropdown não expõe a capability | tentativa é removida e substituída por Slider documentado |
| Usuário reordena efeitos | reader encontra pelo nome e atualiza apenas o índice persistido |
| Usuário renomeia efeito | fallback por índice continua lendo; Religar grava o novo nome e reescreve expressões |
| Usuário apaga um controle | `CONTROLS_MISSING`; updater recria somente o ausente |
| Usuário altera valor ou cria keys | valor/keyframes vencem; mudança entra em `userOverrides` |
| Binding deixa de usar um controle | efeito e metadata órfãos permanecem disponíveis para Religar/Limpar |
| Host falha no segundo write | tudo que esta chamada tocou volta ao estado anterior |
| Entrada hostil ou capacidade excedida | falha antes da primeira mutação |

## RED → GREEN observado

| Frente | RED | GREEN |
|---|---|---|
| API e módulo | 0/11; `ENOENT` para `host/src/live-controls.jsx` | writer/reader/updater/relink implementados |
| Rollback do writer | 10/11; efeito cujo `setValue` falhou vazava antes de existir registro | rollback passou a remover todo append após o tamanho inicial; 11/11 |
| Hardening | 12/14; metadata órfã era descartada e `__proto__` passava como `paramId` | órfãos preservados e chaves perigosas recusadas; 14/14 |
| Bundle | teste lia `dist` anterior sem o novo global interno | build regenerado e allowlist interna atualizada; 22/22 no conjunto focado + bundle |

Os checkpoints não viraram commits: outros agentes compartilhavam a mesma
branch, worktree e index. Um commit local misturaria trabalho alheio.

## Verificação executada

```powershell
node --test apps/after-effects-cep/tests/live-controls.test.mjs
npx.cmd eslint apps/after-effects-cep/host/src/live-controls.jsx apps/after-effects-cep/tests/live-controls.test.mjs
npx.cmd tsc -p apps/after-effects-cep/tsconfig.host.json --pretty false
node scripts/check-extendscript.mjs
npm.cmd run build
node --test apps/after-effects-cep/tests/live-controls.test.mjs tests/build-output.test.mjs
npm.cmd run check
```

Resultados finais:

- testes Live Controls: **14/14 PASS**;
- conjunto Live Controls + bundle: **22/22 PASS**;
- lint focado: **PASS**;
- typecheck do host: **PASS**;
- subconjunto ExtendScript: **PASS**;
- build: **PASS**, módulo incluído em `dist/after-effects-cep/host/index.jsx`;
- check integrado: **PASS, 966/966 testes**, 68 pares de contraste e 42 evals
  de routing das skills.

O runner avalia fontes `.jsx` com `new Function`; a cobertura V8 reporta o
harness, não atribui linhas ao arquivo avaliado. Por isso a porcentagem de linha
do módulo está honestamente como `NOT MEASURED`, sem transformar 14 testes de
comportamento em um número falso.

## Limite de evidência

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        966/966 passed; 14/14 focados
AE host:           NOT RUN
Undo em host:      NOT RUN
Localization host: NOT RUN
Performance host:  NOT RUN
Premiere host:     NOT APPLICABLE — pertence a CHMS-UX-007

Overall: IMPLEMENTED_NOT_HOST_VERIFIED
```

Ainda faltam AE 25/26 reais em Windows/macOS, rename/reorder no Effect Controls,
edição e keyframes com o plugin fechado, Undo em um passo dentro de um comando
consumidor e os orçamentos reais de 300 ms para criação e 40 ms para leitura.
