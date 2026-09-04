/* global ImportOptions, BlendingMode */
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
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @returns {MotionCommandResult}
   */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var assetPath = typeof args.assetIdOrPath === "string" ? args.assetIdOrPath : "";
    var blendModeRaw = typeof args.blendMode === "string" ? args.blendMode : "overlay";
    var opacity = typeof args.opacity === "number" ? args.opacity : 100;

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    try {
      var importedItem = null;
      var ESFile = /** @type {any} */ (File);
      var ESImportOptions = /** @type {any} */ (ImportOptions);

      if (assetPath && new ESFile(assetPath).exists) {
        var importOptions = new ESImportOptions(new ESFile(assetPath));
        if (/** @type {any} */ (app.project).canImportFile(importOptions)) {
          importedItem = /** @type {any} */ (app.project).importFile(importOptions);
        }
      }

      var textureLayer;
      if (importedItem) {
        textureLayer = /** @type {any} */ (comp.layers).add(importedItem);
      } else {
        // Fallback placeholder
        textureLayer = /** @type {any} */ (comp.layers).addSolid([0.5, 0.5, 0.5], "Texture Placeholder", comp.width, comp.height, /** @type {any} */ (comp).pixelAspect, comp.duration);
      }

      var opacityProp = /** @type {Property} */ (textureLayer.property("ADBE Transform Group").property("ADBE Opacity"));
      opacityProp.setValue(opacity);

      // Map common blend modes
      var ESBlendingMode = /** @type {any} */ (BlendingMode);
      var targetMode = ESBlendingMode.OVERLAY;
      if (blendModeRaw === "multiply") targetMode = ESBlendingMode.MULTIPLY;
      else if (blendModeRaw === "screen") targetMode = ESBlendingMode.SCREEN;
      else if (blendModeRaw === "add") targetMode = ESBlendingMode.ADD;
      else if (blendModeRaw === "softlight") targetMode = ESBlendingMode.SOFT_LIGHT;
      else if (blendModeRaw === "normal") targetMode = ESBlendingMode.NORMAL;

      textureLayer.blendingMode = targetMode;

      return { changed: true, warnings: [], data: {} };
    } catch (e) {
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Texture falhou: " + (/** @type {any} */ (e)).toString()));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }
  }

  MotionRegistry.register("ae.asset.texture", {
    preflight: preflight,
    run: run
  });
})();
