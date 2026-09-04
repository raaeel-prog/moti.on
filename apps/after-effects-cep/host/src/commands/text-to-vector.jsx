(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  function preflight() {
    if (typeof app === "undefined" || !app.project) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    }
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    }
    if (comp.selectedLayers.length === 0) {
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada de texto.");
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var selectedLayers = comp.selectedLayers;
    if (!selectedLayers || selectedLayers.length === 0) {
      return { changed: false, warnings: [], data: {} };
    }

    var keepOriginal = args.keepOriginal === true;

    // Command ID 3781 is "Create Shapes from Text"
    var cmdId = /** @type {any} */ (app).findMenuCommandId("Create Shapes from Text");
    if (cmdId === 0) cmdId = /** @type {any} */ (app).findMenuCommandId("Criar formas a partir de texto");
    if (cmdId === 0) cmdId = 3781;

    var changed = false;
    var warnings = [];

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    try {
      var originalSelection = [];
      for (var s = 0; s < selectedLayers.length; s++) {
        originalSelection.push(selectedLayers[s]);
      }

      for (var i = 0; i < originalSelection.length; i++) {
        var layer = /** @type {any} */ (originalSelection[i]);
        
        if (!(layer instanceof TextLayer)) {
          warnings.push(failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "Camada \"" + layer.name + "\" nao e de texto."));
          continue;
        }

        for (var j = 1; j <= comp.numLayers; j++) {
          comp.layer(j).selected = false;
        }

        layer.selected = true;
        /** @type {any} */ (app).executeCommand(cmdId);

        if (keepOriginal) {
          /** @type {any} */ (layer).enabled = true;
        }

        changed = true;
      }

      return { changed: changed, warnings: warnings, data: {} };
    } catch (e) {
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Text to Vector falhou: " + (/** @type {any} */ (e)).toString()));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }
  }

  MotionRegistry.register("ae.vector.text-to-vector", {
    preflight: preflight,
    run: run
  });
})();
