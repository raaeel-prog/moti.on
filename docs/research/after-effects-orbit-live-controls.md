# After Effects — controles editáveis da Órbita

Question: Como aplicar uma órbita em um clique e manter seus parâmetros editáveis no nulo central, usando APIs documentadas?

Decision date: 2026-10-03

Target host/version: After Effects 25.0+; probe nativo realizado em `26.5x89`.

Status: available — controles nativos com detecção de capacidade para dropdown.

## Evidência

| Afirmação | Símbolo ou mecanismo | Versão / escopo | Fonte | Consequência |
|---|---|---|---|---|
| Controles de expressão em um nulo podem dirigir propriedades de várias camadas e receber keyframes. | Slider, Angle, Checkbox e Dropdown Menu Control | Documentação atual; consultada em 2026-10-03 | [Adobe — Using expression controls](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-controls/expression-controls.html) | Todos os parâmetros da Órbita ficam no próprio projeto, no nulo compartilhado. |
| O menu aceita itens definidos por script; a chamada devolve uma propriedade atualizada e invalida a propriedade antiga. | `Property.isDropdownEffect`, `Property.setPropertyParameters(string[])` | Gate no objeto real; a página não fixa a versão mínima desse método | [Adobe — Scripting support for Dropdown Menu Control](https://helpx.adobe.com/after-effects/desktop/motion-graphics/expressions-to-create-dropdown-lists/create_dropdowns_using_expressions.html) | Usar o retorno e resolver novamente o efeito após configurar os itens. |
| `parent` referencia o parent real; Position de uma camada parenteada usa o espaço desse parent. | `parent`, `hasParent`, `position` | Referência de expressões vigente | [Adobe — Expression language reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | Calcular a trajetória local ao nulo e ler seus controles por `parent`. |
| Efeitos podem ser resolvidos pelo nome escolhido pelo autor; nomes duplicados selecionam o primeiro efeito da pilha. | `effect(name)`, `effect(index)` | Referência de expressões vigente | [Adobe — Layer Sub-objects](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html) | Criar nomes únicos; a expressão usa `parent.effect(nome)(1)`. |
| A identidade nativa do dropdown pode ser gerada e mudar após definir os itens. | `ADBE Dropdown Control` → `Pseudo/@@…` | Observado somente no probe `26.5x89` | [control-probe.json](../../artifacts/orbit-controller-20261003/control-probe.json) e [probe-controls.jsx](../../artifacts/orbit-controller-20261003/probe-controls.jsx) | Gravar o `matchName` efetivamente resolvido, sem exigir que seja igual ao identificador de criação. |

As três páginas Adobe foram abertas e verificadas nesta data. O comportamento
`Pseudo/@@…` é evidência do runtime observado; não é uma promessa da documentação
nem um identificador fixo a inserir no código.

## Decisão de implementação

O comando `ae.3d.orbit` cria ou reutiliza um nulo 3D `Órbita (Moti.on)`. As
camadas visuais ficam parenteadas a ele. Mover o nulo move o centro e toda a
órbita; renomear o nulo não altera a referência `parent` das expressões.

Os nove controles são modo orbital, raio, velocidade, inclinação X,
perspectiva Y, rotação Z, fase, distribuição esférica e encarar o centro.
O modo seleciona oito presets na ordem: frontal, horizontal, vertical,
diagonal, diagonal inversa, lateral, esfera e esfera inclinada. O painel aplica
o resultado imediatamente; os Controles de Efeito do nulo permitem ajustar
todas as camadas com o painel fechado.

O writer cria controles por identificadores nativos, resolve a propriedade
interna por índice `(1)` e grava nome único, índice e identidade resolvida na
metadata. As expressões usam o nome customizado do efeito e `(1)`, evitando
nomes internos traduzidos e índices de efeito que mudam quando a pilha é
reordenada.

### Propriedades recriadas pelo dropdown

`setPropertyParameters()` não preserva o objeto de propriedade original,
conforme o contrato da Adobe. No probe, o efeito também mudou de identidade:
o `matchName` inicial `Pseudo/@@bHz1ogoNQ9qV5ehYeTFyKQ` tornou-se
`Pseudo/@@IJV6SqB2S5qhESAlHHU4AQ` após definir os itens. Slider, Angle e
Checkbox mantiveram os respectivos identificadores `ADBE … Control`.

A sequência adotada em `live-controls.jsx` guarda o índice do efeito antes da
chamada, recebe a propriedade atualizada, resolve novamente o efeito nesse
índice e sua propriedade `(1)`, valida `isDropdownEffect`, restaura o nome
customizado e registra a nova identidade. Referências antigas não são
reutilizadas para escrever valores ou nomear o efeito.

## Fallback e capability gate

O gate verifica `canAddProperty`, a propriedade `(1)`,
`isDropdownEffect === true` e a presença de `setPropertyParameters`. Se o
dropdown não estiver disponível ou sua configuração falhar, o writer usa
um slider inteiro com os oito valores descritos no nome e retorna warning
`DROPDOWN_FALLBACK`; a metadata registra `dropdown-as-slider`. Se nem slider estiver disponível, a criação falha
explicitamente. O fallback conserva o mesmo mapeamento de modos.

Não há um flag global novo: a capacidade é verificada durante a preparação e
criação dos Live Controls. A versão do host, isoladamente, não substitui esse
gate.

## Testes necessários e limites da evidência

- Criar os quatro tipos de controle no host real e verificar o dropdown após
  `setPropertyParameters`, inclusive nome e identidade resolvida.
- Aplicar cada preset em várias camadas, conferir expressão sem erro e
  alteração imediata quando os controles do nulo mudarem.
- Renomear/reordenar o nulo e reordenar os efeitos; confirmar a referência
  por parent e nome customizado.
- Repetir o clique com membros ou nulo selecionados sem duplicar o rig nem
  substituir ajustes manuais ou animação dos controles.
- Verificar fallback, conflitos, rollback, seleção/tempo preservados e Undo
  único; comparar Bake com a trajetória amostrada.

O probe citado comprova a criação e identidade dos controles nessa instalação.
Ele não comprova sozinho o rig completo, a precisão do Bake ou a matriz de
compatibilidade. Esses resultados pertencem ao relatório de execução da
feature. A identidade gerada em outras versões e instalações continua sendo
uma variação a detectar no runtime.
