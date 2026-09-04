# After Effects Live Controls — pesquisa de API

**Data:** 2026-09-04  
**Target:** After Effects 25.0+ / CEP 12 / ExtendScript  
**Issue:** CHMS-UX-006  
**Status:** API disponível; implementação automatizada, ainda sem verificação desta fatia em host real

## Perguntas verificadas

1. Expression Controls são efeitos reais, aplicáveis a layers e nulls, editáveis e
   keyframeáveis sem o painel do plugin aberto?
2. Como criar dropdowns por script e qual fallback é necessário?
3. Como evitar dependência do idioma do After Effects?
4. Quais referências ficam inválidas ao adicionar ou remover efeitos?

## Fontes e proveniência

- **Adobe HelpX, primária:** [Using expression controls](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-controls/expression-controls.html).
  Confirma os tipos nativos, aplicação em qualquer layer/null, rename pelo usuário,
  keyframes e o uso de um controle para dirigir várias propriedades.
- **Adobe HelpX, primária:** [Create dropdown lists using expressions](https://helpx.adobe.com/la/after-effects/using/create_dropdowns_using_expressions.html).
  Documenta `Property.setPropertyParameters()`, `Property.isDropdownEffect`, o
  `matchName` `ADBE Dropdown Control`, as restrições dos itens e a obrigação de usar
  o novo `Property` devolvido pelo método.
- **After Effects Scripting Guide, comunitária e não canônica:**
  [PropertyGroup.addProperty()](https://ae-scripting.docsforadobe.dev/property/propertygroup/#propertygroupaddproperty).
  Registra o comportamento observado de grupos indexados: `addProperty()` recria o
  grupo, invalida handles anteriores e exige re-resolução por `propertyIndex`.
- **After Effects Scripting Guide, comunitária e não canônica:**
  [First-party effect match names](https://ae-scripting.docsforadobe.dev/matchnames/effects/firstparty/).
  Foi usada como conferência secundária. Os `matchName` implementados continuam
  normativos no Addendum A2.3 do próprio repositório.

## Decisão implementada

- Criar `Slider`, `Angle`, `Color`, `Checkbox`, `Point` e `Dropdown` pelo
  `matchName`, nunca pelo nome localizado exibido pelo host.
- Ler e escrever exclusivamente a propriedade interna numérica `(1)`.
- Resolver cada controle por `nome customizado + matchName`; usar
  `índice armazenado + matchName` somente como fallback.
- Depois de cada adição, abandonar handles anteriores e reler o efeito no
  `ADBE Effect Parade`.
- Para dropdown, sondar `canAddProperty`, `isDropdownEffect` e
  `setPropertyParameters`. O handle retornado substitui imediatamente o anterior.
- Se a capability do dropdown estiver ausente ou falhar, remover a tentativa e
  criar um Slider inteiro com opções documentadas no nome. A operação não falha
  apenas por ausência dessa capability.
- Não apagar keyframes nem controles órfãos durante Adjust. Mudanças manuais são
  devolvidas como `userOverrides`; sobrescrita exige consentimento explícito.
- O módulo não abre Undo Group. Writer/updater/relink executam rollback interno e
  o comando consumidor continua dentro do grupo único mantido pelo dispatcher.

## Sondas e fallback

| Ponto | Sonda | Resultado usado | Fallback |
|---|---|---|---|
| Effect Parade | `layer.property("ADBE Effect Parade")` | grupo existente | recusar antes de mutar |
| Tipo de controle | `canAddProperty(matchName)` | `true` | recusar; dropdown tenta Slider |
| Dropdown | `isDropdownEffect === true` e método presente | configurar itens | Slider inteiro |
| Configuração do menu | retorno de `setPropertyParameters()` | novo handle obrigatório | remover tentativa e criar Slider |
| Resolução persistente | nome + matchName | atualiza índice | índice + matchName |
| Controle ausente | ambas as resoluções falham | warning `CONTROLS_MISSING` | ação `Religar` |

## Evidência automatizada

`apps/after-effects-cep/tests/live-controls.test.mjs` usa doubles que invalidam
handles de efeito a cada `addProperty()` e invalidam a propriedade original após
`setPropertyParameters()`. A suíte cobre tipos, ordem, localização, colisão de
nomes, clamp na expressão, fallback de dropdown, reorder, rename/relink, missing,
keyframes, overrides, órfãos, limites e rollback de criação/atualização/relink.

Esses testes verificam a lógica e a disciplina de API, mas não são evidência de
execução dentro do After Effects.

## Evidência ainda necessária

- `NOT RUN`: AE 25.x e AE 26.x reais, Windows e macOS.
- `NOT RUN`: rename e reorder reais no Effect Controls seguidos de Religar.
- `NOT RUN`: Undo em um passo quando um comando consumidor criar efeitos e
  expressões juntos.
- `NOT RUN`: dropdown real e fallback em host sem capability.
- `NOT RUN`: orçamento de criação até oito layers (300 ms) e leitura vetorial
  (40 ms) na máquina de referência.
- `NOT RUN`: projeto aberto com o plugin fechado, controles editados/keyframados
  e expressões avaliadas em UI localizada.
