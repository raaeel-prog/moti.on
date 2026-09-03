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
| Matemática de transform 3D | `PASS` automatizado | Composição medida contra o host (erro 5,684e-14) e agora também a decomposição inversa: round-trip em treze rotações com erro abaixo de 1e-9, mais paridade entre a versão do host e a embutida na expressão do Look At |
| Rollback dos comandos mutantes | `PASS` automatizado | Auditoria dos 34 arquivos de comando; os três que não tinham rollback foram corrigidos e têm teste que falha a escrita de propósito |
| Break Shape (`ae.shape.break`) | `PASS` automatizado | Host, descriptor, interface e 10 testes focados; a preservação de aparência é medida reconstruindo a cadeia de transforms, não afirmada. Smoke nos hosts: `NOT RUN` |
| Effector (`ae.rig.effector`) | `PASS` automatizado | Host, descriptor, interface e 10 testes focados; a fórmula de influência é extraída do template e avaliada, não reescrita no teste. Smoke nos hosts: `NOT RUN` |
| Grupo de Undo não aninhado | `PASS` automatizado | `undo-nao-aninha.test.mjs` proíbe `beginUndoGroup` dentro de comando: o dispatcher já abre o grupo, com o rótulo localizado, e o After Effects não aninha — um `endUndoGroup` interno fecha o de fora no meio da operação. O defeito reapareceu três vezes (`keys-reverse`/`keys-clone`, depois `parallax-advanced`, depois cinco comandos de uma vez, incluindo o destrutivo `ae.project.clean`). O teste também confirma que o dispatcher continua sendo o dono do grupo, para a regra não passar a exigir o contrário. |
| Ícones distintos | `PASS` automatizado | Havia guarda para o glifo textual e não para o desenho SVG — e três ferramentas (Formas, Illustrator para vetor, Texto para vetor) compartilhavam o mesmo caminho, ficando indistinguíveis no dock estreito, onde o rótulo some. Agora os dois mapas são cobertos. |
| Coerência dos descriptors | `PASS` automatizado | Nova invariante: comando que muta não pode declarar `supportsDryRun`. O dispatcher recusa `dryRun` quando `mutates` é verdadeiro, então a declaração era uma promessa nunca cumprida — o painel ofereceria a opção e receberia `CAPABILITY_UNAVAILABLE`. `ae.project.clean` declarava as duas; a prévia dele existe por outro caminho (`removeConfirmed: false`). |
| Argumentos padrão do painel | `PASS` automatizado | `padroes-aceitos.test.mjs` roda o preflight do host com os padrões lidos do próprio `main.ts`. Existe por um defeito real: a ferramenta Kinetic mandava `overshoot: true` para um host que exige número 0–10 e `splitMode: "word"` para um host que só aceita `"words"` — recusa em toda execução, e sem controle na tela para corrigir. Toda chamada é avaliada ou declarada como não avaliável, para o guarda não ter ponto cego. |
| Registro no log de diagnóstico | `PASS` automatizado | Onze chamadas ao host não registravam a resposta — cinco prévias, Kinetic, Ease, Reverse/Clone Keys, Time Controller e Marker Loop. Um erro nelas não deixava rastro na view de Diagnóstico. Agora todas registram, e um teste prende a regra. |
| Telas completas | `PASS` automatizado | Auditoria de campo-do-draft contra controle-na-tela: Loop por marcadores tinha cinco campos e nenhum controle, a Onda escondia `phase` e as Formas escondiam as duas cores. Todos expostos. |
| CHMS-023 (Parallax completo) | `PASS` automatizado | Foco, zoom, wiggle e bake com host, descriptor, interface e 13 testes focados. O host foi **reescrito**: a versão anterior abria grupo de Undo dentro do `run` (aninhando no do dispatcher), achava a câmera montando o nome dela com fallback literal para "Camera 1", usava `Number(x) || padrão` (que troca um zero legítimo pelo padrão) e escrevia expressão sem cabeçalho gerenciado e sem checar `expressionError`. Cada um desses tem teste. Smoke nos hosts: `NOT RUN` |
| Cobertura painel↔comandos | `PASS` automatizado | `tests/painel-cobre-comandos.test.mjs` liga o registro de comandos ao registro de ferramentas nos dois sentidos. Existe por uma regressão real: uma reescrita do painel removeu 19 ferramentas de uma vez e o gate continuou verde, porque host, descriptors e tipos seguiam coerentes. O guarda foi verificado injetando a regressão. |
| Catálogo pt-BR | `PASS` automatizado | 55 chaves tinham a própria chave como valor e 29 tinham texto inglês — essas últimas silenciadas por entradas na allowlist do teste de tradução. Traduzidas, e a allowlist agora só contém unidade e nome próprio. A unidade de quadro, que aparecia como "q", "qd" e "frames" conforme a ferramenta, foi unificada em `fr`/`qd`. |
| CHMS-024 (transições de câmera) | `PASS` automatizado | Onze presets com host, descriptor, interface e 10 testes focados. Smoke nos hosts: `NOT RUN` |
| CHMS-026 (Cylinder e Cube) | `PASS` automatizado | Os dois com host, descriptor, interface e 13 testes focados; a geometria é medida por `MotionTransform`, não afirmada. Smoke nos hosts: `NOT RUN` |
| CHMS-027 (Glitch, Wave, Tile) | `PASS` automatizado | Os três com host, descriptor, interface e 16 testes focados; Echo, do mesmo item, já estava. Smoke nos hosts: `NOT RUN` |
| Escopo P2 completo em código | `PASS` automatizado | Os treze itens da seção P2 têm host, descriptor, interface e teste: anchor aligner, curve editor, operações de keys, Time, Kinetic, Marker Loop, Orbit, Look At, Quick Parallax, Shapes, Trim Path, Echo e Fast Edit. Smoke nos hosts: `NOT RUN` |
| CHMS-021 (Shapes e Trim Path) | `PASS` automatizado | `ae.shape.library` e `ae.shape.trim-path` com host, descriptor, interface e 18 testes focados; smoke nos hosts: `NOT RUN` |
| Escopo P1 completo em código | `PASS` automatizado | Os quinze comandos da seção P1 do master spec têm descriptor, host, interface e teste; `ae.animate.inertial`, `ae.animate.jump` e `ae.keys.copy`/`ae.keys.paste` fecharam a lista. Smoke nos hosts: `NOT RUN` |
| After Effects, build atual | `PASS` parcial | AE 26.3x87/CEP 12.0.1/Windows 11: inicialização limpa, contexto, capabilities, Unicode, demo, rótulo de Undo pt-BR e Undo em um passo |
| Premiere Pro, build atual | `NOT RUN` | O plugin **está instalado e habilitado** no Premiere 26.3.2 (UPIA, sem UDT e sem elevação) e a aba `Moti.on` aparece no workspace, mas o painel não foi instanciado — sem `panel.started` no log, nada do runtime está verificado. O bloqueio que restava era o Developer Mode, que exige elevação; ele não é necessário para instalar, só para depurar. O ajuste de lifecycle/`plugin.create` tem cobertura automatizada e pesquisa em `docs/research/premiere-uxp-entrypoints-lifecycle.md`, mas ainda precisa de smoke no Premiere. |
| QA visual/acessível nos hosts | `PASS` parcial | Screenshot/interação em largura compacta no AE e **navegação por teclado medida** (ver Gate de interface); matriz de larguras/DPI, leitor de tela e todo o Premiere continuam `NOT RUN` |
| Revisão visual no browser | `NOT RUN` | Nenhuma captura ou interação de browser foi executada neste ciclo |
| Pesquisa oficial de ambiente, picker e capabilities UXP | `PASS` | Registros `premiere-uxp-host-environment-and-diagnostics-export.md` e `premiere-uxp-capability-probes.md`; não fecham gate de host |

