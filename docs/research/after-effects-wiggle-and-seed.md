# Wiggle determinístico no After Effects

**Question:** Como emitir um `wiggle()` gerenciado cujo resultado seja reproduzível, conforme a exigência da skill `engineering-motion-rigs` de expor semente e não depender de aleatoriedade não repetível no Apply? Quais são as assinaturas exatas de `wiggle()` e `seedRandom()`?

**Decision date:** 2026-08-25

**Target host/version:** After Effects, motor de expressões JavaScript. Ambiente medido: 26.3x87 / CEP 12.0.1 / Windows 11.

**Status:** available

## Evidence table

| Claim | Símbolo exato | Fonte | Notas |
|---|---|---|---|
| Assinatura do wiggle | `wiggle(freq, amp[, octaves=1][, amp_mult=0.5][, t=time])` | Referência de expressões (espelho comunitário, ver Proveniência) | Retorno `Number \| Array`, conforme a dimensionalidade da propriedade |
| `freq` | Number | idem | "Frequency, in wiggles per second" |
| `amp` | Number | idem | "Amplitude, in units of the property to which it is applied" |
| `octaves` | Number, padrão `1` | idem | "Number of octaves of noise to add together... controls how much detail is in the wiggle" |
| `amp_mult` | Number, padrão `0.5` | idem | "Amount that `amp` is multiplied by for each octave... controls how fast the harmonics drop off" |
| `t` | Number, padrão `time` | idem | "Base start time" |
| Assinatura do seedRandom | `seedRandom(offset[, timeless=false])` | idem | |
| **O offset controla o wiggle** | `seedRandom(offset)` | idem, corroborado por resumo do helpx | "The value with which to offset the seed. **This is also used to control the initial value of the `wiggle()` function.**" |
| **O `timeless` NÃO controla o wiggle** | — | resumo do helpx | "The offset value, **but not the timeless value**, is also used to control the initial value of the wiggle function." A referência de `seedRandom` descreve `timeless` apenas em termos de `random()`/`gaussRandom()`. |
| Semente padrão | offset `0` | idem | "By default, the seed is computed as a function of a unique layer identifier, the property within the layer, the current time, and an offset value of `0`." |

### Proveniência

A página oficial `helpx.adobe.com/after-effects/using/expression-language-reference.html` **não pôde ser carregada nesta sessão** — duas tentativas expiraram em 60 s. As assinaturas verbatim vieram de `ae-expressions.docsforadobe.dev`, que é o **espelho mantido pela comunidade** da referência de expressões da Adobe, e não uma fonte primária.

A afirmação central — offset afeta o wiggle, `timeless` não — aparece **nas duas** fontes: no espelho e num resumo de busca do próprio helpx. Isso é corroboração, não prova primária.

**Incerteza aberta registrada:** confirmar a frase diretamente na página da Adobe quando ela estiver acessível. O comando não depende disso para funcionar, mas depende para afirmar *por que* omite o `timeless`.

## Implementation decision

Template canônico `ae.expression.wiggle`, versão 1:

```text
// MOTION_EXPRESSION v1 | ae.expression.wiggle
seedRandom(<seed>);
wiggle(<freq>, <amp>, <octaves>, <ampMult>);
```

Decisões e o motivo de cada uma:

1. **`seedRandom` é emitido sempre, com semente explícita.** Sem ele, a semente do wiggle deriva do identificador da camada e da propriedade — ou seja, duas camadas com os mesmos parâmetros produzem movimentos diferentes, e o mesmo projeto reaberto não é comparável. A skill de rigs exige semente exposta e resultado reproduzível.

2. **`timeless` NÃO é emitido.** A documentação diz que ele não controla o wiggle. Emiti-lo daria a impressão de governar algo que não governa, e ainda ampliaria a superfície do parser canônico sem ganho.

3. **`t` (tempo base) fica fora da v1.** Seu uso real é truque de loop, que pertence ao CHMS-020 (Time/Kinetic/Marker Loop). Incluí-lo agora seria token sem tela.

4. **Wiggle NÃO exige keyframes.** Diferente de LoopOut e Smooth, `wiggle()` opera sobre valor estático — sacudir uma camada parada é o uso principal. Impor mínimo de keyframes aqui bloquearia o caso mais comum.

### Faixas adotadas

Não são faixas da Adobe: a documentação não publica limites. São limites de produto, escolhidos para manter a expressão sã e o parser canônico fechado.

| Token | Faixa | Padrão | Motivo |
|---|---|---|---|
| `frequency` | `> 0` e `<= 100` | `2` | Acima de ~100 wiggles/s o resultado é ruído sem leitura visual |
| `amplitude` | `>= 0` e `<= 100000` | `30` | Unidades da propriedade; posição em comps grandes justifica o teto alto |
| `octaves` | inteiro `1..10` | `1` | Cada oitava soma custo por frame; padrão da Adobe é 1 |
| `amplitudeMultiplier` | `>= 0` e `<= 10` | `0.5` | Padrão da Adobe é 0.5; acima de 1 as harmônicas crescem em vez de decair |
| `seed` | inteiro `0..100000` | `0` | 0 é o offset padrão da Adobe, então a semente padrão não altera o comportamento nativo |

## Fallback

