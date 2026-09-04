# CHMS-UX-004 — evidência TDD

Data: 2026-09-03

Fonte normativa: `docs/ADDENDUM_A_QUICK_UX_SPEC.md`, principalmente A1.1,
A2.3, A9 e o aceite do backlog CHMS-UX-004.

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Escopo entregue

- contratos `QuickProfile`, `QuickContext` e `LiveControlBinding` bilíngues;
- `quickProfile` opcional no `CommandDescriptor` e registry imutável por comando
  e host, sem cadastrar perfis fictícios antes dos presets/assets reais;
- comparação pública de paridade que exige `paramId` e `order` na mesma
  sequência criada pelo adapter;
- opções `mode`, `emitLiveControls` e `targetRigId` no envelope; o cliente
  materializa `mode: "quick"` e `emitLiveControls: true` como defaults;
- schemas estritos de `PresetDefinition` v1 e v2, com preview v2 obrigatório;
- validação semântica de ids, ordens e faixas dos Live Controls;
- migração v1→v2 sem mutação, sem fabricar assets ausentes e sem reutilizar
  checksum/assinatura v1;
- projeção v2→v1 para prova de round-trip;
- gate remoto que exige assinatura, verificador criptográfico injetado e recusa
  campos de código executável antes de chamar o verificador.

## RED → GREEN observado

| Frente | RED | GREEN |
|---|---|---|
| Contracts | import falhou: `PRESET_SCHEMA_VERSION` não existia | 9/9 testes de preset/opções e migração endurecida |
| Registry | import falhou: `createQuickProfileRegistry` não existia | 5/5 testes de perfil, registry e paridade |
| Command client | 18/19; `options` chegava ausente | 19/19; defaults Quick materializados após o gate seguro |
| Gate After Effects | 22/23; opções novas eram recusadas | 23/23; tipos/modos válidos aceitos, inválidos fechados |
| Gate Premiere | 28/29; opções novas eram recusadas | 29/29; mesma fronteira do AE |

Os checkpoints RED/GREEN não viraram commits: outros agentes compartilhavam a
mesma branch, worktree e index. Os comandos/resultados foram preservados aqui
para não misturar alterações alheias num commit artificial.

## Cobertura

Comandos:

```powershell
node --test --experimental-test-coverage --test-coverage-include="packages/contracts/dist/validators.js" "packages/contracts/tests/*.test.mjs"
node --test --experimental-test-coverage --test-coverage-include="packages/command-registry/dist/quick-profile-registry.js" "packages/command-registry/tests/*.test.mjs"
```

Resultados:

- `contracts/dist/validators.js`: **85,32 %** linhas, **76,32 %** branches e
  **93,94 %** funções; suíte de contracts 61/61;
- `command-registry/dist/quick-profile-registry.js`: **80,74 %** linhas,
  **70,21 %** branches e **90,48 %** funções; suíte do registry 26/26.

## Verificação final

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        924/924 passed
Contract tests:    85/85 focused passed
Golden tests:      NOT APPLICABLE
AE host:           NOT RUN — requer instalação/execução em After Effects real
Premiere host:     NOT RUN — requer instalação/execução em Premiere Pro real
Performance:       NOT MEASURED — aplicação Quick por comando entra em UX-005+
Packaging:         PASS — build estrutural; instalação não executada

Overall: NOT READY
Blocking evidence:
- gates automatizados não provam o envelope dentro dos runtimes Adobe reais;
- perfis concretos, derivação contextual, Live Control writers e previews reais
  pertencem às issues consumidoras UX-005, UX-006/007 e UX-011.
```

`npm.cmd run check` passou com lint, verificação ExtendScript, typecheck, build,
validação estrutural, 68 pares de contraste, 924/924 testes e validação das
skills.
