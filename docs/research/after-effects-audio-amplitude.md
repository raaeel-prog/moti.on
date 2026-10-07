# Camada Audio Amplitude, para `ae.audio.beat`

**Question:** Como sincronizar uma propriedade com a batida da música sem o
native audio analyzer, que não existe, e sem `app.executeCommand` localizado,
que o §13 proíbe?

**Decision date:** 2026-09-05

**Target host/version:** After Effects, CEP/ExtendScript.

**Status:** `partial` — o caminho funciona, mas depende de um passo manual do
usuário e os nomes envolvidos não têm garantia de localização.

## Evidence table

| Claim | Símbolo | Fonte | Notas |
|---|---|---|---|
| O assistente nativo gera uma camada de amplitude | Keyframe Assistant → Convert Audio to Keyframes | Documentação e tutoriais correntes | Cria uma camada chamada **Audio Amplitude** em inglês. |
| Áudio estéreo produz três sliders | "Left Channel", "Right Channel", "Both Channels" | idem | Mono produz menos; a ordem observada é esquerda, direita, ambos. |
| A referência canônica em expressão | `thisComp.layer("Audio Amplitude").effect("Both Channels")("Slider")` | idem | É a forma que circula em todo material sobre o assunto. |
| Nomes localizados | — | **nenhuma** | Nenhuma das fontes trata o que acontece num After Effects que não seja em inglês. |

## O problema, e a saída

A referência canônica crava três nomes: o da camada, o do efeito e o do
parâmetro. Nenhum deles tem garantia de estabilidade entre idiomas, e a §11
desta spec proíbe depender de nome de exibição justamente por isso. É o mesmo
buraco medido em `after-effects-neon-glow-and-text-stroke.md`.

A saída aqui é melhor que no Glow, porque o alvo **já existe no projeto** quando
o comando roda: em vez de adivinhar como ele se chama, o comando **lê o nome
real**.

1. **Achar a camada por estrutura, não por nome.** Uma camada de amplitude é uma
   camada cujo Effect Parade contém apenas `ADBE Slider Control` — matchName,
   que é estável. Três deles significam estéreo; um significa mono.
2. **Ler `camada.name` e `efeito.name`** e escrever esses nomes na expressão. O
   resultado sai correto em qualquer idioma, porque não foi adivinhado.
3. **O parâmetro sai por índice `(1)`**, nunca por `("Slider")` — é a mesma regra
   que `live-controls.jsx` já declara para os Expression Controls.

Isso troca fragilidade a idioma por fragilidade a renomeação, que é o
comportamento que o usuário do After Effects já espera de qualquer expressão.

## Implementation decision

> **Revisto em 2026-09-05.** A decisão abaixo dizia que o comando não roda o
> assistente. Ela foi revertida pelo dono do produto no mesmo dia: `ae.audio.beat`
> **roda o assistente sozinho** quando não há camada de amplitude, e só recusa
> quando não há como produzi-la. O mecanismo, as protecões e o que continua sem
> medição estão em `after-effects-convert-audio-to-keyframes.md`. O resto desta
> página — detecção estrutural, escolha do canal, leitura dos nomes reais —
> continua valendo palavra por palavra, e é o que verifica se o assistente
> funcionou.

- ~~`ae.audio.beat` **não roda o assistente**. Ele detecta a camada de amplitude e
  recusa com mensagem acionável quando não existe.~~ Ele roda o assistente e
  depois detecta o resultado; a recusa acionável continua sendo o fallback.
- Estéreo usa o terceiro slider (ambos os canais); mono usa o único.
- A intensidade vira Live Control, para o usuário ajustar sem reaplicar.

## Fallback

Sem camada de amplitude, o comando recusa — não inventa uma oscilação por BPM no
lugar. Trocar batida real por senoide sem avisar seria entregar outra coisa com o
mesmo nome. `renderBeatBpm` existe e pode virar uma ferramenta própria depois.

## Divergência registrada com a §13

O §13 exige "o native audio analyzer" e proíbe `app.executeCommand`. O analyzer
depende do CHMS-036/037 e não existe.

Este caminho divergia da primeira exigência e respeitava a segunda. Em 2026-09-05,
depois de usar a ferramenta, **o dono do produto decidiu divergir também da
segunda**: o passo manual era o que separava o Beat de ser útil. As duas
divergências estão registradas no blockquote do `MASTER_BUILD_SPEC.md`, e o
disparo do menu segue as mesmas condições que a §872 já impõe à conversão
vetorial. Ver `after-effects-convert-audio-to-keyframes.md`.

## Tests needed

- detecta a camada por estrutura, não por nome, e funciona com nome traduzido;
- estéreo escolhe o terceiro slider, mono escolhe o único;
- sem camada de amplitude, recusa com mensagem acionável;
- a expressão referencia o nome real lido do projeto.

## Open uncertainty

- A ordem "esquerda, direita, ambos" vem de material de comunidade, não de
  documentação da Adobe. O comando trata três sliders como estéreo e usa o
  terceiro; se alguma versão inverter a ordem, o resultado seria o canal errado —
  não uma falha visível.
- Nada disto foi executado em After Effects real por este agente.

## Fontes

- [Convert Audio to Keyframes — Surfaced Studio](https://www.surfacedstudio.com/blog/vfx-vlog/after-effects-audio-to-keyframes/)
- [Basic audio expressions — Dan Ebberts, Expressioneering Design Guide](http://motionscript.com/design-guide/basic-audio.html)
- [Animating with Sound in After Effects — macProVideo](https://www.macprovideo.com/article/after-effects/animating-with-sound-in-after-effects-part-1)
