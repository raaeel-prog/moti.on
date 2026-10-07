/** Local texture overlay. File selection and capability checks precede Undo.
 * ImportOptions.canImportAs is the documented probe; project.canImportFile
 * does not exist. No placeholder is substituted for unavailable media.
 */
/* global ImportOptions, BlendingMode, FootageItem */
(function () {
  var ALLOWED = { assetIdOrPath: true, blendMode: true, opacity: true, fitMode: true };
  var BLENDS = { normal: "NORMAL", overlay: "OVERLAY", multiply: "MULTIPLY", screen: "SCREEN", add: "ADD", softlight: "SOFT_LIGHT" };
  var MEDIA_EXTENSION = /\.(png|jpe?g|tiff?|exr|dpx|psd|bmp|gif|tga|webp|heic|mov|mp4|m4v|avi|mxf|webm)$/i;
  // A successful preflight stages exactly one synchronous dispatcher run. Clear
  // it on every attempt and consume it before any project mutation.
  var staged = /** @type {any} */ (null);

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details };
  }
  /** @param {any} value @returns {boolean} */
  function positive(value) { return typeof value === "number" && isFinite(value) && value > 0; }
  /** @param {any} value @returns {boolean} */
  function isFootage(value) { return value instanceof FootageItem; }
  /** @param {string} path @returns {boolean} */
  function isLocalPath(path) {
    return (path.charAt(0) === "/" && path.charAt(1) !== "/") || path.substring(0, 2) === "~/" ||
      (/^[A-Za-z]$/.test(path.charAt(0)) && path.charAt(1) === ":" && (path.charAt(2) === "/" || path.charCodeAt(2) === 92));
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    for (var key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de textura desconhecido ou ainda nao implementado.", { field: key });
      }
    }
    if (typeof args.opacity !== "undefined" && (typeof args.opacity !== "number" || !isFinite(args.opacity) || args.opacity < 0 || args.opacity > 100)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "A opacidade precisa estar entre 0 e 100.", { field: "opacity" });
    }
    if (typeof args.blendMode !== "undefined" && (typeof args.blendMode !== "string" || !Object.prototype.hasOwnProperty.call(BLENDS, args.blendMode))) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de mescla de textura invalido.", { field: "blendMode" });
    }
    if (typeof args.fitMode !== "undefined" && args.fitMode !== "cover" && args.fitMode !== "contain" && args.fitMode !== "native") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Enquadramento de textura invalido.", { field: "fitMode" });
    }
    if (typeof args.assetIdOrPath !== "undefined" && (typeof args.assetIdOrPath !== "string" || args.assetIdOrPath.length === 0 || args.assetIdOrPath.length > 4096 || (args.assetIdOrPath.indexOf(String.fromCharCode(0)) !== -1 || /[\r\n]/.test(args.assetIdOrPath)) || !isLocalPath(args.assetIdOrPath))) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Selecione um arquivo local de imagem ou video. IDs de catalogo e URLs ainda nao sao suportados.", { field: "assetIdOrPath" });
    }
    return null;
  }
  /** @param {any} project @param {any} file @returns {any} */
  function existingFootage(project, file) {
    for (var i = 1; i <= project.numItems; i += 1) {
      var item = project.item(i);
      if (isFootage(item) && item.file && item.file.fsName === file.fsName && !item.footageMissing && item.hasVideo === true) return item;
    }
    return null;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    staged = null;
    var invalid = validate(args);
    if (invalid) return invalid;
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var project = /** @type {any} */ (app.project);
    var comp = project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    var FileApi = /** @type {any} */ (File);
    var ImportApi = /** @type {any} */ (ImportOptions);
    var ImportAs = /** @type {any} */ ($.global).ImportAsType;
    var blend = /** @type {any} */ (BLENDS)[typeof args.blendMode === "string" ? args.blendMode : "overlay"];
    var blendValue = /** @type {any} */ (BlendingMode)[blend];
    if (!ImportAs || typeof ImportAs.FOOTAGE === "undefined" || typeof blendValue === "undefined") {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O host nao expoe a importacao de footage ou o modo de mescla solicitado.");
    }
    var file, options;
    try {
      if (typeof args.assetIdOrPath === "string") file = new FileApi(args.assetIdOrPath);
      else {
        file = FileApi.openDialog("Escolha uma textura local (imagem ou video)");
        if (file === null) return failure(MotionContracts.ERROR.USER_CANCELLED, "Selecao de textura cancelada.");
      }
      if (!(file instanceof FileApi) || !file.exists || file.length <= 0 || !MEDIA_EXTENSION.test(file.name)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Escolha um arquivo de imagem ou video local, existente e nao vazio.");
      }
      options = new ImportApi(file);
      if (typeof options.canImportAs !== "function" || !options.canImportAs(ImportAs.FOOTAGE)) {
        return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects nao consegue importar esse arquivo como footage.");
      }
      options.importAs = ImportAs.FOOTAGE;
      options.sequence = false;
    } catch (probeError) {
      return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nao foi possivel ler ou reconhecer o arquivo de textura selecionado.");
    }
    if (project !== app.project || comp !== project.activeItem) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "A composicao ativa mudou. Aplique a textura novamente.");
    staged = { project: project, comp: comp, file: file, options: options, blend: blendValue, fingerprint: MotionJson.stringify(args), footage: existingFootage(project, file) };
    return null;
  }

  /** @param {any} comp @param {any} project @param {any[]} layers @param {any[]} properties @param {any[]} items @param {number} time */
  function restoreSelection(comp, project, layers, properties, items, time) {
    var i;
    comp.time = time;
    for (i = 1; i <= comp.numLayers; i += 1) comp.layer(i).selected = false;
    for (i = 0; i < layers.length; i += 1) layers[i].selected = true;
    for (i = 0; i < properties.length; i += 1) properties[i].selected = true;
    for (i = 1; i <= project.numItems; i += 1) project.item(i).selected = false;
    for (i = 0; i < items.length; i += 1) items[i].selected = true;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged;
    staged = null;
    if (!plan || plan.fingerprint !== MotionJson.stringify(args) || app.project !== plan.project || plan.project.activeItem !== plan.comp || !plan.file.exists) {
      throw new Error("A importacao de textura precisa de um preflight atualizado.");
    }
    var project = plan.project, comp = plan.comp;
    var layers = comp.selectedLayers, properties = comp.selectedProperties, items = project.selection;
    var time = comp.time;
    var imported = /** @type {any} */ (null), layer = /** @type {any} */ (null);
    var footage = plan.footage;
    var fitMode = typeof args.fitMode === "string" ? args.fitMode : "cover";
    var duration;
    try {
      if (!footage) {
        imported = project.importFile(plan.options);
        footage = imported;
      }
      if (!isFootage(footage) || footage.hasVideo !== true || !positive(footage.width) || !positive(footage.height) || !positive(footage.pixelAspect)) {
        throw new Error("A textura importada nao possui imagem valida.");
      }
      duration = footage.mainSource.isStill ? comp.duration : Math.min(comp.duration, footage.duration);
      if (!positive(duration)) throw new Error("A textura importada nao possui duracao valida.");
      layer = comp.layers.add(footage, duration);
      layer.name = MotionContracts.RIG_PREFIX + "TEXTURE";
      // Explicit timing avoids the user's still-footage import preference and
      // current-time insertion preference shifting the overlay unexpectedly.
      layer.startTime = 0;
      layer.inPoint = 0;
      layer.outPoint = duration;
      layer.blendingMode = plan.blend;
      layer.audioEnabled = false;
      var transform = layer.property("ADBE Transform Group");
      transform.property("ADBE Opacity").setValue(typeof args.opacity === "number" ? args.opacity : 100);
      transform.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
      var scale = 100;
      if (fitMode !== "native") {
        var widthRatio = comp.width * comp.pixelAspect / (footage.width * footage.pixelAspect);
        var heightRatio = comp.height / footage.height;
        scale = 100 * (fitMode === "contain" ? Math.min(widthRatio, heightRatio) : Math.max(widthRatio, heightRatio));
      }
      transform.property("ADBE Scale").setValue([scale, scale]);
      layer.moveToBeginning();
      restoreSelection(comp, project, layers, properties, items, time);
    } catch (error) {
      var rollbackFailed = false;
      if (layer) {
        try { layer.remove(); } catch (removeLayerError) { rollbackFailed = true; }
      }
      if (imported) {
        try {
          if (imported.usedIn.length !== 0) rollbackFailed = true;
          else imported.remove();
        } catch (removeFootageError) { rollbackFailed = true; }
      }
      try { restoreSelection(comp, project, layers, properties, items, time); } catch (restoreError) { rollbackFailed = true; }
      if (rollbackFailed) {
        var rollbackError = /** @type {Error & {motionCode?: string}} */ (new Error("Texture falhou e nao foi possivel restaurar todo o estado anterior."));
        rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      throw error;
    }
    return { changed: true, warnings: [], data: { imported: imported !== null, reusedFootage: imported === null, layerCreated: true, fitMode: fitMode, duration: duration } };
  }
  MotionRegistry.register("ae.asset.texture", { preflight: preflight, run: run });
}());
