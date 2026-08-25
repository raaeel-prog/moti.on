# Gates de Verificação dos Agentes

## Regra de evidência

- `PASS`: executado no escopo declarado e aprovado; inclua build/commit, plataforma, host, versão, data e artefato.
- `FAIL`: executado e reprovado; inclua o observado e o esperado.
- `NOT RUN`: ainda sem execução aplicável. Código escrito, pesquisa oficial ou teste com double não autorizam marcar um gate de host como `PASS`.

Uma caixa só pode ser marcada quando a linha contém `PASS` e aponta para evidência. Linhas `NOT RUN` permanecem abertas. O estado agregado do worktree atual é:

| Escopo | Status | Observação |
|---|---|---|
| `npm.cmd run check` após integração | `PASS` | Gate final: lint, typecheck, build, validate, 326/326 testes e skills validate |
| JSON Schemas/validadores do contrato | `PASS` automatizado | Quatro schemas Draft 2020-12, codegen standalone CSP-safe e guards profundos; CHMS-003 `IMPLEMENTED_AND_VERIFIED` |
| Núcleo puro de metadata de rigs | `PASS` automatizado | 24/24 testes focados; CHMS-009 `IMPLEMENTED_NOT_HOST_VERIFIED` porque `Layer.comment`, filesystem e Undo real estão `NOT RUN` |
| After Effects, build atual | `PASS` parcial | AE 26.3x87/CEP 12.0.1/Windows 11: inicialização limpa, contexto, capabilities, Unicode, demo, rótulo de Undo pt-BR e Undo em um passo |
| Premiere Pro, build atual | `NOT RUN` | Pesquisa oficial e doubles não substituem o host |
| QA visual/acessível nos hosts | `PASS` parcial | Screenshot/interação em largura compacta no AE; matriz de larguras/DPI/teclado/leitor e todo o Premiere continuam `NOT RUN` |
| Revisão visual no browser | `NOT RUN` | Nenhuma captura ou interação de browser foi executada neste ciclo |
| Pesquisa oficial de ambiente, picker e capabilities UXP | `PASS` | Registros `premiere-uxp-host-environment-and-diagnostics-export.md` e `premiere-uxp-capability-probes.md`; não fecham gate de host |

O build Moti.on reproduziu um `FAIL` do `<ScriptPath>` com modal de sintaxe na linha 1. Após remover o elemento opcional, rebuild/reinstalação e reinício limpo, o bootstrap por `$.evalFile` e os comandos acima passaram. A evidência vale somente para AE 26.3x87/CEP 12.0.1/Windows 11.

## Gate de interface

- [x] `PASS` parcial — base `#1D1D1D` e tokens observados no AE 26.3/Windows 11 em largura compacta.
- [x] `PASS` parcial — uma tarefa principal por view no AE medido.
- [x] `PASS` parcial — sem dashboard com todos os módulos no AE medido.
- [ ] `NOT RUN` — 280, 360, 480 e 720 px testados.
- [ ] `NOT RUN` — focus-visible e navegação por teclado.
- [ ] `NOT RUN` — loading, empty, disabled, success e error.
- [x] `PASS` parcial — sem overflow horizontal aparente na largura compacta observada; demais larguras continuam abertas.
- [x] `PASS` parcial — screenshot e interação dentro do After Effects; Premiere continua pendente e `NOT RUN`.

## Gate After Effects

