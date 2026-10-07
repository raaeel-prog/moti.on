/** Parallax v3: frozen reference projection, persistent originals and transactional edits.
 * Both Quick and Create use this executor. The dispatcher owns the single Undo group.
 * Indices are captured BEFORE addCamera/addNull; identity uses AE Layer.id (22+).
 */
/* global CameraLayer BlendingMode KeyframeInterpolationType */
(function () {
  var TYPE = "parallax.quick";
  var TR = "ADBE Transform Group";
  var POS = "ADBE Position";
  var SCALE = "ADBE Scale";
  var ANCHOR = "ADBE Anchor Point";
  var ROT = "ADBE Rotate Z";
  /** @param {any} layer @param {string} name @returns {any} */
  function prop(layer, name) { return layer.property(TR).property(name); }
  /** @param {any} camera @param {string} name @returns {any} */
  function option(camera, name) { return camera.property("ADBE Camera Options Group").property(name); }
  /** @param {string} message @returns {never} */
  function reject(message) { throw new Error(message); }
  /** @param {any} value @returns {any} */
  function copy(value) { return MotionJson.parse(MotionJson.stringify(value)); }
  /** @param {any} a @param {any} b @returns {boolean} */
  function equal(a, b) {
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.001;
    if (a instanceof Array && b instanceof Array && a.length === b.length) {
      for (var i = 0; i < a.length; i += 1) if (!equal(a[i], b[i])) return false;
      return true;
    }
    return a === b;
  }
  /** @param {any} p */
  function requireStatic(p) {
    if (!p || p.numKeys > 0 || p.expression) reject("Parallax: use transformacoes estaticas, sem expressoes.");
    var v = p.value;
    var values = v instanceof Array ? v : [v];
    for (var i = 0; i < values.length; i += 1) {
      if (typeof values[i] !== "number" || !isFinite(values[i])) reject("Parallax: transformacao invalida.");
    }
  }
  /** @param {any} property @returns {any} */
  function raw(property) {
    return copy(property.expression ? property.valueAtTime(/** @type {any} */ (app.project.activeItem).time, true) : property.value);
  }
  /** @param {any} frame @returns {{position: string, scale: string}} */
  function expressions(frame) {
    var header = "// Moti.on Parallax projection v3\n";
    var factor = "var f = " + frame.zoom + ";\n";
    return {
      position: header + factor + "var z = Math.max(value[2], -0.9*f);\nvar k = 1 + z/f;\n" +
        "[" + frame.cx + " + (value[0] - " + frame.cx + ")*k, " + frame.cy + " + (value[1] - " + frame.cy + ")*k, z];",
      scale: header + factor + "var k = 1 + transform.position[2]/f;\n[value[0]*k, value[1]*k, value[2]];"
    };
  }
  /** @param {any} layer @returns {any} */
  function snapshot(layer) {
    return { id: layer.id, threeD: layer.threeDLayer, collapseTransformation: !!layer.collapseTransformation, position: raw(prop(layer, POS)),
      positionExpression: prop(layer, POS).expression || "",
      scaleExpression: prop(layer, SCALE).expression || "",
      scale: raw(prop(layer, SCALE)), anchor: copy(prop(layer, ANCHOR).value),
      rotation: prop(layer, ROT).value };
  }
  /** @param {any} layer @param {any} state */
  function restore(layer, state) {
    prop(layer, POS).expression = "";
    prop(layer, SCALE).expression = "";
    if (layer.source instanceof CompItem && typeof state.collapseTransformation === "boolean") layer.collapseTransformation = state.collapseTransformation;
    layer.threeDLayer = state.threeD;
    prop(layer, POS).setValue(state.position);
    prop(layer, SCALE).setValue(state.scale);
    prop(layer, ANCHOR).setValue(state.anchor);
    prop(layer, ROT).setValue(state.rotation);
    if (state.positionExpression) { prop(layer, POS).expression = state.positionExpression; prop(layer, POS).expressionEnabled = true; }
    if (state.scaleExpression) { prop(layer, SCALE).expression = state.scaleExpression; prop(layer, SCALE).expressionEnabled = true; }
  }
  /** @param {any} layer @returns {any} */
  function metadata(layer) {
    var s = layer.comment || "";
    var start = s.indexOf(MotionContracts.META_OPEN);
    var end = s.indexOf(MotionContracts.META_CLOSE);
    if (start < 0 || end <= start) return null;
    try { return MotionJson.parse(s.substring(start + MotionContracts.META_OPEN.length, end)); }
    catch (e) { return null; }
  }
  /** @param {any} comp @param {number} id @returns {any} */
  function byId(comp, id) {
    for (var i = 1; i <= comp.numLayers; i += 1) if (comp.layer(i).id === id) return comp.layer(i);
    return null;
  }
  /** @param {any} comp @returns {any} */
  function existing(comp) {
    var found = null;
    for (var i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i);
      if (MotionRigMeta.has(layer.comment, TYPE)) {
        if (found) reject("Parallax: ha mais de um rig nesta composicao.");
        var data = metadata(layer);
        if (!data || (data.schemaVersion !== 2 && data.schemaVersion !== 3) || data.compId !== comp.id || data.state !== "committed") {
          reject("Parallax: rig antigo, duplicado ou incompleto. Use uma montagem 2D original.");
        }
        found = { master: layer, data: data };
      }
    }
    return found;
  }
  /** Collapsed 2D precomps remain planes; nested 3D scenes do not.
   * @param {any} source @param {number} depth */
  function validateCollapsedSource(source, depth) {
    if (depth > 32) reject("Parallax: precomp recolhida muito aninhada. Desative recolher transformacoes nessa precomp.");
    for (var i = 1; i <= source.numLayers; i += 1) {
      var child = source.layer(i);
      if (!child.enabled || child.guideLayer) continue;
      if (child.threeDLayer || child instanceof CameraLayer) reject("Parallax: a precomp recolhida contem uma cena 3D. Desative recolher transformacoes nessa precomp.");
      if (child.source instanceof CompItem && child.collapseTransformation) validateCollapsedSource(child.source, depth + 1);
    }
  }
  /** @param {any} layer @param {boolean} owned */
  function validateLayer(layer, owned) {
    if (!layer || typeof layer.id !== "number" || layer.locked || layer.guideLayer ||
        layer.enabled === false || !layer.hasVideo || layer.nullLayer || layer.adjustmentLayer ||
        layer.parent || (!owned && layer.threeDLayer)) reject("Parallax: selecione imagens visiveis, desbloqueadas e sem parent.");
    // Precomps, footage (PSD/PNG/video), text and shapes are all planar AV layers.
    // The source format does not determine perspective compatibility.
    if (!prop(layer, POS) || !prop(layer, SCALE) || !prop(layer, ANCHOR)) reject("Parallax: selecione camadas visuais ou precomps.");
    if ((layer.source && typeof layer.source.pixelAspect === "number" && layer.source.pixelAspect !== 1) ||
        layer.hasTrackMatte || layer.isTrackMatte || layer.preserveTransparency ||
        (typeof BlendingMode !== "undefined" && layer.blendingMode !== BlendingMode.NORMAL)) {
      reject("Parallax: precomponha matte ou mesclagem especial e use pixels quadrados.");
    }
    if (layer.source instanceof CompItem && layer.collapseTransformation) validateCollapsedSource(layer.source, 0);
    var styles = layer.property("ADBE Layer Styles");
    if (styles && styles.numProperties > 0) {
      for (var s = 1; s <= styles.numProperties; s += 1) {
        var style = styles.property(s);
        if (style && style.enabled && style.matchName !== "ADBE Blend Options Group") {
          reject("Parallax: estilos de camada exigem pre-render.");
        }
      }
    }
    var position = prop(layer, POS);
    if (position.dimensionsSeparated) reject("Parallax: reuna as dimensoes de Position antes de criar ou ajustar.");
    var names = [ANCHOR, ROT];
    if (!owned) names = names.concat([POS, SCALE]);
    else if (prop(layer, POS).numKeys || prop(layer, SCALE).numKeys) reject("Parallax: preserve os keyframes de transformacao antes de redistribuir profundidades.");
    if (owned) names = names.concat(["ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y"]);
    for (var n = 0; n < names.length; n += 1) requireStatic(prop(layer, /** @type {string} */ (names[n])));
    if (owned && (!equal(prop(layer, "ADBE Orientation").value, [0, 0, 0]) ||
        prop(layer, "ADBE Rotate X").value !== 0 || prop(layer, "ADBE Rotate Y").value !== 0)) {
      reject("Parallax: os planos do rig foram modificados. Preserve a montagem antes de ajustar.");
    }
  }
  /** @param {any} comp @param {any[]} layers @param {any} rig */
  function validateScene(comp, layers, rig) {
    if (comp.pixelAspect !== 1 || comp.renderer !== "ADBE Advanced 3d") {
      reject("Parallax: use pixels quadrados e o renderizador Classic 3D.");
    }
    /** @type {Record<string, boolean>} */
    var ids = {};
    for (var i = 0; i < layers.length; i += 1) ids[layers[i].id] = true;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i);
      if (ids[layer.id] || (rig && (layer === rig.master || layer.id === rig.data.cameraId))) continue;
      if (layer.solo || (typeof LightLayer !== "undefined" && layer instanceof LightLayer && layer.enabled)) {
        reject("Parallax: desative solo e luzes externas antes de aplicar.");
      }
      if (layer instanceof CameraLayer || layer.threeDLayer) {
        reject("Parallax: cameras ou camadas 3D externas impedem criar este rig com seguranca.");
      }
      // Unselected 2D overlays (including locked color/light precomps) retain
      // their stacking position and stay outside the depth rig.
    }
  }
  /** @param {any} args @returns {any} */
  function plan(args) {
    var active = app.project.activeItem;
    if (!(active instanceof CompItem)) reject("Abra uma composicao.");
    var comp = /** @type {any} */ (active);
    /** @type {Record<string, number>} */
    var allowed = {depthStep: 1, strength: 1, orderMode: 1, createCamera: 1, preserveFraming: 1, controllerName: 1};
    for (var key in args) if (!allowed[key]) reject("Parallax: argumento invalido.");
    if (typeof args.depthStep !== "number" || !isFinite(args.depthStep) || args.depthStep < 0 || args.depthStep > 100000 ||
        typeof args.strength !== "number" || !isFinite(args.strength) || args.strength < 0 || args.strength > 10 ||
        (args.orderMode !== "timeline" && args.orderMode !== "selection") || typeof args.createCamera !== "boolean" ||
        args.preserveFraming !== true || typeof args.controllerName !== "string" || !args.controllerName.length || args.controllerName.length > 120) {
      reject("Parallax: parametros invalidos; preservar enquadramento deve estar ativo.");
    }
    var rig = existing(comp);
    /** @type {any[]} */
    var layers = [];
    var originals = [];
    var i;
    if (rig) {
      if (!rig.data.originals || rig.data.originals.length < 2 || rig.master.locked) reject("Parallax: metadata incompleta ou controle bloqueado.");
      for (i = 0; i < rig.data.originals.length; i += 1) {
        var original = rig.data.originals[i];
        var member = byId(comp, original.id);
        validateLayer(member, true);
        var current = snapshot(member);
        if (rig.data.schemaVersion === 3) {
          var expected = expressions(rig.data.frame);
          if (current.positionExpression !== expected.position || current.scaleExpression !== expected.scale ||
              !prop(member, POS).expressionEnabled || !prop(member, SCALE).expressionEnabled) {
            reject("Parallax: uma expressao de compensacao foi alterada ou desativada. Restaure-a antes de ajustar.");
          }
          // Z is intentionally editable. Original XY/Scale/Anchor are kept for redistribution/removal.
          if (!equal(current.position.slice(0, 2), original.position.slice(0, 2)) || !equal(current.scale.slice(0, 2), original.scale.slice(0, 2))) {
            reject("Parallax: a montagem original foi editada. Preserve essas alteracoes antes de ajustar.");
          }
        } else if (!equal(current.position, rig.data.applied[i].position) || !equal(current.scale, rig.data.applied[i].scale) || current.positionExpression || current.scaleExpression) {
          reject("Parallax: os planos do rig foram modificados. Preserve a montagem antes de ajustar.");
        }
        if (!equal(current.anchor, rig.data.applied[i].anchor) || !equal(current.rotation, rig.data.applied[i].rotation)) reject("Parallax: a montagem original foi editada. Preserve essas alteracoes antes de ajustar.");
        layers.push(member); originals.push(original);
      }
      var selected = comp.selectedLayers;
      for (i = 0; i < selected.length; i += 1) {
        if (selected[i] !== rig.master && selected[i].id !== rig.data.cameraId && !byOriginal(originals, selected[i].id)) {
          reject("Parallax: a selecao mistura o rig com outras camadas.");
        }
      }
      var camera = byId(comp, rig.data.cameraId);
      if (!camera || comp.activeCamera !== camera || camera.locked || (rig.data.schemaVersion === 3 ? camera.parent !== rig.master : camera.parent) || !camera.enabled ||
          camera.inPoint > 0 || camera.outPoint < comp.duration || camera.autoOrient !== AutoOrientType.NO_AUTO_ORIENT ||
          !equal(prop(camera, "ADBE Orientation").value, [0, 0, 0]) ||
          prop(camera, "ADBE Rotate X").value !== 0 || prop(camera, "ADBE Rotate Y").value !== 0 || prop(camera, ROT).value !== 0 ||
          !equal(option(camera, "ADBE Camera Zoom").value, rig.data.frame.zoom)) {
        reject("Parallax: a camera de referencia foi alterada ou esta indisponivel.");
      }
      requireStatic(option(camera, "ADBE Camera Zoom"));
      var cameraNames = ["ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y", ROT];
      for (var cn = 0; cn < cameraNames.length; cn += 1) requireStatic(prop(camera, /** @type {string} */ (cameraNames[cn])));
      if (comp.width / 2 !== rig.data.frame.cx || comp.height / 2 !== rig.data.frame.cy) reject("Parallax: a composicao mudou de tamanho. Use a montagem original.");
      var cameraPosition = prop(camera, POS);
      if (cameraPosition.expression || cameraPosition.dimensionsSeparated) reject("Parallax: a camera tem expressao ou dimensoes separadas.");
      if (rig.data.schemaVersion === 3) {
        if (!rig.master.threeDLayer || rig.master.parent || cameraPosition.numKeys || !equal(cameraPosition.value, [0, 0, -rig.data.frame.zoom])) reject("Parallax: mova a camera pelo null de controle; preserve o vinculo do rig.");
      }

    } else {
      var selection = comp.selectedLayers;
      for (i = 0; i < selection.length; i += 1) layers.push(selection[i]);
      // Preserve the host's selection sequence when requested. Sorting here
      // made both modes identical and silently ignored the user's choice.
      if (args.orderMode === "timeline") layers.sort(function (a, b) { return a.index - b.index; });
      if (layers.length < 2 || layers.length > 64) reject("Parallax: selecione de 2 a 64 camadas visuais na timeline.");
      if (!args.createCamera) reject("Parallax: ative Criar camera para esta montagem 2D.");
      for (i = 0; i < layers.length; i += 1) {
        validateLayer(layers[i], false);
        if (layers[i].solo) reject("Parallax: desative solo e luzes externas antes de aplicar.");
        originals.push(snapshot(layers[i]));
      }
    }
    validateScene(comp, layers, rig);
    return { comp: comp, rig: rig, layers: layers, originals: originals };
  }
  /** @param {any[]} originals @param {number} id @returns {boolean} */
  function byOriginal(originals, id) {
    for (var i = 0; i < originals.length; i += 1) if (originals[i].id === id) return true;
    return false;
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    try { var p = plan(args); if (p.rig && p.rig.data.schemaVersion === 2) reject("Parallax: restaure a montagem 2D do rig anterior antes de criar a versao editavel."); return null; }
    catch (e) { return { code: MotionContracts.ERROR.INVALID_SELECTION_TYPE, message: /** @type {Error} */ (e).message, recoverable: true, details: null }; }
  }
  /** @param {any} original @param {number} z @param {any} frame @returns {any} */
  function compensate(original, z, frame) {
    var k = (frame.zoom + z) / frame.zoom;
    if (!isFinite(k) || k <= 0.1) reject("Parallax: profundidade muito proxima da camera.");
    return { id: original.id, threeD: true,
      position: [frame.cx + (original.position[0] - frame.cx) * k, frame.cy + (original.position[1] - frame.cy) * k, z],
      scale: [original.scale[0] * k, original.scale[1] * k, 100],
      anchor: [original.anchor[0], original.anchor[1], 0], rotation: original.rotation };
  }
  /** @param {any} args @param {any} [context] @param {any} [options] @returns {MotionCommandResult} */
  function run(args, context, options) {
    if (context) { /* The dispatcher carries host context; the DOM remains authoritative. */ }
    var p = plan(args);
    var comp = p.comp;
    if (p.rig && p.rig.data.schemaVersion === 3 && options && options.mode === "quick") {
      return {changed: false, warnings: [], data: {mode: "adjust", status: "reused", layerCount: p.layers.length, rigId: p.rig.data.rigId}};
    }
    if (p.rig && p.rig.data.schemaVersion === 2) reject("Parallax: restaure a montagem 2D do rig anterior antes de criar a versao editavel.");
    var created = [];
    /** @type {any[]} */
    var journal = [];
    var master = p.rig ? p.rig.master : null;
    var oldComment = master ? master.comment : null;
    var selection = [];
    var i;
    for (i = 0; i < comp.selectedLayers.length; i += 1) selection.push(comp.selectedLayers[i]);
    try {
      var camera = p.rig ? byId(comp, p.rig.data.cameraId) : comp.layers.addCamera(MotionContracts.RIG_PREFIX + "PARALLAX | CAMERA", [comp.width / 2, comp.height / 2]);
      if (!p.rig) {
        created.push(camera);
        camera.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
        camera.parent = null;
        camera.inPoint = 0; camera.outPoint = comp.duration;
        camera.moveToBeginning();
        option(camera, "ADBE Camera Zoom").setValue(3000);
        var zoom = option(camera, "ADBE Camera Zoom").value;
        if (typeof zoom !== "number" || !isFinite(zoom) || zoom <= 0) reject("Parallax: Zoom da camera invalido.");
        prop(camera, POS).setValue([comp.width / 2, comp.height / 2, -zoom]);
        prop(camera, "ADBE Orientation").setValue([0, 0, 0]);
        prop(camera, "ADBE Rotate X").setValue(0);
        prop(camera, "ADBE Rotate Y").setValue(0);
        prop(camera, ROT).setValue(0);
        option(camera, "ADBE Camera Depth of Field").setValue(0);
        master = comp.layers.addNull(comp.duration); created.push(master);
        master.name = args.controllerName;
        master.guideLayer = true;
        master.threeDLayer = true;
        prop(master, ANCHOR).setValue([0, 0, 0]);
        prop(master, POS).setValue([comp.width / 2, comp.height / 2, 0]);
        camera.parent = master;
        prop(camera, POS).setValue([0, 0, -zoom]);
      }
      var frame = p.rig ? p.rig.data.frame : {cx: comp.width / 2, cy: comp.height / 2, zoom: option(camera, "ADBE Camera Zoom").value};
      var total = (args.depthStep === 0 ? frame.zoom * (5 / 6) : args.depthStep * (p.layers.length - 1)) * args.strength;
      if (p.rig && options && options.mode === "quick") total = p.rig.data.totalDepth;
      if (!isFinite(total) || total > frame.zoom * 0.85) reject("Parallax: profundidade total excede 85% do Zoom. Reduza o passo ou a intensidade.");
      if (p.rig && p.rig.data.motion && -total - p.rig.data.motion.end[2] + (p.rig.data.schemaVersion === 3 ? frame.zoom : 0) <= frame.zoom * 0.1) reject("Parallax: profundidade muito proxima da camera.");
      var applied = [];
      for (i = 0; i < p.layers.length; i += 1) {
        var z = -total * (p.layers.length - 1 - i) / (p.layers.length - 1);
        var original = p.originals[i];
        var compensation = compensate(original, z, frame);
        var exp = expressions(frame);
        var next = {id: original.id, threeD: true, position: [original.position[0], original.position[1], z],
          scale: [original.scale[0], original.scale[1], 100], anchor: compensation.anchor, rotation: original.rotation,
          collapseTransformation: false, positionExpression: exp.position, scaleExpression: exp.scale};
        journal.push({layer: p.layers[i], state: snapshot(p.layers[i])});
        restore(p.layers[i], next);
        var actual = snapshot(p.layers[i]);
        if (!equal(actual.position, next.position) || !equal(actual.scale, next.scale) || !equal(actual.anchor, next.anchor) || !actual.threeD) {
          reject("Parallax: o After Effects nao confirmou as transformacoes.");
        }
        if (prop(p.layers[i], POS).expressionError || prop(p.layers[i], SCALE).expressionError) reject("Parallax: o After Effects recusou a compensacao por expressao.");
        applied.push(next);
      }
      if (comp.activeCamera !== camera || p.layers[p.layers.length - 1].parent || prop(p.layers[p.layers.length - 1], POS).value[2] !== 0) {
        reject("Parallax: camera ativa ou fundo nao confirmado.");
      }
      /** @type {any} */
      var data = {schemaVersion: 3, rigType: TYPE, rigId: p.rig ? p.rig.data.rigId : "parallax-" + comp.id + "-" + master.id,
        pluginVersion: MotionContracts.PLUGIN_VERSION, compId: comp.id, cameraId: camera.id,
        referenceTime: p.rig ? p.rig.data.referenceTime : comp.time, frame: frame,
        originals: p.originals, applied: applied, totalDepth: total, state: "committed"};
      if (p.rig && p.rig.data.motion) data.motion = p.rig.data.motion;
      master.comment = MotionRigMeta.write(master.comment, MotionJson.stringify(data));
      return {changed: true, warnings: [], data: {mode: p.rig ? "adjust" : "create", status: p.rig ? "adjusted" : "created",
        rigId: data.rigId, layerCount: p.layers.length, cameraDistance: frame.zoom, backgroundZ: 0,
        totalDepth: total, cameraActiveAtReference: true, referenceProjectionCheck: "not-run", motionApplied: false}};
    } catch (e) {
      var failed = false;
      for (i = journal.length - 1; i >= 0; i -= 1) {
        try { restore(journal[i].layer, journal[i].state); } catch (restoreError) { failed = true; }
      }
      if (p.rig) { try { master.comment = oldComment; } catch (commentError) { failed = true; } }
      for (i = created.length - 1; i >= 0; i -= 1) { try { created[i].remove(); } catch (removeError) { failed = true; } }
      var error = /** @type {Error & {motionCode?: string}} */ (new Error(failed ? "Parallax: restauracao incompleta. Use Desfazer." : /** @type {Error} */ (e).message));
      error.motionCode = failed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw error;
    } finally {
      for (i = 1; i <= comp.numLayers; i += 1) { try { comp.layer(i).selected = false; } catch (deselectError) { /* Host selection is best effort. */ } }
      for (i = 0; i < selection.length; i += 1) { try { selection[i].selected = true; } catch (selectError) { /* Deleted selection cannot be restored. */ } }
    }
  }

  /** @returns {any} */
  function managedRig() {
    var comp = /** @type {any} */ (app.project.activeItem);
    if (!(app.project.activeItem instanceof CompItem)) reject("Abra uma composicao.");
    var rig = existing(comp);
    if (!rig) reject("Parallax: crie o rig antes de aplicar movimento.");
    var checked = plan({depthStep: 0, strength: 1, orderMode: "timeline", createCamera: true, preserveFraming: true, controllerName: "Parallax"});
    checked.camera = byId(comp, rig.data.cameraId);
    checked.motionLayer = rig.data.schemaVersion === 3 ? rig.master : checked.camera;
    return checked;
  }
  /** @param {any} args @returns {any} */
  function movementPlan(args) {
    var p = managedRig();
    if (args.preset !== "subtle" && args.preset !== "truck" && args.preset !== "vertical" && args.preset !== "dolly") reject("Parallax: movimento invalido.");
    for (var key in args) if (key !== "preset" && key !== "durationSeconds") reject("Parallax: argumento invalido.");
    if (typeof args.durationSeconds !== "number" || !isFinite(args.durationSeconds) || args.durationSeconds <= 0 || args.durationSeconds > 60) reject("Parallax: duracao invalida.");
    var t = p.rig.data.referenceTime;
    if (t + args.durationSeconds > p.comp.duration || t < 0) reject("Parallax: nao ha tempo suficiente para o movimento.");
    var position = prop(p.motionLayer, POS);
    requireStatic(position);
    if (position.dimensionsSeparated || !equal(position.value, [p.rig.data.frame.cx, p.rig.data.frame.cy, p.rig.data.schemaVersion === 3 ? 0 : -p.rig.data.frame.zoom])) reject("Parallax: restaure a posicao de referencia da camera antes de animar.");
    var start = copy(position.value);
    var end = copy(start);
    if (args.preset === "subtle" || args.preset === "truck") end[0] += p.comp.width * 0.02;
    if (args.preset === "vertical") end[1] += p.comp.height * 0.02;
    if (args.preset === "subtle" || args.preset === "dolly") end[2] += p.rig.data.frame.zoom * 0.03;
    if (-p.rig.data.totalDepth - end[2] + (p.rig.data.schemaVersion === 3 ? p.rig.data.frame.zoom : 0) <= p.rig.data.frame.zoom * 0.1) reject("Parallax: profundidade muito proxima da camera.");
    p.position = position; p.start = start; p.end = end; p.t1 = t; p.t2 = t + args.durationSeconds;
    return p;
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightMove(args) {
    try { movementPlan(args); return null; } catch (e) { return {code: MotionContracts.ERROR.INVALID_SELECTION_TYPE, message: /** @type {Error} */ (e).message, recoverable: true, details: null}; }
  }
  /** @param {any} args @returns {MotionCommandResult} */
  function move(args) {
    var p = movementPlan(args);
    var previousComment = p.rig.master.comment;
    try {
      p.position.setValueAtTime(p.t1, p.start);
      p.position.setValueAtTime(p.t2, p.end);
      for (var i = 1; i <= 2; i += 1) {
        p.position.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        p.position.setSpatialAutoBezierAtKey(i, false);
        p.position.setSpatialTangentsAtKey(i, [0, 0, 0], [0, 0, 0]);
      }
      if (p.position.numKeys !== 2 || !equal(p.position.valueAtTime(p.t2, false), p.end)) reject("Parallax: o After Effects nao confirmou o movimento.");
      p.rig.data.motion = {preset: args.preset, start: p.start, end: p.end, t1: p.t1, t2: p.t2};
      p.rig.master.comment = MotionRigMeta.write(previousComment, MotionJson.stringify(p.rig.data));
      return {changed: true, warnings: [], data: {status: "motion-applied", motionApplied: true, durationSeconds: args.durationSeconds}};
    } catch (e) {
      while (p.position.numKeys > 0) p.position.removeKey(p.position.numKeys);
      p.position.setValue(p.start);
      p.rig.master.comment = previousComment;
      throw e;
    }
  }
  /** @param {any} args @returns {any} */
  function removalPlan(args) {
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key)) reject("Parallax: argumento invalido.");
    var p = managedRig();
    var cameraPosition = prop(p.motionLayer, POS);
    if (cameraPosition.numKeys && (!p.rig.data.motion || cameraPosition.numKeys !== 2 ||
        !equal(cameraPosition.keyValue(1), p.rig.data.motion.start) || !equal(cameraPosition.keyValue(2), p.rig.data.motion.end))) reject("Parallax: preserve a animacao manual do controle antes de remover.");
    if (!cameraPosition.numKeys) requireStatic(cameraPosition);
    if (!cameraPosition.numKeys && !equal(cameraPosition.value, [p.rig.data.frame.cx, p.rig.data.frame.cy, p.rig.data.schemaVersion === 3 ? 0 : -p.rig.data.frame.zoom])) reject("Parallax: restaure a posicao de referencia da camera antes de remover.");
    for (var i = 1; i <= p.comp.numLayers; i += 1) {
      var layer = p.comp.layer(i);
      if (layer !== p.camera && (layer.parent === p.camera || layer.parent === p.rig.master)) reject("Parallax: ha camadas dependentes do rig. Remova esses vinculos antes de remover.");
      if (layer !== p.camera && layer !== p.rig.master) {
        inspectDependencies(layer, p.rig.data.schemaVersion === 3 && byOriginal(p.originals, layer.id) ? expressions(p.rig.data.frame) : null);
      }
    }
    var cameraEffects = p.camera.property("ADBE Effect Parade");
    var masterEffects = p.rig.master.property("ADBE Effect Parade");
    if ((cameraEffects && cameraEffects.numProperties) || (masterEffects && masterEffects.numProperties)) reject("Parallax: os controles foram modificados. Preserve essas alteracoes antes de remover.");
    return p;
  }
  /** @param {any} group @param {any} [owned] */
  function inspectDependencies(group, owned) {
    for (var i = 1; i <= group.numProperties; i += 1) {
      var item = group.property(i);
      if (item.propertyType === PropertyType.PROPERTY) {
        if (item.expression && !(owned && ((item.matchName === POS && item.expression === owned.position) || (item.matchName === SCALE && item.expression === owned.scale)))) reject("Parallax: existem expressoes na composicao; verifique dependencias antes de remover.");
      } else inspectDependencies(item, owned);
    }
  }
  /** @param {any} args @returns {MotionCommandFailure|null} */
  function preflightRemove(args) {
    try { removalPlan(args); return null; } catch (e) { return {code: MotionContracts.ERROR.INVALID_SELECTION_TYPE, message: /** @type {Error} */ (e).message, recoverable: true, details: null}; }
  }
  /** @param {any} args @returns {MotionCommandResult} */
  function remove(args) {
    var p = removalPlan(args);
    var journal = [];
    var deleted = false;
    try {
      for (var i = 0; i < p.layers.length; i += 1) {
        journal.push(snapshot(p.layers[i])); restore(p.layers[i], p.originals[i]);
      }
      p.camera.remove(); deleted = true; p.rig.master.remove();
      return {changed: true, warnings: [], data: {status: "removed", layerCount: p.layers.length}};
    } catch (e) {
      var failed = deleted;
      for (var j = journal.length - 1; j >= 0; j -= 1) { try {restore(p.layers[j], journal[j]);} catch (restoreError) {failed = true;} }
      var error = /** @type {Error & {motionCode?: string}} */ (new Error("Parallax: nao foi possivel remover o rig. Use Desfazer."));
      error.motionCode = failed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw error;
    }
  }
  MotionRegistry.register("ae.parallax.create", {preflight: preflight, run: run});
  MotionRegistry.register("ae.parallax.adjust", {preflight: function (args) {
    var result = preflight(args);
    if (result) return result;
    if (!existing(app.project.activeItem)) return {code: MotionContracts.ERROR.INVALID_SELECTION_TYPE, message: "Parallax: crie o rig antes de ajustar.", recoverable: true, details: null};
    return null;
  }, run: run});
  MotionRegistry.register("ae.parallax.move", {preflight: preflightMove, run: move});
  MotionRegistry.register("ae.parallax.remove", {preflight: preflightRemove, run: remove});

  MotionRegistry.register("ae.animate.parallax.quick", {preflight: preflight, run: run});
})();
