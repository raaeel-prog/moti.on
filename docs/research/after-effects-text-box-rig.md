# Caixa responsiva atrás de texto (CHMS-014)

**Question:** Quais símbolos exatos sustentam uma caixa de shape que acompanha o texto, e como referenciar a camada de texto de forma que sobreviva a rename e reordenação?

**Decision date:** 2026-08-26

**Target host/version:** After Effects. Sondado em **26.3x87 / CEP 12.0.1 / Windows 11**.

**Status:** available

## Evidence table

`sourceRectAtTime` veio da referência de expressões (espelho comunitário, mesma proveniência declarada em `after-effects-wiggle-and-seed.md`). **Todo o resto foi sondado no host real**, criando uma shape layer e enumerando `matchName` — não é memória nem suposição.

| Claim | Símbolo exato | Origem |
|---|---|---|
| Retângulo do texto | `sourceRectAtTime(t = time, includeExtents = false)` → `{ top, left, width, height }` | referência |
| `includeExtents` | vale para shape layers e **texto de parágrafo** (AE 15.1+), devolvendo os limites da caixa de parágrafo | referência |
| Disponibilidade | introduzido no AE 13.2 | referência |
| Camada de texto | `ADBE Text Layer` | sondado |
| Camada de forma | `ADBE Vector Layer` | sondado |
| Raiz do conteúdo | `ADBE Root Vectors Group` | sondado |
| Grupo | `ADBE Vector Group`, conteúdo interno em `ADBE Vectors Group` | sondado |
| Retângulo | `ADBE Vector Shape - Rect` | sondado |
| Tamanho do retângulo | `ADBE Vector Rect Size` | sondado |
| Posição do retângulo | `ADBE Vector Rect Position` | sondado |
| Arredondamento | `ADBE Vector Rect Roundness` | sondado |
| Preenchimento | `ADBE Vector Graphic - Fill` | sondado |
| Cor / opacidade do fill | `ADBE Vector Fill Color`, `ADBE Vector Fill Opacity` | sondado |
| Transform do grupo | `ADBE Vector Transform Group` | sondado |

### Por que a sondagem importa

Os nomes de exibição voltaram **localizados**: `ADBE Vector Rect Size` aparece como "Tamanho", `ADBE Vector Rect Position` como "Posição". Num After Effects em inglês seriam "Size" e "Position". Qualquer lógica escrita sobre display name funcionaria na máquina de quem escreveu e falharia na do usuário — que é exatamente a proibição registrada na skill de host.

Medição de referência, texto "Ag" no padrão do host:

```
sourceRectAtTime(0, false) → top=-24.4358  left=0.9064  width=38.4585  height=32.0131
```

`top` negativo confirma que o retângulo é devolvido no **espaço da própria camada de texto**, com a origem na baseline/ponto de ancoragem, e não em coordenadas de composição.

## A decisão que não é óbvia: como apontar para o texto

A implementação clássica escreve `thisComp.layer("Nome do texto")`. Isso quebra de duas formas silenciosas:

1. o usuário renomeia a camada e a caixa para de seguir;
2. existem duas camadas com o mesmo nome e a expressão pega a errada.

A §7 do spec já exige `parent` preservando transform, e a ordem logo abaixo do texto. Como o rig **já cria** esse vínculo de parentesco, a expressão pode usá-lo:

```text
var alvo = thisLayer.parent;
var r = alvo.sourceRectAtTime(time, false);
```

`thisLayer.parent` não depende de nome nem de índice: sobrevive a rename, a reordenação e a duplicação. O vínculo que a expressão usa é o mesmo que o rig criou, então não há um segundo acoplamento para manter em sincronia.

O modo de falha também melhora: se o usuário desparentar a caixa, a expressão falha de forma visível e atribuível a uma ação explícita dele — em vez de continuar apontando silenciosamente para a camada errada.

## Templates propostos

Sobre `ADBE Vector Rect Size`:

```text
var alvo = thisLayer.parent;
var r = alvo.sourceRectAtTime(time, false);
[r.width + <paddingX> * 2, r.height + <paddingY> * 2];
```

Sobre `ADBE Vector Rect Position`:

```text
var alvo = thisLayer.parent;
var r = alvo.sourceRectAtTime(time, false);
[r.left + r.width / 2, r.top + r.height / 2];
```

O centro do retângulo é o centro do bounding box do texto, e não a origem da camada — é isso que faz a caixa acompanhar alinhamento à esquerda, centro e direita sem input adicional.

