/** Plan the entire selection before opening the dispatcher-owned Undo group. */
(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return { code: code, message: message, recoverable: true, details: null }; }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !(false)) return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido.");
    return MotionKeyframes.planEdit(comp, "reverse", "after").error;
  }
  /** @returns {MotionCommandResult} */
  function run() {
    return MotionKeyframes.applyEdit(MotionKeyframes.planEdit(/** @type {CompItem} */ (app.project.activeItem), "reverse", "after"));
  }
  MotionRegistry.register("ae.keys.reverse", { preflight: preflight, run: run });
}());