O build Moti.on reproduziu um `FAIL` do `<ScriptPath>` com modal de sintaxe na linha 1. Após remover o elemento opcional, rebuild/reinstalação e reinício limpo, o bootstrap por `$.evalFile` e os comandos acima passaram. A evidência vale somente para AE 26.3x87/CEP 12.0.1/Windows 11.

## Gate de interface

- [x] `PASS` parcial — base `#1D1D1D` e tokens observados no AE 26.3/Windows 11 em largura compacta.
- [x] `PASS` parcial — uma tarefa principal por view no AE medido.
- [x] `PASS` parcial — sem dashboard com todos os módulos no AE medido.
- [ ] `NOT RUN` — 280, 360, 480 e 720 px testados.
- [x] `PASS` — focus-visible e navegação por teclado, no AE 26.3x87/CEP 12.0.1/Windows 11 em 2026-08-30, com teclas entregues pelo Chromium via `Input.dispatchKeyEvent` (CDP 8091), não por evento sintético:
  - 4 abas, 1 tabulável, 1 selecionada — a navegação é uma parada de Tab só;
  - a grade 3×3 do alinhador é **uma** parada, não nove: uma volta completa de Tab tem 9 paradas, 1 delas na grade;
  - `ArrowRight` moveu Centro → Meio direito e `ArrowDown` moveu Meio direito → Inferior direito, com foco e `aria-checked` juntos;
  - o foco sobreviveu ao redesenho que a seleção dispara, restaurado por `data-focus-key` no controle equivalente do nó novo;
  - as setas não rolaram o painel (`scrollTop` 0 → 0);
  - as 9 paradas da volta trazem `outline` sólido; nenhuma sem contorno de foco.
- [ ] `NOT RUN` — leitor de tela (NVDA/Narrator) ainda não foi executado; ARIA correta no DOM não prova o que é anunciado.
- [x] `PASS` automatizado — contraste da paleta inteira sobre as quatro superfícies, com piso 4.5:1 para texto e 3:1 para o anel de foco. A medição achou duas reprovações que a versão anterior não via, porque só media `--ch-text-muted` sobre duas superfícies: `--ch-text-muted` dava 4.27:1 sobre `--ch-surface-control` e o rótulo do botão primário dava 4.40:1 sobre `--ch-accent-pressed`. Corrigidos para 4.62:1 e 4.68:1.
- [x] `PASS` automatizado — `prefers-reduced-motion` zera `--ch-motion-fast` na raiz, e o teste recusa qualquer `transition` que cronometre fora do token. A versão anterior nomeava dois seletores e já deixava `.ch-tool` escapar.
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
