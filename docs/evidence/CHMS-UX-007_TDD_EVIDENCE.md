# CHMS-UX-007 — ponte interna Premiere: evidência TDD

Data: 2026-09-05

Fonte normativa: `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, A2.3, A2.5, A2.8 e A12.

Status agregado: `PARTIAL`. Não é uma feature disponível no painel.

## Escopo implementado

- `createPremiereLiveControls` com `inspect`, `read`, `update` e `reveal`;
- manifesto versionado com paridade de ids, ordem e rótulos pt-BR/en-US;
- leitura/escrita de parâmetros existentes: slider, angle, RGBA, checkbox,
  dropdown e point representado por dois slots escalares X/Y;
- ausência de manifesto, APIs, slots ou correspondência inequívoca devolve
  `CONTROLS_HOST_UNSUPPORTED`, texto normativo e ação de seleção capability-gated;
- preflight de valores/metadados, snapshot de payload antes da fila e recusa de
  accessors sem executá-los; dropdown malformado recebe `INVALID_PRESET`;
- fingerprint obrigatório por update e fila por Project entre instâncias do
  serviço; divergência amostrada recusa a escrita;
- rejeição integral de updates que alterem parâmetros animados; nenhuma key
  ou interpolação é removida/recriada por este módulo;
- uma transação por chamada efetiva, nenhuma em no-op; keyframes e Actions
  nascem dentro da transação síncrona sob `lockedAccess`;
- rechecagem conservadora do componente sob lock, abortando troca/reorder;
- readback dos valores retidos pelo host e `adjustedParamIds` em clamp;
- falha pós-commit explicitamente distingue mutação executada e necessidade
  de conferir o histórico de Undo, sem simular rollback;
- seleção com `await`, compatível com retorno Promise anterior a 26.3 e boolean
  desde 26.3. `reveal` seleciona o item, não abre/foca Essential Graphics.

O rascunho arquivado em `wip/premiere-live-controls` foi recuperado do commit
`ce6cd5c963237f108d3851cb589c5a55f11f09f8` e completado localmente sobre `Codex`.
Os tipos-base já estavam integrados; esta continuação corrigiu a união de
retorno de `Sequence.setSelection`. Nenhum commit ou push foi feito neste ciclo.

## RED → GREEN observado

| Etapa | RED / achado | GREEN |
|---|---|---|
| Rascunho inicial | `ERR_MODULE_NOT_FOUND`; runtime ainda ausente | módulo completo compila e testes básicos executam |
| Escrita animada | fixture original exigia alterar keys sem política temporal/interpolação | jornada positiva estática; jornada animada prova zero escrita |
| Falhas da fronteira | 32/34: option `null` gerava TypeError; `isTimeVarying` stale escapava cru | 34/34 com validação e fallback estável |
| Revisão de segurança | fingerprint opcional e identidade não rechecados no commit | fingerprint obrigatório, gate `target-changed`, regressões de troca/reorder |
| Representação de point | risco de assumir PointF nativo como dois escalares | teste explícito de fallback incompatível, sem conversão inventada |

As revisões independentes foram estáticas/read-only; os testes abaixo foram
executados pelo agente integrador, não pelos revisores.

## Verificação focada executada

```powershell
npx.cmd tsc -b apps/premiere-uxp --pretty false
node --test --experimental-test-coverage --test-coverage-include="apps/premiere-uxp/dist/host/src/live-controls.js" apps/premiere-uxp/tests/live-controls.test.mjs
npx.cmd eslint apps/premiere-uxp/host/src/live-controls.ts apps/premiere-uxp/host/src/premiere-api.ts apps/premiere-uxp/tests/live-controls.test.mjs
npm.cmd run check
git diff --check
```

- Typecheck Premiere: `PASS`.
- Lint focado e `git diff --check`: `PASS`.
- Live Controls: **37/37 PASS**.
- Cobertura do módulo compilado: **90,91 % linhas, 82,25 % branches,
  98,04 % funções**. Cobertura não comprova comportamento de objetos UXP reais.
- Check completo anterior desta mesma continuação: `PASS`, 1027/1027 testes,
  antes dos últimos hardenings e das novas alterações paralelas do AE.
- Check intermediário após hardening: `FAIL` no lint de alteração paralela,
  `apps/after-effects-cep/host/src/live-preset.jsx`, `MotionLiveControls` não
  declarado nos globals (linhas 170/186 naquele momento). Depois que o trabalho
  paralelo corrigiu os globals, o check avançou a 1034/1035: faltava documentar
  `MotionLivePreset` no inventário de `tests/build-output.test.mjs`.
- O integrador conferiu esse módulo interno (sem dispatch ou Undo próprio) e
  acrescentou a entrada justificada ao inventário exato, sem desabilitar o gate.
- **Check final: PASS, 1035/1035 testes**, lint/subset ExtendScript, typecheck,
  build, validate, 68 pares de contraste e skills (14 skills, 31 arquivos,
  42 routing evals). Snapshot compartilhado; nenhum desses números prova host.

## Integração ainda não entregue

1. CHMS-045: renderer e fixtures MOGRT reais com campo interno de versão/preset;
   manifesto fornecido à ponte não autentica sozinho o item aplicado.
2. Resolução atual de projeto/sequence/item e vínculo com RigMetadata; versão,
   identidade e domínio temporal devem ser verificados pelo consumidor.
3. Dispatcher, schema/envelope e Inspector: renderizar somente controles reais,
   exibir o fallback e ligar o botão à seleção do item.
4. UX-008: sincronização governada, indicador de edição externa, descarte de
   respostas obsoletas e coordenação de mudanças enquanto uma leitura aguarda.
5. Um Undo por gesto de drag. A ponte hoje garante apenas uma transação por
   chamada; não coalesce uma sequência de eventos de arraste.
6. Prova em Premiere real. O módulo compila para o `dist` do workspace usado
   pelos testes, mas não tem import pelo cliente/adapter do painel distribuído.

Nenhuma dessas lacunas foi marcada como implementada por causa do build.
Writes em PointF nativo e em parâmetros animados permanecem fora deste contrato.

## Roteiro real obrigatório — NOT RUN

Preparar projeto `.prproj` pequeno e MOGRT da suíte conhecido, não mídia pessoal.
Registrar host/build exatos, OS/arquitetura, commit+dirty state, versão/checksum
do MOGRT, seleção, CTI e valores iniciais. Executar em 25.6/26.2/26.3+ e nos
sistemas da matriz; não inferir compatibilidade só pela documentação.

1. Confirmar campo interno de versão/preset, matchName único, ordem, rótulos e
   slots de slider/angle/color/checkbox/dropdown/point X/Y do arquivo real.
2. Resolver projeto, sequência e item novamente por operação e produzir
   TickTime no domínio do parâmetro. Testar item deslocado e com in-point cortado.
3. Ler, fechar o plugin, editar no host, reabrir e ler o valor novo. Update com
   fingerprint anterior deve falhar antes da transação.
4. Atualizar valores estáticos com o fingerprint atual. Confirmar valor no
   host e no readback; um Undo restaura exatamente o snapshot anterior.
5. Repetir os mesmos valores: nenhum Undo adicional. Confirmar que CTI e
   seleção não mudam durante inspect/read/update.
6. Animar um controle e tentar update misto: todos os valores/keys permanecem
   intactos; fallback dirige ao item. Validar seleção tanto no retorno Promise
   legado quanto no retorno boolean, sem prometer foco do painel Adobe.
7. Reordenar antes da chamada: resolver novamente. Trocar/reordenar durante a
   leitura: recusar `target-changed`. Registrar se o host fornece wrappers
   estáveis; wrappers diferentes devem bloquear, nunca escrever por suposição.
8. Remover componente/slot, duplicar matchName, trocar versão/preset ou idioma:
   ausência/mismatch bloqueia e não cria sliders fictícios.
9. Simular rejeição de transaction/readback: UI informa se houve commit e não
   faz retry cego. Cancelar/switch de projeto deve ser tratado pelo consumidor.
10. Medir 40 ms de leitura e 120 ms de commit na máquina de referência,
    incluindo serialização/dispatch real; tempos do harness não servem.

## Limite de evidência

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1035/1035 no check integrado; 37/37 focados
Contract tests:    37/37 da ponte com doubles; painel/dispatch não integrados
Golden tests:      NOT APPLICABLE — nenhum golden Adobe produzido nesta fatia
AE host:           NOT RUN — sem alteração de comportamento AE nesta fatia
Premiere host:     NOT RUN — nenhuma versão/OS/fixture observada
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE — sem release; módulo interno não ligado ao painel

Overall: NOT READY
Blocking evidence:
- Integrar renderer, identidade/versionamento, dispatcher e Inspector.
- Validar wrappers, domínio temporal, Undo e editabilidade em Premiere real.
```

