/**
 * Encarar em um clique: um nulo gerenciado contem o seletor de alvo compartilhado.
 * 2D usa Rotacao Z com offset original; 3D/cameras usam Orientation e seis eixos.
 * O dispatcher e dono do Undo. O comando valida o lote antes de criar o nulo,
 * reutiliza metadata e restaura expressoes, controller e selecao se uma escrita falhar.
 */
(function () {
  /* global Property CameraLayer */
  var ALLOWED = {
    targetLayerName: true,
    forwardAxis: true,
    upAxis: true,
    offsetOrientation: true,
    constrainAxes: true
  };

  var MN = {
    transform: "ADBE Transform Group",
    orientation: "ADBE Orientation"
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} value @returns {boolean} */
  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function validateArgs(args) {
    var key;
    for (key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Look At desconhecido.", { field: key });
      }
    }
    for (key in ALLOWED) {
      if (Object.prototype.hasOwnProperty.call(ALLOWED, key) && !Object.prototype.hasOwnProperty.call(args, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento Look At ausente.", { field: key });
      }
    }
    if (typeof args.targetLayerName !== "string" || args.targetLayerName.length > 200) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Nome do alvo invalido.", { field: "targetLayerName" });
    }

    var suportados = MotionExpressions.lookAtSupportedAxes();
    var encontrado = false;
    var i;
    for (i = 0; i < suportados.length; i += 1) {
      if (suportados[i] === args.forwardAxis) encontrado = true;
    }
    if (!encontrado) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Eixo frontal fora dos suportados.", {
        field: "forwardAxis",
        supported: suportados
      });
    }
    // `lookAt` do After Effects nao aplica roll, entao a vertical do resultado e
    // sempre o +Y do mundo. Aceitar outro valor aqui prometeria uma correcao que
    // este comando nao faz.
    if (args.upAxis !== "+y") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Somente +y e suportado como eixo vertical.", {
        field: "upAxis"
      });
    }

    var offset = /** @type {Array<unknown>} */ (args.offsetOrientation);
    if (!offset || typeof offset.length !== "number" || offset.length !== 3) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de orientacao invalido.", {
        field: "offsetOrientation"
      });
    }
    for (i = 0; i < 3; i += 1) {
      if (!isFiniteNumber(offset[i]) || /** @type {number} */ (offset[i]) < -3600 || /** @type {number} */ (offset[i]) > 3600) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Offset de orientacao invalido.", {
          field: "offsetOrientation"
        });
      }
    }

    var travas = /** @type {Record<string, unknown>} */ (args.constrainAxes);
    if (!travas || typeof travas.x !== "boolean" || typeof travas.y !== "boolean" || typeof travas.z !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Travas de eixo invalidas.", { field: "constrainAxes" });
    }
    if (travas.x === true && travas.y === true && travas.z === true) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Travar os tres eixos deixaria o comando sem efeito.", {
        field: "constrainAxes"
      });
    }
    return null;
  }

  /** Explicit targets are resolved before mutation; the native Layer Control tracks
   * their identity through reorder/rename. Reapply repairs a renamed controller
   * reference using its metadata rather than creating another null.
   * @param {CompItem} comp @param {string} nome @returns {Layer|null} */
  function findLayerByName(comp, nome) {
    var i;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var camada = comp.layer(i);
      if (camada && camada.name === nome) return camada;
    }
    return null;
  }

  var TYPE = "look-at";
  var EFFECT_NAME = "Moti.on Encarar";

  /** @param {any} layer @returns {Property|null} */
  function rotationOf(layer) {
    var group = layer.property(MN.transform);
    if (!group) return null;
    var property = group.property(is3D(layer) ? MN.orientation : "ADBE Rotate Z");
    return property instanceof Property ? property : null;
  }

  /** @param {any} layer @returns {boolean} */
  function is3D(layer) {
    return layer.threeDLayer === true || (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer);
  }

  /** Only a metadata-owned null can be reused. @param {CompItem} comp @returns {any} */
  function controllerOf(comp) {
    var candidate = MotionRigMeta.findController(comp, TYPE);
    return candidate && candidate.nullLayer === true ? candidate : null;
  }

  /** The controller owns exactly one Layer Control. Names remain editable.
   * @param {any} controller @returns {any} */
  function controlOf(controller) {
    if (!controller) return null;
    var effects = controller.property("ADBE Effect Parade");
    var found = null;
    var i;
    for (i = 1; effects && i <= effects.numProperties; i += 1) {
      var effect = effects.property(i);
      if (effect && effect.matchName === "ADBE Layer Control") {
        if (found) return null;
        found = effect;
      }
    }
    return found;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    var validation = validateArgs(args);
    if (validation) return validation;
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var target = args.targetLayerName ? findLayerByName(comp, /** @type {string} */ (args.targetLayerName)) : null;
    if (args.targetLayerName && !target) return failure(MotionContracts.ERROR.NO_SELECTION, "O alvo escolhido nao existe na composicao.", null);
    var controller = controllerOf(comp);
    if (controller && controller.locked) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Desbloqueie o nulo de Encarar.", null);
    if (controller && !controlOf(controller)) return failure(MotionContracts.ERROR.HOST_OPERATION_FAILED, "O controle de alvo do nulo foi removido ou esta ambiguo.", null);
    var selected = comp.selectedLayers;
    var count = 0;
    var i;
    for (i = 0; selected && i < selected.length; i += 1) {
      var layer = /** @type {any} */ (selected[i]);
      if (layer === target || layer === controller) continue;
      var property = rotationOf(layer);
      if (!property || property.canSetExpression !== true) continue;
      if (layer.locked) return MotionErrors.failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "hostError.layerLocked", "Desbloqueie as camadas selecionadas para encarar.", null, { selectionIndex: i });
      var managed = is3D(layer) ? MotionExpressions.isManagedLookAt(property.expression) : MotionExpressions.isManagedLookAt2D(property.expression);
      if (property.expression !== "" && !managed) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, "A rotacao contem uma expressao de usuario.", { selectionIndex: i });
      count += 1;
    }
    if (count === 0) return failure(MotionContracts.ERROR.NO_SELECTION, "Selecione ao menos uma camada para encarar o alvo.", null);
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var comp = /** @type {CompItem} */ (app.project.activeItem);
    var controller = controllerOf(comp);
    var target = args.targetLayerName ? findLayerByName(comp, /** @type {string} */ (args.targetLayerName)) : null;
    // Copy references before addNull changes the native selection and all indices.
    var selected = comp.selectedLayers;
    var followers = [];
    var originalSelection = [];
    var has3D = false;
    var i;
    for (i = 0; i < selected.length; i += 1) {
      originalSelection.push(selected[i]);
      var selectedProperty = rotationOf(selected[i]);
      if (selected[i] !== target && selected[i] !== controller && selectedProperty && selectedProperty.canSetExpression === true) {
        followers.push(selected[i]);
        if (is3D(selected[i])) has3D = true;
      }
    }
    var created = false;
    var touched = [];
    var control = null;
    var previousTarget = null;
    var previous3D = controller ? controller.threeDLayer : false;
    var appliedCount = 0;
    var unchangedCount = 0;
    var controlChanged = false;
    try {
      if (!controller) {
        controller = comp.layers.addNull();
        created = true;
        var name = "Alvo (Moti.on)";
        var suffix = 2;
        while (findLayerByName(comp, name)) { name = "Alvo (Moti.on) " + suffix; suffix += 1; }
        controller.name = name;
        controller.threeDLayer = has3D;
        controller.property(MN.transform).property("ADBE Position").setValue(has3D ? [comp.width / 2, comp.height / 2, 0] : [comp.width / 2, comp.height / 2]);
        controller.comment = MotionRigMeta.write(controller.comment, MotionJson.stringify({
          namespace: "Moti.on", rigType: TYPE, schemaVersion: 1, role: "controller", rigId: "look-at-" + controller.id
        }));
        control = controller.property("ADBE Effect Parade").addProperty("ADBE Layer Control");
        control.name = EFFECT_NAME;
        control.property(1).setValue(target ? target.index : controller.index);
      } else {
        control = controlOf(controller);
        previousTarget = control.property(1).value;
        if (has3D && !controller.threeDLayer) { controller.threeDLayer = true; controlChanged = true; }
        if (target && previousTarget !== target.index) { control.property(1).setValue(target.index); controlChanged = true; }
        // A cleared/deleted target falls back to the null when reapplying.
        if (!target && previousTarget === 0) { control.property(1).setValue(controller.index); controlChanged = true; }
      }
      for (i = 0; i < followers.length; i += 1) {
        var layer = followers[i];
        var property = /** @type {Property} */ (rotationOf(layer));
        var tokens = { targetLayerName: args.targetLayerName, controllerName: controller.name, effectName: control.name,
          forwardAxis: args.forwardAxis, offsetOrientation: args.offsetOrientation, constrainAxes: args.constrainAxes };
        var expression = is3D(layer) ? MotionExpressions.renderLookAt(tokens) : MotionExpressions.renderLookAt2D(tokens);
        if (property.expression === expression && property.expressionEnabled === true) { unchangedCount += 1; continue; }
        touched.push({ property: property, expression: property.expression, enabled: property.expressionEnabled });
        property.expression = expression;
        property.expressionEnabled = true;
        if (property.expressionError) throw new Error("After Effects recusou a expressao de Encarar: " + property.expressionError);
        appliedCount += 1;
      }
    } catch (error) {
      var rollbackFailed = false;
      for (i = touched.length - 1; i >= 0; i -= 1) {
        try { var previous = touched[i]; if (previous) { previous.property.expression = previous.expression; previous.property.expressionEnabled = previous.enabled; } }
        catch (restoreError) { rollbackFailed = true; }
      }
      try {
        if (created) { controller.remove(); controller = null; }
        else if (controller) {
          controller.threeDLayer = previous3D;
          if (previousTarget !== null) control.property(1).setValue(previousTarget);
        }
      } catch (restoreControllerError) { rollbackFailed = true; }
      var failureError = /** @type {Error & {motionCode?: string}} */ (new Error("Nao foi possivel aplicar Encarar: " + String(error)));
      failureError.motionCode = rollbackFailed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failureError;
    } finally {
      // Preserve selected properties/keyframes by touching only selection changed by addNull.
      if (created && controller && controller.selected === true) controller.selected = false;
      for (i = 0; i < originalSelection.length; i += 1) {
        var selectedLayer = /** @type {any} */ (originalSelection[i]);
        if (selectedLayer && selectedLayer.selected !== true) selectedLayer.selected = true;
      }
    }
    return { changed: created || controlChanged || appliedCount > 0, warnings: [], data: {
      appliedCount: appliedCount, unchangedCount: unchangedCount, controllerName: controller.name, controllerLayerIndex: controller.index
    } };
  }

  MotionRegistry.register("ae.3d.look-at", { preflight: preflight, run: run });
})();
