# Automação segura de expressões em propriedades do After Effects

**Question:** Quais símbolos podem sustentar a primeira fatia P1 (`LoopOut` e, depois, `Smooth`) sem depender de nomes localizados nem substituir silenciosamente uma expressão do usuário?

**Decision date:** 2026-08-25

**Target host/version:** After Effects 25.0+; smoke principal em After Effects 26.3x87 / CEP 12.0.1 / Windows 11

**Status:** partial

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---:|---|---|
| Expressões podem ser adicionadas a propriedades animáveis. | propriedade keyframable + expression | Atual | [Adobe — Editing expressions](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-basics/edit-expressions.html) | Fonte Adobe atual; a elegibilidade final ainda é confirmada por `canSetExpression` no host. |
| `loopOut` aceita `cycle`, `pingpong`, `offset` e `continue`; `continue` não usa recorte por keys/duração. | `loopOut(type="cycle", numKeyframes=0)` | Atual | [Adobe — Expression Language Reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | O código emite `pingpong`, grafia usada pela função; a documentação Adobe também usa “ping-pong” em prosa. |
| `smooth` recebe janela em segundos, amostras e tempo; mais amostras custam desempenho. | `smooth(width=.2, samples=5, t=time)` | Atual | [Adobe — Expression Language Reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | O contrato deve limitar `width` e `samples`; `samples` ímpar inclui o tempo atual no box filter. |
| Loops não são apropriados para tipos que não são valores numéricos simples, como Source Text, paths e Histogram. | restrição de value type | Atual | [Adobe — Expression Language Reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | O host usa allowlist conservadora de `PropertyValueType`, não uma denylist aberta. |
| O scripting expõe seleção e atributos de expressão da propriedade. | `CompItem.selectedProperties`; `Property.canSetExpression`; `expression`; `expressionEnabled`; `expressionError`; `numKeys`; `propertyValueType` | Não declarado | [After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/) | A própria página informa que o guia é mantido pela comunidade, embora o Help Center da Adobe o indique como guia de scripting. Por isso cada símbolo permanece sujeito a smoke no host real. |
| Um Undo Group agrupa as mutações do script em uma entrada. | `app.beginUndoGroup`; `app.endUndoGroup` | Não declarado | [After Effects Scripting Guide — Application](https://ae-scripting.docsforadobe.dev/general/application/) | Proveniência comunitária; o mecanismo já passou no AE 26.3 para a composição demo. |

## Implementation decision

- A UI nunca envia source de expressão livre. Ela envia somente parâmetros tipados para um template registrado e versionado.
- O host resolve apenas `Property` selecionada que declare `canSetExpression === true` e cujo `propertyValueType` esteja na allowlist numérica medida.
- `LoopOut` exige duas keys, exceto o modo `continue`, cujo comportamento ainda assim é recusado sem animação útil nesta primeira fatia.
- Expressão existente não gerenciada retorna `EXPRESSION_CONFLICT` em `skip`. `replace-with-backup` só é aceito quando o usuário escolhe explicitamente esse modo; o texto e o estado enabled anteriores entram no backup do resultado.
- Atribuição é verificada por `expressionError`. Se o host rejeitar a expressão, o handler restaura expressão e enabled anteriores antes de devolver `HOST_OPERATION_FAILED`.
- A expressão gerenciada começa com `// MOTION_EXPRESSION v1 | <command-id>` e Apply repetido com os mesmos parâmetros é idempotente.
- O dispatcher faz todo o preflight antes de abrir um único Undo Group. Nenhum handler chama `eval`, `app.executeCommand` ou nome de propriedade localizado.

## Fallback

Quando nenhum alvo elegível existe, o comando não muta o projeto e devolve `NO_SELECTION` ou `INVALID_SELECTION_TYPE` com contagens redigidas. Quando há expressão do usuário, o padrão é recusar e orientar a escolher substituição com backup; nunca sobrescrever silenciosamente.

## Capability flag

O descriptor exige `hasProject`, `hasActiveComp` e `expressionEngine`. A versão do host não libera o comando sozinha; o preflight confirma os símbolos da propriedade selecionada.

## Tests needed

- renderer puro: allowlists, limites, header, snapshots e rejeição de source/tokens arbitrários;
- host double: seleção vazia, group em vez de property, value type incompatível, keys insuficientes, conflito, Adjust idempotente, rollback após `expressionError` e um Undo Group;
- contrato/build: descriptor e handler em paridade, bundle ES5/ASCII e nenhuma nova rota `evalScript`;
- host real: scalar e vector, conflito, Apply repetido, Ctrl+Z único, seleção/CTI, save/reopen e locale pt-BR;
- matriz posterior: AE 25.x, outros 26.x e macOS.

## Open uncertainty

- A Adobe não publica atualmente uma referência first-party completa do DOM ExtendScript equivalente ao guia comunitário. Os atributos de `Property` serão tratados como disponíveis somente nas combinações que passarem no smoke real.
- Persistir backup em metadata de `Layer.comment` depende da integração host de CHMS-009, ainda `NOT RUN`. Nesta primeira fatia o backup volta no resultado e protege o rollback imediato, mas restauração persistente por um comando Remove fica fora do status `Done` até essa integração existir.