Pesquisa e decisões: [premiere-live-controls.md](../research/premiere-live-controls.md).

## Autoavaliação do handoff

```text
AGENT SELF-EVALUATION REPORT
Summary: 3.6/5; ponte testada, entrega do produto ainda parcial.
Accuracy: 4/5 — APIs primárias e 37 testes; faltam wrappers/tempo/Undo reais.
  Melhoria: executar o roteiro com MOGRT versionado no Premiere.
Completeness: 3/5 — runtime pronto para integração; Inspector/renderer ausentes.
  Melhoria: ligar CHMS-045, dispatcher e Inspector antes de declarar UX-007 Done.
Clarity: 4/5 — PARTIAL e NOT RUN explícitos; o registro técnico é extenso.
  Melhoria aplicada: resumo final curto com link para este registro.
Actionability: 3/5 — comandos e roteiro reproduzíveis; ainda não utilizável no painel.
  Melhoria: concluir o primeiro fluxo consumidor com fixture real.
Conciseness: 4/5 — detalhes auditáveis, mas limites repetidos em pesquisa/QA/evidência.
  Melhoria aplicada: handoff evita repetir os detalhes de implementação.
OVERALL: 3.6/5
CRITICAL ISSUES (axes <= 2): None; lacunas de integração continuam abertas.
Self-check: avaliação compatível com o pedido de continuidade, não com conclusão total.
TOP IMPROVEMENTS: 1. Fluxo consumidor. 2. Prova real de identidade/Undo/tempo.
VERDICT: entregar como progresso parcial, sem alegação de produto concluído.
```
