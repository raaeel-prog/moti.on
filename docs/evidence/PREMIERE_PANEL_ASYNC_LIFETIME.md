# Premiere — respostas assíncronas e ciclo de vida do painel

Data: 2026-09-05. Status da correção: `IMPLEMENTED_NOT_HOST_VERIFIED`.

Continuação do Addendum A2.6: a UI não pode conservar uma leitura obsoleta como
fonte da verdade. Este patch protege o painel já distribuído; **não implementa
o polling, Inspector ou renderer MOGRT de UX-007/008**.

## Defeito reproduzido no bundle

O estado de contexto/capabilities/autoteste/busy era global ao módulo. Um pedido
iniciado antes de `destroy` podia repopular esse estado depois de uma nova
montagem. O problema aparecia ao navegar novamente para Context. Além disso,
`show` durante busy ignorava a nova leitura e eventos repetidos de um botão
antigo podiam enviar dois dispatches.

Os primeiros quatro testes do bundle terminaram **1/4 PASS, 3 FAIL**, com:

- `Old project` reaparecendo no painel remontado;
- uma consulta em vez de duas após um novo `show`;
- três consultas em vez de duas após clique repetido no mesmo botão.

## Correção integrada

- Estado isolado por montagem em `client/src/main.ts`.
- Tickets opacos por identidade em `client/src/request-scope.ts`: begin único,
  invalidação e dispose permanente; ticket antigo não libera busy novo.
- `show` invalida entregas anteriores, limpa snapshots e relê o contexto.
- `dispose` invalida antes de remover observers/preferências.
- Contexto, capability probe, autoteste e exportação passam por
  `runPanelRequest`, com descarte de resultados/erros obsoletos e recuperação
  de busy da operação atual em `finally`.
- Invalidação é da **entrega à UI**, não cancelamento de trabalho já autorizado
  no host/filesystem. Exportação cujo picker foi confirmado pode concluir a
  gravação; seu resultado antigo não substitui o status da nova leitura.

Não mudaram layout, controles, permissões nem APIs de host. As skills de UI
orientaram a separação de estado e comunicação; a revisão estática independente
não encontrou regressão bloqueante. Sem navegação ou captura de Adobe real.

## Verificação

```powershell
npx.cmd tsc -b apps/premiere-uxp --pretty false
npm.cmd run build
node --test apps/premiere-uxp/tests/panel-async-lifetime.test.mjs apps/premiere-uxp/tests/request-scope.test.mjs apps/premiere-uxp/tests/live-controls.test.mjs
npm.cmd run check
git diff --check
```

- Tickets: **11/11 PASS**, 100 % linhas/branches/funções na execução do worker.
- Bundle final em Node VM com DOM/UXP doubles: **8/8 PASS**; inclui sucesso e
  falha tardios, remontagem, show, concorrência, autoteste/probe e picker pendente.
- Conjunto focado Premiere acima: **56/56 PASS**.
- Check integrado final deste checkpoint: **1102/1102 PASS**, lint, typecheck,
  build, validate, 68 pares de contraste e 42 routing evals.

Durante o check, o validador confundiu `TODOS` num comentário do AE com `TODO`.
`scripts/work-markers.mjs` agora detecta palavras completas, com fronteiras
Unicode (`MÉTODO` também não é marcador). Três testes confirmam tanto negativos
quanto bloqueio de marcadores reais; o gate não foi desativado.

## Prova de host restante

Com projeto de teste no Premiere, abrir/fechar/reabrir o painel enquanto uma
consulta aguarda, trocar projeto e retornar, repetir cliques e navegar entre
Context/System/Diagnostics. Confirmar que somente a operação vigente atualiza
dados/status, que os botões se recuperam após falha e que picker pendente não
gera mensagem de sucesso referente a outra operação. Registrar versão exata,
OS, build+dirty state e captura; não inferir esse resultado do DOM fake.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1102/1102 integrado; 56/56 Premiere focados
Contract tests:    8/8 bundle/lifecycle; 11/11 tickets; 37/37 Live Controls
Golden tests:      NOT APPLICABLE — nenhuma alteração visual deliberada
AE host:           NOT RUN — correção não altera comando AE
Premiere host:     NOT RUN — nenhuma versão/OS/fixture observada neste patch
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE — nenhum release

Overall: NOT READY
Blocking evidence:
- Executar smoke de lifecycle no Premiere real.
- UX-007/008 ainda precisam de renderer/identidade/Inspector e sincronização.
```
