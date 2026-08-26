# Semântica de parentesco no After Effects

**Pergunta:** `layer.parent = alvo` preserva o world transform, ou é `setParentWithJump` que preserva? E o host detecta ciclos sozinho?

**Data da decisão:** 2026-08-26
**Host alvo:** After Effects 26.3x87, Windows 11
**Status:** `available` — medido no host real

## Por que isto precisou de medição

O critério de aceite do CHMS-015 é *"World transform antes/depois é equivalente para 2D, 3D e parents aninhados"*. Não há como implementar `preserveWorldTransform` sem saber qual das duas chamadas faz o quê.

A documentação comunitária é ambígua, e **o nome da API engana**: é fácil ler `setParentWithJump` como "seta o parent evitando o pulo". É o contrário — o "jump" é o que ela causa.

Um palpite pelo nome teria invertido a feature inteira, e o erro seria silencioso: as camadas ficariam visualmente erradas sem nenhuma exceção.

## Método

Um pai **rotacionado e escalado** — rotação sozinha não distingue os casos, porque uma criança na origem do pai fica parada nos dois modos. Filhos idênticos, um por método. Posição em espaço de composição medida por expressão `toComp([0,0,0])` numa camada-régua 3D, lida com `valueAtTime`.

Pai: posição `[400, 200]`, rotação `30°`, escala `150%`. Filhos em `[100, 100]`.

## Resultado

| Camada | Método | Mundo antes | Mundo depois | `position` depois |
|---|---|---|---|---|
| A (2D) | `parent =` | `[50, 50, 0]` | `[50, 50, 0]` | `[-156.5384, 92.2650]` |
| B (2D) | `setParentWithJump()` | `[50, 50, 0]` | `[400, 200, 0]` | `[100, 100]` |
| C (3D) | `parent =` | `[50, 50, 887.8889]` | `[50, 50, 887.8889]` | `[-156.5384, 92.2650]` |

- **`layer.parent = alvo` preserva o world transform.** O After Effects reescreve os valores de transform da filha para compensar. Vale para 2D e 3D.
- **`setParentWithJump(alvo)` não preserva.** Mantém os valores crus e a camada pula para onde o transform do pai a levar.
- **Desparentar tem a mesma simetria.** `parent = null` preservou o mundo de A e devolveu `position` a `[100, 100]`. Em B, que tinha pulado, `parent = null` preservou o mundo *pulado* e reescreveu `position` para `[427.4519, 302.4519]`.

## Detecção de ciclo

O host recusa sozinho, com mensagem própria e localizada:

```
p1.parent = p2   →  Erro do After Effects: o pai de uma camada não pode ser
                    ela própria ou um de seus filhos.
p1.parent = p1   →  mesma mensagem
```

**Isso não dispensa a detecção no preflight.** A regra do projeto é validar a seleção inteira antes do primeiro write; confiar na exceção do host faria o lote falhar no meio, com parte das camadas já reparentadas. O rollback cobriria, mas o usuário receberia uma mensagem de host não traduzida em vez de um erro tipado.

A exceção do host continua sendo a última linha de defesa, para o caso de a árvore mudar entre o preflight e o write.

## Decisão de implementação

```
preserveWorldTransform: true   →  layer.parent = alvo
preserveWorldTransform: false  →  layer.setParentWithJump(alvo)
unparent: true                 →  layer.parent = null
```

O padrão do produto é `preserveWorldTransform: true`: reparentar sem mexer na aparência é o que o critério de aceite pede, e é o comportamento que o usuário obtém arrastando o pickwhip no timeline.

## Incerteza aberta

- Medido num único ambiente (AE 26.3x87, Windows 11). macOS e AE 25.x: `NOT RUN`.
- Parents **aninhados** (avô → pai → filho) não foram medidos neste experimento; o critério de aceite os menciona. Fica para a verificação do comando.
- Camadas com **expressão** na posição não foram medidas. Se o After Effects não conseguir reescrever um valor governado por expressão, `preserveWorldTransform` pode falhar silenciosamente nessas camadas.
