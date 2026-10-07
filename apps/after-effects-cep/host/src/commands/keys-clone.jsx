/** Plan the entire selection before opening the dispatcher-owned Undo group. */
(function () {
  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) { return { code: code, message: message, recoverable: true, details: null }; }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.");
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !(key === "mode" || key === "destination")) return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido.");
    if (typeof args.mode !== "undefined" && args.mode !== "repeat" && args.mode !== "mirror") return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo de duplicacao invalido.");
    if (typeof args.destination !== "undefined" && args.destination !== "after" && args.destination !== "after-gap" && args.destination !== "cti" && args.destination !== "comp-start" && args.destination !== "comp-end" && args.destination !== "layer-start" && args.destination !== "layer-end" && args.destination !== "work-area-end") return failure(MotionContracts.ERROR.INVALID_PRESET, "Destino de duplicacao invalido.");
    return MotionKeyframes.planEdit(comp, args.mode === "mirror" ? "mirror" : "repeat", typeof args.destination === "string" ? args.destination : "after").error;
  }
  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    return MotionKeyframes.applyEdit(MotionKeyframes.planEdit(/** @type {CompItem} */ (app.project.activeItem), args.mode === "mirror" ? "mirror" : "repeat", typeof args.destination === "string" ? args.destination : "after"));
  }
  MotionRegistry.register("ae.keys.clone", { preflight: preflight, run: run });
}());