- [x] `PASS` automatizado — allowlist, quatro schemas e guards profundos exercitados pelo check integrado; isso não prova o dispatch no AE real.
- [x] `PASS` automatizado — build, typecheck `checkJs` e scanner do subconjunto ExtendScript aprovados no snapshot integrado.
- [x] `PASS` — host script/dispatch executados via `$.evalFile` no AE 26.3x87/CEP 12.0.1/Windows 11; `<ScriptPath>` removido após `FAIL` reproduzido.
- [ ] `NOT RUN` — `matchName` usado quando aplicável.
- [ ] `NOT RUN` — preflight antes da mutação.
- [x] `PASS` — Undo group único da composição demo: um Ctrl+Z removeu comp e camada no ambiente medido.
- [ ] `NOT RUN` — seleção/tempo preservados conforme contrato.
- [ ] `NOT RUN` — Apply repetido é idempotente.
- [ ] `NOT RUN` — fixture real `.aep` aprovada.
- [x] `PASS` — round-trip Unicode e UI pt-BR no build atual, no ambiente medido.
- [x] `PASS` — rótulo localizado `Desfazer Moti.on: criar composição de teste` observado no menu Undo no ambiente medido.
- [ ] `NOT RUN` — reabertura/persistência do projeto.

## Gate Premiere

- [x] `PASS` — API e assinaturas de host/versão/locale, filesystem e transação verificadas na documentação oficial da versão alvo; ver `docs/research/`.
- [ ] `NOT RUN` — capability detection executada no Premiere real.
- [x] `PASS` automatizado — bundle e imports UXP validados, com `require` limitado a `premierepro` e `uxp`; a busca no código atual não encontrou referência a QE/API privada.
- [x] `PASS` automatizado — lint com regras oficiais e testes com doubles aprovados para as fronteiras assíncronas.
- [ ] `NOT RUN` — chamadas assíncronas executadas no Premiere real.
- [ ] `NOT RUN` — transação/locked access executados no host real; o P0 não tem comando mutante, e documentação/doubles sozinhos não fecham esta linha.
- [ ] `NOT RUN` — timebase e objetos stale tratados.
- [ ] `NOT RUN` — fixture real `.prproj` aprovada.
- [x] `PASS` automatizado — package, manifest e permissões mínimas validados depois da integração.

## Gate motion

- [x] `PASS` automatizado — núcleo puro da metadata v1: create/read/update/remove/migrate, canonicalização, base64url, SHA-256 e planos sidecar, com 24/24 testes focados.
- [ ] `NOT RUN` — integração da metadata com `Layer.comment`, filesystem/sidecar atômico, Undo e reabertura no After Effects real.
- [ ] `NOT RUN` — Apply/Adjust/Bake/Remove definidos.
- [ ] `NOT RUN` — keyframe data preservado.
- [ ] `NOT RUN` — parenting e coordinate space testados.
- [ ] `NOT RUN` — random possui seed.
- [ ] `NOT RUN` — Bake mantém visual dentro da tolerância.
- [ ] `NOT RUN` — Remove não apaga conteúdo do usuário.
- [ ] `NOT RUN` — golden estrutural ou visual atualizado.

## Gate assets/IA

- [ ] `NOT RUN` — secrets fora do cliente.
- [ ] `NOT RUN` — provider terms e atribuição preservados.
- [ ] `NOT RUN` — download validado por tamanho, MIME real e checksum.
- [ ] `NOT RUN` — offline, rate limit, cancel e disco cheio testados.
- [ ] `NOT RUN` — transcrição offline não faz chamadas de rede.
- [ ] `NOT RUN` — modelo/native verificado por hash e versão.
- [ ] `NOT RUN` — captions semânticas e visuais separadas.
- [ ] `NOT RUN` — SFX possui licença/proveniência e preview.

## Gate release

- [x] `PASS` — build do worktree integrado concluído em 2026-08-25.
- [ ] `NOT RUN` — reprodutibilidade determinística em ambiente limpo.
- [x] `PASS` — 326/326 testes automáticos aprovados no gate final integrado de 2026-08-25.
- [ ] `NOT RUN` — matriz real de hosts aprovada.
- [ ] `NOT RUN` — pacotes assinados/notarizados quando necessário.
- [ ] `NOT RUN` — instalação limpa, upgrade, downgrade e uninstall.
- [ ] `NOT RUN` — SBOM, notices e checksums.
- [ ] `NOT RUN` — rollback ensaiado.
- [ ] `NOT RUN` — nenhuma claim excede a capacidade testada.