Nenhum necessário: `wiggle()` e `seedRandom()` são do núcleo da linguagem de expressões, não dependem de efeito instalado nem de permissão. Se o motor de expressões estiver indisponível, o gate de capacidade `expressionEngine` já recusa o comando antes do preflight.

## Capability flag

Reutiliza `expressionEngine`, o mesmo requisito declarado por `ae.expression.loopout` e `ae.expression.smooth`. Nenhuma capacidade nova.

## Tests needed

- paridade entre o renderer ES5 do host e o TypeScript da biblioteca, para os mesmos tokens;
- rejeição de token fora de faixa antes de emitir qualquer fonte;
- injeção pelo token numérico não fecha a chamada nem emenda código;
- corpo adulterado sob cabeçalho gerenciado não é reconhecido como gerenciado;
- **wiggle aplica em propriedade sem keyframes** — é a diferença de contrato em relação a LoopOut e Smooth;
- reaplicar os mesmos tokens é no-op de sucesso.

## Open uncertainty

- A frase sobre `timeless` não foi lida na fonte primária da Adobe nesta sessão.
- Não foi medido em host real se duas camadas com a mesma semente e os mesmos parâmetros produzem movimento idêntico. A documentação diz que o offset controla o valor inicial, mas o identificador da camada continua na composição da semente — pode ser que a semente iguale a fase, e não a trajetória inteira. **Isso precisa de verificação em host antes de o produto prometer "mesma semente, mesmo movimento".**

---

# Flicker determinístico

**Question:** Como emitir um flicker gerenciado que seja reproduzível e que funcione em propriedades de qualquer dimensionalidade?

**Decision date:** 2026-08-25

**Status:** available

## Evidence table

| Claim | Símbolo exato | Notas |
|---|---|---|
| Taxa de atualização | `posterizeTime(updatesPerSecond)` | "the number of times per second the expression should evaluate"; "allows you to set the frame rate for a property to be lower than the frame rate of the composition" |
| Sorteio com faixa | `random(minValOrArray, maxValOrArray)` | Com **dois números**, devolve **Number**. Com array, devolve "an Array with the same dimension as the argument with the greater dimension" |
| Semente | `seedRandom(offset[, timeless=false])` | Mesma da seção anterior; controla a sequência de `random()` |

Mesma proveniência e mesma incerteza declarada da seção do Wiggle: espelho comunitário, página oficial inacessível nesta sessão.

## O problema de dimensionalidade, e a decisão que ele forçou

`random(0, 1)` devolve um **número**. Uma propriedade de posição espera um array de duas ou três componentes. Emitir `random(0, 1)` cru quebraria a expressão em tudo que não fosse 1D — e quebraria dentro do After Effects, não aqui.

Duas saídas foram consideradas:

1. **Restringir o comando a propriedades 1D.** Simples, mas recusaria escala, posição e cor sem motivo real.
2. **Modular o próprio valor da propriedade.** É a adotada.

Template canônico `ae.expression.flicker`, versão 1:

```text
// MOTION_EXPRESSION v1 | ae.expression.flicker
seedRandom(<seed>);
posterizeTime(<rate>);
value * random(<min>, <max>);
```

`value` carrega a dimensionalidade da própria propriedade, e `array * escalar` é válido na linguagem de expressões. O mesmo template serve 1D, 2D, 3D e cor sem ramificação.

O efeito colateral é melhor que a alternativa: como multiplica em vez de substituir, o flicker **preserva a animação existente** da propriedade em vez de descartá-la. Opacidade com keyframes continua com os keyframes, agora piscando.

### Faixas adotadas

Limites de produto, não da Adobe.

| Token | Faixa | Padrão | Motivo |
|---|---|---|---|
| `rate` | `> 0` e `<= 120` | `12` | Acima da taxa da composição o `posterizeTime` deixa de ter efeito visível |
| `minFactor` | `>= 0` e `<= 10` | `0` | Fator multiplicativo; 0 apaga completamente no quadro sorteado |
| `maxFactor` | `>= 0` e `<= 10` | `1` | 1 mantém o valor original como teto |
| `seed` | inteiro `0..100000` | `0` | Offset padrão da Adobe |

**Invariante entre campos:** `minFactor <= maxFactor`. `random(1, 0)` não é erro no After Effects, mas inverte a intenção declarada na interface, então é recusado antes de virar fonte.

## Implementation decision

- Wiggle e Flicker compartilham `seedRandom`, e por isso a mesma regra: semente sempre explícita, `timeless` nunca emitido.
- **Não exige keyframes**, pelo mesmo motivo do Wiggle: piscar um valor estático é o uso principal.
- Multiplicação em vez de substituição, pela dimensionalidade e pela preservação da animação existente.

## Tests needed

- paridade ES5 ↔ TypeScript;
- recusa de `minFactor > maxFactor`;
- corpo adulterado e `posterizeTime` removido não passam por gerenciado;
- aplica em propriedade sem keyframes;
- aplica em propriedade multidimensional sem erro de expressão **no host real** — este é o teste que justifica a decisão de desenho.

## Open uncertainty

O comportamento de `value * random(...)` em propriedade de **cor** não foi medido em host. Cor é array de quatro componentes com faixa 0..1, e multiplicar o canal alfa junto pode não ser o esperado. Até medir, o comando aceita cor porque o tipo permite, mas isso não está verificado.
