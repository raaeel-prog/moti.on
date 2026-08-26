# Matriz de transform de uma camada 3D no After Effects

**Pergunta:** em que ordem o After Effects compõe orientation, as três rotações e a escala numa camada 3D? E qual convenção de sinal usa?

**Data da decisão:** 2026-08-26
**Host alvo:** After Effects 26.3x87, Windows 11
**Status:** `available` — medido no host real

## Por que isto precisou de medição

Três comandos recusavam camadas 3D — Flip, Alinhador de âncora e, por tabela, qualquer coisa que compense transform. A recusa era honesta: sem saber a composição exata, a alternativa seria escrever matriz por palpite e produzir camadas visualmente erradas **sem levantar erro nenhum**.

Documentação não resolve isto de forma confiável: a ordem de rotação e o sentido dos ângulos num sistema de coordenadas com Y para baixo são exatamente o tipo de detalhe que se lê errado.

## Resultado

Para uma camada 3D **sem pai**:

```text
toWorld(v) = posição + M · (v − âncora)

M  = Ro · Rx(rx) · Ry(ry) · Rz(rz) · S
Ro = Rx(ox) · Ry(oy) · Rz(oz)
S  = diag(escalaX/100, escalaY/100, escalaZ/100)
```

Todas as rotações usam a matriz de **ângulo positivo**, na convenção padrão — não há inversão de sinal apesar do eixo Y apontar para baixo.

**Erro máximo contra o host: `5,684e-14`** em cinco pontos de teste, com orientation `[17, 23, 31]`, rotações `11/13/19` e escala `[130, 70, 90]`. Isso é precisão de máquina: a fórmula não é aproximação, é a mesma conta.

## Método, e os dois enganos que ele desfez

Adivinhar a ordem entre oito candidatas não converge: as oito erram, e o erro não diz **por quê**. O que resolveu foi medir a matriz diretamente.

Para uma camada sem pai, as colunas de `M` são diferenças de `toWorld` nos vetores da base:

```text
coluna_j = toWorld(âncora + e_j) − toWorld(âncora)
```

Quatro avaliações dão `M` inteira. Com ela na mão, cada hipótese vira uma comparação numérica em vez de um palpite.

Dois enganos apareceram assim, e nenhum dos dois teria sido óbvio:

1. **`toComp` não serve.** Numa camada 3D ele já inclui a projeção da câmera, e o erro chegava a **860 px**. O que corresponde ao transform da camada é `toWorld`.
2. **Não há inversão de sinal.** Assumi que o eixo Y para baixo invertia o sentido das rotações. Medindo cada eixo isolado, `rz(+30)·S` bate exatamente com o host e `rz(−30)·S` não. A inversão sozinha respondia por um erro de ~165 px.

## Uma armadilha de diagnóstico, registrada

Concatenar um array de valor de propriedade do After Effects numa string levanta `resultado numérico inválido (divisão por zero?)`. Isto custou uma rodada inteira: o log de sucesso explodia dentro do `try`, e o `catch` fazia parecer que a **escrita** tinha falhado, quando ela havia funcionado.

Formatar elemento a elemento é o único caminho seguro em código de sonda:

```javascript
function fmt(v) {
  var p = [];
  for (var i = 0; i < v.length; i += 1) p.push(Number(v[i]).toFixed(4));
  return "[" + p.join(", ") + "]";
}
```

## Decisão de implementação

`MotionTransform.linearMatrix(camada)` devolve `M` em ExtendScript puro, sem expressão, e serve 2D e 3D pelo mesmo caminho: uma camada 2D é o caso em que orientation e as rotações X e Y são zero e a escala Z é 1. A fórmula 2D usada antes — `posição + R(t)·S·(A' − A)` — é exatamente esta restrita ao plano.

## Incerteza aberta

- Medido num único ambiente. macOS e AE 25.x: `NOT RUN`.
- **Camadas 3D com pai**: `M` aqui é o transform da própria camada, e `posição` já está em espaço do pai, então a compensação de âncora continua local e não precisa da cadeia. Isso vale por construção em 2D e foi medido em 2D; em 3D **ainda não foi medido**.
- Escala com componente negativo em 3D não foi medida.
- `Auto-Orient` não foi considerado: quando ligado, a rotação efetiva deixa de vir só das propriedades.