## Escopo entregue e escopo adiado

A §7 lista como inputs mínimos `paddingX, paddingY, roundness, fill, stroke, anchorMode, multilineMode, createPerLayer`.

**Entregue neste slice:** `paddingX`, `paddingY`, `roundness`, `fillColor`, `fillOpacity`.

`createPerLayer` existe no contrato, mas o host aceita somente `true` e **recusa `false` explicitamente**, em vez de aceitar o valor e criar por camada assim mesmo. O motivo e estrutural: uma caixa unica em volta de varias camadas nao consegue usar `thisLayer.parent` — ha um so parent — e precisaria referenciar cada texto por nome ou indice, que e exatamente a fragilidade que este rig existe para evitar. Enquanto essa segunda forma nao for desenhada, recusar e mais honesto do que ignorar.

**Adiado, com motivo:**

- `stroke` — é mais um grupo (`ADBE Vector Graphic - Stroke`) com largura, cor e alinhamento. Custo baixo, mas amplia a superfície do rig gerenciado antes de o núcleo estar verificado em host.
- `anchorMode` — **precisa de definição de produto**. O spec não diz o que os modos são. Para uma caixa que já centraliza no bounding box do texto, "modo de ancoragem" pode significar onde fica o anchor do grupo, onde fica o anchor da camada de forma, ou a que ponto do texto a caixa se prende. São três features diferentes; escolher por conta própria seria inventar requisito.
- `multilineMode` — mesma situação. `sourceRectAtTime` já devolve o bounding box de todas as linhas, então o comportamento padrão já cobre multilinha. O que o modo deveria alternar (caixa por linha? altura fixa por número de linhas?) não está escrito.

Enquanto essas duas decisões não existirem, o CHMS-014 fica **`PARTIAL`**, e não concluído.

## Tests needed

- templates rendem fonte canônica e sobrevivem ao round-trip do parser;
- padding negativo é recusado;
- a fonte referencia `thisLayer.parent`, nunca `thisComp.layer(` com nome;
- o comando recusa seleção que não seja camada de texto;
- criação em host: a caixa aparece **abaixo** do texto na ordem de camadas, parenteada, e o `expressionError` fica vazio nas duas propriedades;
- alterar o texto muda o tamanho da caixa mantendo o padding.

## Texto vazio: medido, e muda o template

O spec exige tratar texto vazio. Medido no host:

| Conteúdo | `sourceRectAtTime(0, false)` |
|---|---|
| `"Ag"` | top=-58.374 left=-47.672 width=91.873 height=76.476 |
| `""` (vazio) | **top=0 left=0 width=0 height=0** |
| `" "` (só espaço) | **top=0 left=0 width=0 height=0** |
| 3 linhas | top=-61.492 left=-113.519 width=229.082 height=268.845 |
| fontSize 200 | top=-135.754 left=-110.865 width=213.658 height=177.850 |

Dois achados:

1. **Texto vazio devolve tudo zero.** Sem tratamento, a caixa viraria um retângulo de `paddingX * 2 × paddingY * 2` pousado na origem da camada — um bloco de cor aparecendo do nada quando o usuário apaga o texto.
2. **Espaço em branco também devolve tudo zero.** Um espaço não tem tinta, logo não tem bounding box. Quem digita um espaço vê o mesmo bloco órfão.

Por isso o template de tamanho colapsa a caixa em vez de aplicar padding sobre nada:

```text
var alvo = thisLayer.parent;
var r = alvo.sourceRectAtTime(time, false);
r.width === 0 && r.height === 0
  ? [0, 0]
  : [r.width + <paddingX> * 2, r.height + <paddingY> * 2];
```

A caixa some quando não há texto e volta sozinha quando o texto volta. É comportamento medido, não suposto.

Multilinha não precisa de tratamento: `sourceRectAtTime` já devolve o bounding box de todas as linhas — a altura de 268 px para três linhas confirma.

## Open uncertainty

- `includeExtents = true` para texto de parágrafo não foi medido; o slice usa `false`, que é o bounding box do texto desenhado. Para caixa de parágrafo o resultado provavelmente difere, e é o que o `multilineMode` adiado provavelmente deveria alternar.
- Não foi medido o comportamento durante **animação de texto** por range selector, que é o critério de aceite "a caixa não salta ao primeiro caractere". Isso exige medição quadro a quadro num fixture com animador de texto.
