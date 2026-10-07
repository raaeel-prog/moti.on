/* global FootageItem */
(function () {
  var staged = /** @type {any} */ (null);
  var ALLOWED = { keepOriginal: true };
  var MENU_NAMES = ["Create Shapes from Vector Layer", "Criar formas a partir da camada de vetor", "Criar formas a partir de camada de vetor"];

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return { code: code, message: message, recoverable: true, details: null }; }
  /** @param {any} layer @returns {boolean} */
  function isIllustratorLayer(layer) {
    if (layer.locked || !layer.source || !(layer.source instanceof FootageItem)) return false;
    var file = layer.source.file;
    return !!file && typeof file.name === "string" && /\.ai$/i.test(file.name);
  }
  /** @param {any[]} haystack @param {any} needle @returns {boolean} */
  function contains(haystack, needle) {
    for (var i = 0; i < haystack.length; i++) if (haystack[i] === needle) return true;
    return false;
  }
  /** @param {any} comp @returns {any[]} */
  function allLayers(comp) {
    var result = [];
    for (var i = 1; i <= comp.numLayers; i++) result.push(comp.layer(i));
    return result;
  }
  /** @param {any} comp @param {any[]} before @returns {any[]} */
  function addedLayers(comp, before) {
    var added = [], now = allLayers(comp);
    for (var i = 0; i < now.length; i++) if (!contains(before, now[i])) added.push(now[i]);
    return added;
  }
  /** @param {any} comp @param {any[]} selected @param {any[]} properties @param {number} time */
  function restore(comp, selected, properties, time) {
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    for (i = 0; i < selected.length; i++) selected[i].selected = true;
    for (i = 0; i < properties.length; i++) properties[i].selected = true;
    comp.time = time;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    staged = null;
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Parametro de conversao ainda nao suportado.");
    }
    if (typeof args.keepOriginal !== "undefined" && typeof args.keepOriginal !== "boolean") return failure(MotionContracts.ERROR.INVALID_PRESET, "keepOriginal precisa ser booleano.");
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    var selected = comp.selectedLayers;
    if (!selected || selected.length === 0) return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada Illustrator.");
    var targets = [];
    for (var i = 0; i < selected.length; i++) {
      if (!isIllustratorLayer(selected[i])) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Selecione somente camadas desbloqueadas de arquivos .ai.");
      targets.push(selected[i]);
    }
    var host = /** @type {any} */ (app);
    if (typeof host.findMenuCommandId !== "function" || typeof host.executeCommand !== "function") {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O host nao expoe o comando de conversao vetorial.");
    }
    var commandId = 0;
    for (i = 0; i < MENU_NAMES.length && !commandId; i++) commandId = host.findMenuCommandId(MENU_NAMES[i]);
    if (typeof commandId !== "number" || commandId <= 0 || Math.floor(commandId) !== commandId) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "Create Shapes from Vector Layer nao foi localizado neste idioma do After Effects.");
    }
    staged = { project: app.project, comp: comp, targets: targets, commandId: commandId, keepOriginal: args.keepOriginal === true };
    return null;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged;
    staged = null;
    if (!plan || app.project !== plan.project || plan.comp !== plan.project.activeItem || plan.keepOriginal !== (args.keepOriginal === true)) throw new Error("Preflight vetorial expirado.");
    var comp = plan.comp, selected = comp.selectedLayers, properties = comp.selectedProperties || [], time = comp.time;
    if (selected.length !== plan.targets.length) throw new Error("A selecao mudou durante a conversao.");
    var i, j, target, before, created = [], oldEnabled = [], baseline = allLayers(comp);
    for (i = 0; i < selected.length; i++) if (selected[i] !== plan.targets[i]) throw new Error("A selecao mudou durante a conversao.");
    for (i = 0; i < plan.targets.length; i++) oldEnabled.push(plan.targets[i].enabled);
    try {
      for (i = 0; i < plan.targets.length; i++) {
        target = plan.targets[i];
        before = allLayers(comp);
        for (j = 1; j <= comp.numLayers; j++) comp.layer(j).selected = false;
        target.selected = true;
        (/** @type {any} */ (app)).executeCommand(plan.commandId);
        var added = addedLayers(comp, before);
        if (added.length !== 1 || added[0].matchName !== "ADBE Vector Layer" || !contains(allLayers(comp), target)) {
          throw new Error("O comando de menu nao criou exatamente uma shape layer; nenhuma conversao foi confirmada.");
        }
        created.push(added[0]);
        target.enabled = plan.keepOriginal;
      }
      return { changed: true, warnings: [], data: { convertedCount: created.length } };
    } catch (error) {
      var rollback = addedLayers(comp, baseline), rollbackFailed = false;
      for (i = rollback.length - 1; i >= 0; i--) try { rollback[i].remove(); } catch (ignored) { rollbackFailed = true; }
      for (i = 0; i < plan.targets.length; i++) try { plan.targets[i].enabled = oldEnabled[i]; } catch (ignoredEnabled) { rollbackFailed = true; }
      var failed = /** @type {Error & {motionCode?: string}} */ (new Error("Illustrator to Vector falhou: " + String(error)));
      failed.motionCode = rollbackFailed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failed;
    } finally {
      restore(comp, selected, properties, time);
    }
  }
  MotionRegistry.register("ae.vector.ai-to-vector", { preflight: preflight, run: run });
})();
