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
    var selectedLayers = comp.selectedLayers;
    
    var birthRate = typeof args.birthRate === "number" ? args.birthRate : 2;
    var longevity = typeof args.longevity === "number" ? args.longevity : 1;
    var velocity = typeof args.velocity === "number" ? args.velocity : 1;

    // Sem beginUndoGroup aqui: o dispatcher ja abre o grupo do comando, com o
    // rotulo localizado do descriptor. O After Effects nao aninha grupos, entao
    // um segundo par aqui fecharia o grupo de fora no meio do comando.
    try {
      var targetLayer;
      if (selectedLayers && selectedLayers.length > 0) {
        targetLayer = selectedLayers[0];
      } else {
        targetLayer = /** @type {any} */ (comp.layers).addSolid([0, 0, 0], "Particles", comp.width, comp.height, /** @type {any} */ (comp).pixelAspect, comp.duration);
        targetLayer.selected = true;
      }

      var effectGroup = /** @type {Property} */ (targetLayer.property("ADBE Effect Parade"));
      var particleEffect;

      // Check if it already has CC Particle World
      for (var i = 1; i <= /** @type {any} */ (effectGroup).numProperties; i++) {
        var eff = /** @type {Property} */ (/** @type {any} */ (effectGroup).property(i));
        if (eff.matchName === "CC Particle World") {
          particleEffect = eff;
          break;
        }
      }

      if (!particleEffect) {
        if (!/** @type {any} */ (effectGroup).canAddProperty("CC Particle World")) {
          return { changed: false, warnings: [failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "CC Particle World indisponível no host.")], data: {} };
        }
        particleEffect = /** @type {Property} */ (/** @type {any} */ (effectGroup).addProperty("CC Particle World"));
      }

      var birthRateProp = /** @type {Property} */ (/** @type {any} */ (particleEffect).property("Birth Rate"));
      if (birthRateProp) birthRateProp.setValue(birthRate);

      var longevityProp = /** @type {Property} */ (/** @type {any} */ (particleEffect).property("Longevity (sec)"));
      if (longevityProp) longevityProp.setValue(longevity);

      // CC Particle World groups properties
      var physicsGroup = /** @type {Property} */ (/** @type {any} */ (particleEffect).property("Physics"));
      if (physicsGroup) {
        var velocityProp = /** @type {Property} */ (/** @type {any} */ (physicsGroup).property("Velocity"));
        if (velocityProp) velocityProp.setValue(velocity);
      }

      return { changed: true, warnings: [], data: {} };
    } catch (e) {
      var failErr = /** @type {Error & {motionCode?: string}} */ (new Error("Particles falhou: " + (/** @type {any} */ (e)).toString()));
      failErr.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failErr;
    }
  }

  MotionRegistry.register("ae.effect.particles", {
    preflight: preflight,
    run: run
  });
})();
