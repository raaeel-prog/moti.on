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
      return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos um layer.");
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

    // Command ID 3973 is "Create Shapes from Vector Layer"
    // We try to find it by name first for the English UI, or known PT-BR, else fallback to 3973
    var cmdId = /** @type {any} */ (app).findMenuCommandId("Create Shapes from Vector Layer");
    if (cmdId === 0) cmdId = /** @type {any} */ (app).findMenuCommandId("Criar formas a partir de camada de vetor");
    if (cmdId === 0) cmdId = 3973;

    var changed = false;
    var warnings = [];

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    try {
      // Create Shapes from Vector layer acts on the selected layer
      // We process one by one to keep references if needed
      var originalSelection = [];
      for (var s = 0; s < selectedLayers.length; s++) {
        originalSelection.push(selectedLayers[s]);
      }

      for (var i = 0; i < originalSelection.length; i++) {
        var layer = /** @type {any} */ (originalSelection[i]);
        
        // Basic check if it has a source
        if (!layer.source) {
          warnings.push(failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "Layer \"" + layer.name + "\" nao possui source."));
          continue;
        }

        // Deselect all
        for (var j = 1; j <= comp.numLayers; j++) {
          comp.layer(j).selected = false;
        }

        layer.selected = true;
        /** @type {any} */ (app).executeCommand(cmdId);

        // After executeCommand, the new shape layer is typically selected and the original is hidden
        // The original layer remains below the new shape layer
        if (keepOriginal) {
          layer.enabled = true; // ensure it's not hidden if keepOriginal is requested
        }

        changed = true;
      }

      // Restore selection to the newly created shape layers
      // executeCommand selects the newly created layer, so they will be selected one by one.
      // If we want to select all newly created layers, we would need to track them.
      // For now, leaving the last created shape layer selected is standard AE behavior.

      return { changed: changed, warnings: warnings, data: {} };
    } catch (e) {
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("AI to Vector falhou: " + (/** @type {any} */ (e)).toString()));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }
  }

  MotionRegistry.register("ae.vector.ai-to-vector", {
    preflight: preflight,
    run: run
  });
})();
