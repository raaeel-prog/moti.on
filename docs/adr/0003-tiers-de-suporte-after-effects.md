# ADR 0003 — Faixas de suporte do After Effects

- **Status:** aceito, com lacuna declarada
- **Data:** 2026-08-24
- **Issue:** CHMS-006

## Contexto

A §4.2 do `docs/MASTER_BUILD_SPEC.md` define quatro faixas de suporte — `full`, `compatible`, `baseline`, `unsupported` — e as amarra a versões **do Premiere Pro**:

| Faixa | Premiere |
|---|---|
| `full` | 26.3+ |
| `compatible` | 26.2 |
| `baseline` | 25.6 – 26.1 |
| `unsupported` | < 25.6 |

**Para o After Effects, a especificação não define faixa nenhuma.** Ela diz apenas "target AE 25.0+" e "CEP 12". O tipo `SupportTier` do contrato é compartilhado entre os dois hosts, então `tierFor("after-effects", version)` precisa devolver alguma coisa — e não havia o que transcrever.

Três respostas erradas estavam disponíveis:

1. **Copiar as faixas do Premiere.** As versões não têm relação: 26.3 significa algo concreto no Premiere e nada no After Effects. Produziria uma matriz que parece informada e não é.
2. **Devolver `full` sempre, sem comentar.** Funciona, e esconde que a decisão foi tomada por omissão. A próxima pessoa a ler o código assumiria que veio da especificação.
3. **Devolver `unsupported` na dúvida.** Bloquearia o plugin em toda instalação de After Effects.

## Decisão

| Faixa | After Effects | Motivo |
|---|---|---|
| `full` | ≥ 25.0.0 | É a versão mínima que o produto declara suportar. Não há, hoje, nenhum recurso do plugin que exija uma versão maior. |
| `unsupported` | < 25.0.0 | Coerente com o `Version="[25.0,99.9]"` do `CSXS/manifest.xml`. |

`compatible` e `baseline` **não são usados** no After Effects. Uma faixa intermediária só faz sentido quando existe um recurso disponível em algumas versões e não em outras, e nenhum recurso do P0 está nessa situação. Inventar a faixa antes do recurso seria classificar instalações por um critério que não corresponde a nada.

Estes valores são **proposta deste ADR**, não transcrição da especificação. `packages/capability-matrix/src/tiers.ts` diz isso no comentário da função, e o teste que cobre as faixas do After Effects se chama *"os tiers do After Effects são proposta registrada, não transcrição"* — para que ninguém leia o código e conclua que veio do documento normativo.

## Consequências

### `unsupported` é praticamente inalcançável nos dois hosts

O manifest CSXS declara `Version="[25.0,99.9]"` e o `host.minVersion` do manifest UXP declara `25.6.0`. Os dois runtimes recusam carregar abaixo disso, então o código que trata `unsupported` quase nunca executa.

Ele existe mesmo assim, por dois motivos. O código não deve depender de uma proteção que vive noutro arquivo — se alguém afrouxar a faixa do manifest, a lógica precisa continuar correta. E a matriz de capacidades é serializada num pacote de diagnóstico, onde `unsupported` é informação legítima sobre um ambiente que ninguém previu.

### Um tier `full` não significa que tudo funciona

Esta é a consequência que mais importa e a mais fácil de esquecer.

O tier responde "quanto deste produto é esperado funcionar nesta instalação", e é **tudo o que a versão decide**. Ele não decide se um comando roda: isso é sonda de símbolo, conforme a §9.

As duas coisas divergem na prática. Um After Effects 25.0 com a preferência *Allow Scripts To Write Files And Access Network* desligada tem tier `full` e `canWriteFiles: false`. Um Premiere 26.3 com o módulo de transcrição indisponível tem tier `full` e a capacidade ausente. Colapsar as duas coisas num número só é exatamente o que produz um botão desabilitado sem explicação — e a §9 exige que todo requisito ausente seja explicado.

Por isso o tier aparece na tela de System Check como **uma linha entre outras**, e não como o veredito sobre o ambiente.

### Quando este ADR precisa ser revisitado

No primeiro recurso que exija um After Effects mais novo que 25.0. Aí `compatible` ou `baseline` passa a corresponder a algo real, e a tabela acima deixa de ser suficiente.

Se, até lá, a especificação passar a definir faixas para o After Effects, elas prevalecem sobre este ADR e este documento vira registro histórico.
