# Restauração de parentesco em Criar Nulo

Remover o nulo parcial não restaura um pai que já existia. O comando agora
captura os pais antes de criar o nulo e restaura as camadas já modificadas antes
de remover o controlador parcial. A seleção anterior é restaurada pelo dispatcher
no caminho de exceção, dentro do mesmo grupo de Undo.

No modo que preserva o mundo, a restauração usa `parent`. No modo que mantém
os transforms locais, usa `setParentWithJump`; o parâmetro é omitido quando o
pai anterior era None. Essa forma opcional está documentada no
[After Effects Scripting Guide — Layer.setParentWithJump](https://ae-scripting.docsforadobe.dev/layer/layer/#layersetparentwithjump).

Regressões automatizadas: `layer-create-null.test.mjs`, incluindo falha na
segunda vinculação com um pai anterior, nos dois modos.
Prova nativa de seleção: `faults-instrumented-native/createNull-fault.json` e
`textBox-fault.json`, identificados pelo hash do host derivado de QA.
A prova nativa específica do parentesco tem recibos próprios; não é inferida
dos testes de seleção.
