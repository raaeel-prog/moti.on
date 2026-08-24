/**
 * `ae.demo.createComposition` — cria uma composição de teste com texto
 * centralizado.
 *
 * Único comando mutante do P0. Existe para provar, dentro do After Effects real,
 * que o caminho completo funciona: painel → escape → dispatch → preflight →
 * grupo de Undo → alteração no projeto → resposta. É o que
 * `docs/INSTALLATION.md` manda executar na verificação de instalação.
 *
 * Substitui `MotionAE.createDemoComposition()`, que abria o grupo de Undo antes
 * de validar qualquer coisa e chamava `app.newProject()` — operação destrutiva e
 * não-desfazível — de dentro desse grupo.
 */
(function () {
  MotionRegistry.register("ae.demo.createComposition", {
    /**
     * Toda a validação acontece aqui, com o projeto ainda intacto. O dispatcher
     * só abre o grupo de Undo depois que isto retorna `null`.
     */
    preflight: function () {
      if (!app.project) {
        return {
          code: MotionContracts.ERROR.NO_ACTIVE_PROJECT,
          message: "Nenhum projeto aberto.",
          recoverable: true,
          details: null
        };
      }

      // O starter chamava app.newProject() aqui quando não havia projeto. Isso
      // descarta o trabalho aberto do usuário, não entra no histórico de Undo, e
      // estava dentro do grupo de Undo — ou seja, um Ctrl+Z depois não traria o
      // projeto de volta. Recusar é a única resposta correta.

      if (!app.project.items) {
        return {
          code: MotionContracts.ERROR.HOST_OPERATION_FAILED,
          message: "O projeto não expõe a coleção de itens.",
          recoverable: false,
          details: null
        };
      }

      return null;
    },

    run: function () {
      var comp = app.project.items.addComp("Moti.on Demo", 1920, 1080, 1, 5, 30);
      var textLayer = comp.layers.addText("Plugin funcionando");

      // matchName, nunca nome de exibição: nome de exibição muda conforme o
      // idioma do After Effects, e um plugin que dependesse dele funcionaria só
      // na máquina de quem o escreveu.
      var textProperty = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
      var textDocument = /** @type {TextDocument} */ (textProperty.value);
      var positionProperty = textLayer.property("ADBE Transform Group").property("ADBE Position");

      textDocument.fontSize = 86;
      textDocument.fillColor = [1, 1, 1];
      textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
      textProperty.setValue(textDocument);
      positionProperty.setValue([960, 540]);

      return {
        // O dispatcher usa isto para impor a regra da seção 8: um comando que
        // muta e reporta changed: false nunca responde ok: true.
        changed: true,
        warnings: [],
        data: {
          compositionName: comp.name,
          width: comp.width,
          height: comp.height,
          duration: comp.duration,
          frameRate: comp.frameRate
        }
      };
    }
  });
}());
