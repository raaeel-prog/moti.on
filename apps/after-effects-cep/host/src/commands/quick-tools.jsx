/**
 * Quick actions migrated from the user's FX Studio (fx-quick-tools.jsx).
 * Source and migration changes: docs/research/fx-studio-quick-actions.md.
 * Action algorithms are retained; Moti.on owns validation, dispatch and Undo.
 */
/* global Folder, KeyframeInterpolationType */
(function () {
  var application = /** @type {any} */ (app);
  /** @param {any} layer @param {any} matchName @returns {any} */
  function transformProp(layer, matchName) {
    try {
      var transform = layer.property('ADBE Transform Group');
      return transform ? transform.property(matchName) : null;
    } catch (e) {
      return null;
    }
  }


  // Define um valor respeitando keyframes (setValue falha com keys: usa a
  // avaliacao no tempo atual da comp).
  /** @param {any} prop @param {any} value @param {any} time @returns {any} */
  function setPropValue(prop, value, time) {
    if (!prop) return false;
    try {
      if (prop.numKeys && prop.numKeys > 0) prop.setValueAtTime(time, value);
      else prop.setValue(value);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** @param {any} layer @param {any} x @param {any} y @param {any} result @returns {any} */
  function setPosition(layer, x, y, result) {
    var position = transformProp(layer, 'ADBE Position');
    if (!position) {
      result.warnings.push(layer.name + ': position nao esta disponivel.');
      result.skippedItems++;
      return false;
    }
    var comp = layer.containingComp;
    var time = comp ? comp.time : 0;
    try {
      // Dimensoes separadas: Position vira grupo; usar X/Y Position individuais.
      var separated = false;
      try { separated = position.dimensionsSeparated === true; } catch (eSep) { /* Preserve the FX Studio best-effort behavior. */ }
      if (separated) {
        var transform = layer.property('ADBE Transform Group');
        var px = transform.property('ADBE Position_0');
        var py = transform.property('ADBE Position_1');
        var okX = setPropValue(px, x, time);
        var okY = setPropValue(py, y, time);
        if (!okX || !okY) throw new Error('dimensoes separadas recusaram o valor');
        result.changedItems++;
        return true;
      }
      var current = position.value;
      var next = current instanceof Array && current.length > 2 ? [x, y, current[2]] : [x, y];
      if (!setPropValue(position, next, time)) throw new Error('position recusou o valor');
      result.changedItems++;
      return true;
    } catch (e) {
      result.warnings.push(layer.name + ': nao foi possivel alterar position. ' + String(e));
      result.skippedItems++;
      return false;
    }
  }

  // Retangulo de origem da layer (texto/shape/footage) em coordenadas da fonte.
  /** @param {any} layer @param {any} comp @returns {any} */
  function sourceRect(layer, comp) {
    try {
      if (layer.sourceRectAtTime) {
        // Em Shape Layers, inclui stroke/extents visiveis. Em texto, mantem os
        // bounds dos glifos (true mudaria paragraph text para a caixa inteira).
        var includeExtents = false;
        try { includeExtents = !!layer.property('ADBE Root Vectors Group'); } catch (eVector) { /* Preserve the FX Studio best-effort behavior. */ }
        var rect = layer.sourceRectAtTime(comp.time, includeExtents);
        if (rect && isFinite(rect.left) && isFinite(rect.top) && isFinite(rect.width) && isFinite(rect.height) && rect.width > 0 && rect.height > 0) {
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }
      }
    } catch (eRect) { /* Preserve the FX Studio best-effort behavior. */ }
    try {
      if (layer.source && isFinite(layer.source.width) && isFinite(layer.source.height) && layer.source.width > 0 && layer.source.height > 0) {
        return { left: 0, top: 0, width: layer.source.width, height: layer.source.height };
      }
    } catch (eSource) { /* Preserve the FX Studio best-effort behavior. */ }
    return null;
  }

  // Bounding box da layer RELATIVO a sua position (offsets min/max), levando em
  // conta anchor point, escala (inclusive negativa/espelhada) e rotacao Z.
  // comp_ponto = position + R(rot) * S(scale) * (ponto_fonte - anchor)
  /** @param {any} layer @param {any} comp @returns {any} */
  function layerOffsets(layer, comp) {
    var rect = sourceRect(layer, comp);
    if (!rect) return null;
    var ax = 0;
    var ay = 0;
    try {
      var anchor = transformProp(layer, 'ADBE Anchor Point');
      if (anchor && anchor.value instanceof Array) {
        ax = Number(anchor.value[0]) || 0;
        ay = Number(anchor.value[1]) || 0;
      }
    } catch (eAnchor) { /* Preserve the FX Studio best-effort behavior. */ }
    var sx = 1;
    var sy = 1;
    try {
      var scale = transformProp(layer, 'ADBE Scale');
      if (scale && scale.value instanceof Array) {
        sx = Number(scale.value[0]) / 100;
        sy = Number(scale.value[1]) / 100;
      }
    } catch (eScale) { /* Preserve the FX Studio best-effort behavior. */ }
    var rot = 0;
    try {
      var rotation = transformProp(layer, 'ADBE Rotate Z') || transformProp(layer, 'ADBE Rotation');
      if (rotation) rot = (Number(rotation.value) || 0) * Math.PI / 180;
    } catch (eRot) { /* Preserve the FX Studio best-effort behavior. */ }
    var cosR = Math.cos(rot);
    var sinR = Math.sin(rot);
    var corners = /** @type {any} */ ([
      [rect.left, rect.top],
      [rect.left + rect.width, rect.top],
      [rect.left, rect.top + rect.height],
      [rect.left + rect.width, rect.top + rect.height]
    ]);
    var par = 1;
    try {
      if (layer.source && isFinite(layer.source.pixelAspect) && layer.source.pixelAspect > 0) par = layer.source.pixelAspect;
    } catch (ePar) { /* Preserve the FX Studio best-effort behavior. */ }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < corners.length; i++) {
      var dx = (corners[i][0] - ax) * sx * par;
      var dy = (corners[i][1] - ay) * sy;
      var rx = dx * cosR - dy * sinR;
      var ry = dx * sinR + dy * cosR;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  /** @param {any} layer @param {any} comp @param {any} action @param {any} result @returns {any} */
  function alignLayer(layer, comp, action, result) {
    if (layer.locked) {
      result.warnings.push(layer.name + ': layer travada foi ignorada.');
      result.skippedItems++;
      return;
    }
    var xMode = action.indexOf('left') >= 0 ? 'left' : action.indexOf('right') >= 0 ? 'right' : 'center';
    var yMode = action.indexOf('top') >= 0 ? 'top' : action.indexOf('bottom') >= 0 ? 'bottom' : 'middle';
    var off = layerOffsets(layer, comp);
    var x;
    var y;
    if (off) {
      if (xMode === 'left') x = 0 - off.minX;
      else if (xMode === 'right') x = comp.width - off.maxX;
      else x = comp.width / 2 - (off.minX + off.maxX) / 2;

      if (yMode === 'top') y = 0 - off.minY;
      else if (yMode === 'bottom') y = comp.height - off.maxY;
      else y = comp.height / 2 - (off.minY + off.maxY) / 2;
    } else {
      // camera/luz/sem dimensoes: alinha o proprio ponto de posicao
      x = xMode === 'left' ? 0 : xMode === 'right' ? comp.width : comp.width / 2;
      y = yMode === 'top' ? 0 : yMode === 'bottom' ? comp.height : comp.height / 2;
    }

    // Layer com parent: a Position vive no espaco do parent. Desparenta,
    // posiciona em coordenadas da comp e reparenta (o AE compensa e preserva
    // a posicao no mundo).
    var parent = null;
    try {
      if (layer.parent) {
        parent = layer.parent;
        layer.parent = null;
      }
    } catch (eUnparent) {
      parent = null;
    }
    setPosition(layer, x, y, result);
    if (parent) {
      try { layer.parent = parent; } catch (eReparent) {
        result.warnings.push(layer.name + ': o parent nao pode ser restaurado.');
      }
    }
  }

  /** @param {any} comp @param {any} layers @param {any} result @returns {any} */
  function centerLayers(comp, layers, result) {
    for (var i = 0; i < layers.length; i++) {
      alignLayer(layers[i], comp, 'align-center', result);
    }
    result.message = result.changedItems + ' layer(s) centralizada(s).';
  }

  /** @param {any} comp @param {any} layers @param {any} result @returns {any} */
  function precomposeLayers(comp, layers, result) {
    var indices = [];
    var seen = /** @type {Record<string, boolean>} */ ({});
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].locked) {
        result.warnings.push(layers[i].name + ': layer travada foi ignorada.');
        result.skippedItems++;
      } else if (!seen[layers[i].index]) {
        seen[layers[i].index] = true;
        indices.push(layers[i].index);
      }
    }
    if (!indices.length) throw new Error('Selecione ao menos uma layer destravada para precompor.');
    indices.sort(function (/** @type {number} */ a, /** @type {number} */ b) { return a - b; });
    var name = 'Moti.on Precomp ' + new Date().getTime();
    var precomp = comp.layers.precompose(indices, name, true);
    result.createdItems++;
    result.changedItems++;
    result.message = 'Pre-comp criada: ' + String(precomp && precomp.name ? precomp.name : name) + '.';
  }

  /** @param {any} comp @param {any} result @returns {any} */
  function saveFrame(comp, result) {
    var folder = null;
    try {
      if (application.project && application.project.file && application.project.file.parent) folder = application.project.file.parent;
    } catch (eProject) { /* Preserve the FX Studio best-effort behavior. */ }
    if (!folder) {
      try { folder = (/** @type {any} */ (Folder)).desktop; } catch (eDesk) { /* Preserve the FX Studio best-effort behavior. */ }
    }
    if (!folder) throw new Error('Nao foi possivel localizar uma pasta para salvar o frame.');
    var safeName = String(comp.name).replace(/[\\:*?"<>|]/g, '_').replace(/\//g, '_');
    var file = /** @type {any} */ (new File(folder.fsName + '/Moti.on_Frame_' + safeName + '_' + Math.round(comp.time * comp.frameRate) + '.png'));
    var suffix = 1;
    var basePath = file.fsName.replace(/\.png$/i, '');
    while (file.exists && suffix < 10000) file = new File(basePath + '_' + suffix++ + '.png');
    if (file.exists) throw new Error('Muitas imagens com este nome. Renomeie a composicao antes de exportar.');
    if (!comp.saveFrameToPng) {
      throw new Error('Esta versao do After Effects nao disponibiliza a exportacao PNG.');
    }
    comp.saveFrameToPng(comp.time, file);
    // The native exporter may finish writing shortly after it returns.
    for (var attempt = 0; attempt < 40; attempt++) {
      file = new File(file.fsName);
      if (file.exists && file.length > 0) break;
      (/** @type {any} */ ($)).sleep(50);
    }
    if (!file.exists) throw new Error('O After Effects nao confirmou o arquivo PNG.');
    result.changedItems++;
    result.outputPath = String(file.fsName);
    result.message = 'Frame salvo em PNG.';
  }

  /** @param {any} comp @param {any} layers @param {any} result @returns {any} */
  function fitLayers(comp, layers, result) {
    for (var i = 0; i < layers.length; i++) {
      var layer = /** @type {any} */ (layers[i]);
      if (layer.locked) {
        result.warnings.push(layer.name + ': layer travada foi ignorada.');
        result.skippedItems++;
        continue;
      }
      var scale = transformProp(layer, 'ADBE Scale');
      if (!scale || !(scale.value instanceof Array)) {
        result.warnings.push(layer.name + ': scale nao esta disponivel.');
        result.skippedItems++;
        continue;
      }
      var rect = sourceRect(layer, comp);
      var visualW = rect ? Math.abs(rect.width * scale.value[0] / 100) : 0;
      var visualH = rect ? Math.abs(rect.height * scale.value[1] / 100) : 0;
      if (visualW <= 0 || visualH <= 0) {
        result.warnings.push(layer.name + ': nao foi possivel calcular tamanho.');
        result.skippedItems++;
        continue;
      }
      var factor = Math.min(comp.width / visualW, comp.height / visualH);
      var next = [];
      for (var s = 0; s < scale.value.length; s++) next.push(scale.value[s] * factor);
      try {
        if (!setPropValue(scale, next, comp.time)) throw new Error('scale recusou o valor');
        alignLayer(layer, comp, 'align-center', { changedItems: 0, skippedItems: 0, warnings: [] });
        result.changedItems++;
      } catch (eFit) {
        result.warnings.push(layer.name + ': fit falhou. ' + String(eFit));
        result.skippedItems++;
      }
    }
    result.message = result.changedItems + ' layer(s) ajustada(s) ao tamanho da composicao.';
  }

  /** @param {any} layers @param {any} result @returns {any} */
  function mirrorLayers(layers, result) {
    for (var i = 0; i < layers.length; i++) {
      var layer = /** @type {any} */ (layers[i]);
      if (layer.locked) {
        result.warnings.push(layer.name + ': layer travada foi ignorada.');
        result.skippedItems++;
        continue;
      }
      var scale = transformProp(layer, 'ADBE Scale');
      if (!scale || !(scale.value instanceof Array)) {
        result.warnings.push(layer.name + ': scale nao esta disponivel.');
        result.skippedItems++;
        continue;
      }
      try {
        var next = scale.value.slice(0);
        next[0] = next[0] * -1;
        var mirrorComp = layer.containingComp;
        if (!setPropValue(scale, next, mirrorComp ? mirrorComp.time : 0)) throw new Error('scale recusou o valor');
        result.changedItems++;
      } catch (eMirror) {
        result.warnings.push(layer.name + ': mirror falhou. ' + String(eMirror));
        result.skippedItems++;
      }
    }
    result.message = result.changedItems + ' layer(s) espelhada(s).';
  }

  /** @param {any} comp @param {any} layers @param {any} result @returns {any} */
  function freezeLayers(comp, layers, result) {
    var frame = Math.max(0.001, comp.frameDuration), touched = [];
    try {
      for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        // Preflight only accepts layers with no existing remapping.
        touched.push({layer: layer, inPoint: layer.inPoint, outPoint: layer.outPoint});
        layer.timeRemapEnabled = true;
        var remap = layer.property('ADBE Time Remapping');
        if (!remap) throw new Error('Time Remap nao ficou disponivel.');
        var t = Math.min(Math.max(comp.time, layer.inPoint), Math.max(layer.inPoint, layer.outPoint - frame));
        var frozen = remap.valueAtTime(t, false);
        // Keep one key: deleting every key disables Time Remap in AE.
        // A single Hold key freezes both before and after the chosen frame.
        remap.setValueAtTime(t, frozen);
        var keep = remap.nearestKeyIndex(t);
        for (var k = remap.numKeys; k > 0; k--) if (k !== keep) remap.removeKey(k);
        remap.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
      }
    } catch (error) {
      var rollbackFailed = false;
      for (var j = touched.length - 1; j >= 0; j--) {
        try {
          var previous = touched[j];
          if (!previous) continue;
          previous.layer.timeRemapEnabled = false;
          previous.layer.inPoint = previous.inPoint;
          previous.layer.outPoint = previous.outPoint;
        } catch (restoreError) { rollbackFailed = true; }
      }
      var failed = /** @type {Error & {motionCode?: string}} */ (new Error('Freeze falhou: ' + String(error)));
      failed.motionCode = rollbackFailed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw failed;
    }
    result.changedItems += touched.length;
    result.message = result.changedItems + ' layer(s) congelada(s) no frame atual.';
  }

  /** @param {any} comp @returns {any} */
  function createShape(comp) {
    var layer = comp.layers.addShape();
    layer.name = 'Moti.on Shape';
    var root = layer.property('ADBE Root Vectors Group');
    var group = root.addProperty('ADBE Vector Group');
    group.name = 'Moti.on Rectangle';
    var vectors = group.property('ADBE Vectors Group');
    var rect = vectors.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue([320, 180]);
    var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
    fill.property('ADBE Vector Fill Color').setValue([1, 1, 1]);
    setPosition(layer, comp.width / 2, comp.height / 2, { changedItems: 0, skippedItems: 0, warnings: [] });
    return layer;
  }

  /** @param {any} comp @param {any} action @param {any} result @returns {any} */
  function createLayer(comp, action, result) {
    var layer = null;
    if (action === 'create-adjustment') {
      layer = comp.layers.addSolid([0, 0, 0], 'Moti.on Adjustment', comp.width, comp.height, comp.pixelAspect, comp.duration);
      layer.adjustmentLayer = true;
      try { layer.moveToBeginning(); } catch (eMove) { /* Preserve the FX Studio best-effort behavior. */ }
    } else if (action === 'create-solid') {
      layer = comp.layers.addSolid([0.08, 0.08, 0.08], 'Moti.on Solid', comp.width, comp.height, comp.pixelAspect, comp.duration);
    } else if (action === 'create-shape') {
      layer = createShape(comp);
    } else if (action === 'create-null') {
      layer = comp.layers.addNull();
      layer.name = 'Moti.on Null';
    } else if (action === 'create-camera') {
      layer = comp.layers.addCamera('Moti.on Camera', [comp.width / 2, comp.height / 2]);
    }
    if (!layer) throw new Error('Acao de criacao invalida.');
    result.createdItems++;
    result.changedItems++;
    result.message = 'Layer criada: ' + layer.name + '.';
  }

  /** @param {any} action @returns {any} */
  function effectCandidates(action) {
    if (action === 'effect-hue') return ['ADBE HUE SATURATION'];
    if (action === 'effect-fill') return ['ADBE Fill'];
    if (action === 'effect-tint') return ['ADBE Tint'];
    if (action === 'effect-blur') return ['ADBE Gaussian Blur 2'];
    if (action === 'effect-curves') return ['ADBE CurvesCustom'];
    if (action === 'effect-lumetri') return ['ADBE Lumetri'];
    return [];
  }

  /** @param {any} action @returns {any} */
  function effectLabel(action) {
    if (action === 'effect-hue') return 'Moti.on Hue/Saturation';
    if (action === 'effect-fill') return 'Moti.on Fill';
    if (action === 'effect-tint') return 'Moti.on Tint';
    if (action === 'effect-blur') return 'Moti.on Blur';
    if (action === 'effect-curves') return 'Moti.on Curves';
    if (action === 'effect-lumetri') return 'Moti.on Lumetri';
    return 'Moti.on Effect';
  }

  /** @param {any} effect @param {string} name @param {any} value @returns {void} */
  function setEffectDefault(effect, name, value) {
    var prop = effect.property(name);
    if (!prop || typeof prop.setValue !== 'function') throw new Error('Parametro de efeito indisponivel: ' + name);
    prop.setValue(value);
  }

  /** @param {any} effect @param {any} action @returns {void} */
  function configureEffectDefaults(effect, action) {
    // Resolve the actual parameter instead of guessing the first numeric/color
    // child (Hue begins with a popup, whose valid range does not include zero).
    if (action === 'effect-fill') setEffectDefault(effect, 'ADBE Fill-0002', [1, 1, 1, 1]);
    else if (action === 'effect-tint') setEffectDefault(effect, 'ADBE Tint-0003', 100);
    else if (action === 'effect-blur') {
      setEffectDefault(effect, 'ADBE Gaussian Blur 2-0001', 24);
      setEffectDefault(effect, 'ADBE Gaussian Blur 2-0003', 1);
    }
  }

  /** @param {any} layers @param {any} action @param {any} result @returns {void} */
  function addEffectToLayers(layers, action, result) {
    var matchName = effectCandidates(action)[0];
    var created = [];
    try {
      for (var i = 0; i < layers.length; i++) {
        var parade = layers[i].property('ADBE Effect Parade');
        var existing = null;
        for (var e = 1; e <= parade.numProperties; e++) {
          var candidate = parade.property(e);
          if (candidate.name === effectLabel(action) && candidate.matchName === matchName) existing = candidate;
        }
        if (existing) { result.unchangedItems++; continue; }
        parade.addProperty(matchName);
        var effect = parade.property(parade.numProperties);
        if (!effect || effect.matchName !== matchName) throw new Error('O After Effects nao devolveu o efeito criado.');
        created.push(effect);
        effect.name = effectLabel(action);
        configureEffectDefaults(effect, action);
        result.changedItems++;
      }
    } catch (error) {
      var rollbackFailed = false;
      for (var c = created.length - 1; c >= 0; c--) {
        try { created[c].remove(); } catch (removeError) { rollbackFailed = true; }
      }
      var tagged = /** @type {Error & {motionCode?: string}} */ (new Error('Nao foi possivel aplicar o efeito em todas as camadas.'));
      tagged.motionCode = rollbackFailed ? MotionContracts.ERROR.ROLLBACK_FAILED : MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw tagged;
    }
    result.message = result.changedItems + ' efeito(s) aplicado(s).';
  }

  /** @param {any} group @param {any} matchName @returns {any} */
  function firstPropertyByMatch(group, matchName) {
    if (!group) return null;
    try {
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p && p.matchName === matchName) return p;
      }
    } catch (e) { /* Preserve the FX Studio best-effort behavior. */ }
    return null;
  }

  /** @param {any} dashes @param {any} matchName @param {any} value @returns {any} */
  function ensureDashProperty(dashes, matchName, value) {
    if (!dashes) return false;
    var prop = firstPropertyByMatch(dashes, matchName);
    if (prop) {
      if (prop.expressionEnabled || prop.numKeys > 0) return false;
      try {
        prop.setValue(value);
        return true;
      } catch (eHidden) {
        // AE enumerates inactive dash slots too; addProperty activates the slot.
      }
    }
    if (!dashes.canAddProperty(matchName)) return false;
    prop = dashes.addProperty(matchName);
    prop.setValue(value);
    return true;
  }

  /** @param {any} vectors @returns {any} */
  function applyDashToVectors(vectors) {
    if (!vectors) return 0;
    var changed = 0;
    var stroke = firstPropertyByMatch(vectors, 'ADBE Vector Graphic - Stroke');
    var createdStroke = !stroke;
    if (!stroke) {
      try { stroke = vectors.addProperty('ADBE Vector Graphic - Stroke'); } catch (eStroke) { stroke = null; }
    }
    if (stroke) {
      try {
        var color = stroke.property('ADBE Vector Stroke Color');
        if (color && createdStroke) color.setValue([1, 1, 1]);
      } catch (eColor) { /* Preserve the FX Studio best-effort behavior. */ }
      try {
        var width = stroke.property('ADBE Vector Stroke Width');
        if (width && createdStroke) width.setValue(4);
      } catch (eWidth) { /* Preserve the FX Studio best-effort behavior. */ }
      var dashes = stroke.property('ADBE Vector Stroke Dashes');
      var dashOk = ensureDashProperty(dashes, 'ADBE Vector Stroke Dash 1', 18);
      var gapOk = ensureDashProperty(dashes, 'ADBE Vector Stroke Gap 1', 12);
      if (dashOk || gapOk) changed++;
    }

    for (var i = 1; i <= vectors.numProperties; i++) {
      var child = vectors.property(i);
      if (child && child.matchName === 'ADBE Vector Group') {
        changed += applyDashToVectors(child.property('ADBE Vectors Group'));
      }
    }
    return changed;
  }

  /** @param {any} layers @param {any} result @returns {any} */
  function dashStrokeLayers(layers, result) {
    for (var i = 0; i < layers.length; i++) {
      var layer = /** @type {any} */ (layers[i]);
      if (layer.locked) {
        result.warnings.push(layer.name + ': layer travada foi ignorada.');
        result.skippedItems++;
        continue;
      }
      try {
        var root = layer.property('ADBE Root Vectors Group');
        if (!root) {
          result.warnings.push(layer.name + ': DSH funciona apenas em shape layers.');
          result.skippedItems++;
          continue;
        }
        var changed = applyDashToVectors(root);
        if (changed > 0) result.changedItems++;
        else {
          result.warnings.push(layer.name + ': nenhum stroke vetorial foi encontrado ou criado.');
          result.skippedItems++;
        }
      } catch (eDash) {
        result.warnings.push(layer.name + ': dash stroke falhou. ' + String(eDash));
        result.skippedItems++;
      }
    }
    result.message = result.changedItems + ' shape layer(s) com stroke tracejado.';
  }

  /** @param {any} action @returns {any} */
  function needsSelection(action) {
    if (action === 'save-frame') return false;
    if (action.indexOf('create-') === 0) return false;
    return true;
  }

  /** @param {any} action @returns {any} */
  function isKnownAction(action) {
    return (/** @type {Record<string, boolean>} */ ({
      'precompose': true,
      'center': true,
      'save-frame': true,
      'freeze': true,
      'fit': true,
      'mirror': true,
      'dash-stroke': true,
      'create-adjustment': true,
      'create-solid': true,
      'create-shape': true,
      'create-null': true,
      'create-camera': true,
      'effect-hue': true,
      'effect-fill': true,
      'effect-tint': true,
      'effect-blur': true,
      'effect-curves': true,
      'effect-lumetri': true
    }))[action] === true;
  }

  /** @param {any} comp @param {any} layers @param {any} action @param {any} result @returns {any} */
  function runAction(comp, layers, action, result) {
    if (action === 'precompose') precomposeLayers(comp, layers, result);
    else if (action === 'center') centerLayers(comp, layers, result);
    else if (action === 'save-frame') saveFrame(comp, result);
    else if (action === 'freeze') freezeLayers(comp, layers, result);
    else if (action === 'fit') fitLayers(comp, layers, result);
    else if (action === 'mirror') mirrorLayers(layers, result);
    else if (action === 'dash-stroke') dashStrokeLayers(layers, result);
    else if (action.indexOf('create-') === 0) createLayer(comp, action, result);
    else if (action.indexOf('effect-') === 0) addEffectToLayers(layers, action, result);
  }


  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }

  /** @param {Record<string, unknown>} args @param {boolean} saving @returns {MotionCommandFailure|null} */
  function validate(args, saving) {
    for (var key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && key !== 'action') {
        return failure(MotionContracts.ERROR.INVALID_PRESET, 'Argumento Quick desconhecido.');
      }
    }
    var action = args.action;
    if (typeof action !== 'string' || !isKnownAction(action) || (action === 'save-frame') !== saving) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, 'Acao Quick invalida.');
    }
    var comp = application.project && application.project.activeItem;
    if (!(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, 'Abra uma composicao no After Effects.');
    if (saving) {
      if (typeof (/** @type {any} */ (comp)).saveFrameToPng !== 'function') return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, 'Esta versao do After Effects nao disponibiliza a exportacao PNG do FX Studio.');
      return null;
    }
    var layers = comp.selectedLayers;
    if (needsSelection(action) && !layers.length) return failure(MotionContracts.ERROR.NO_SELECTION, 'Selecione uma ou mais camadas.');
    if (!needsSelection(action)) return null;
    for (var i = 0; i < layers.length; i++) {
      var layer = /** @type {any} */ (layers[i]);
      if (layer.locked) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, 'Desbloqueie as camadas selecionadas.');
      if (action === 'freeze' && (!layer.canSetTimeRemapEnabled || layer.timeRemapEnabled)) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, 'Congelar requer video ou precomp sem remapeamento de tempo existente.');
      }
      if (action === 'dash-stroke' && !layer.property('ADBE Root Vectors Group')) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, 'Selecione apenas camadas de forma para aplicar tracejado.');
      }
      if (action.indexOf('effect-') === 0) {
        var effects = layer.property('ADBE Effect Parade');
        if (!effects || !effects.canAddProperty(effectCandidates(action)[0])) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, 'O efeito solicitado nao esta disponivel nesta camada.');
      }
      if (action === 'center' || action === 'fit' || action === 'mirror') {
        if ((action === 'center' || action === 'fit') && (layer.parent || layer.threeDLayer)) {
          return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, 'Centralizar e ajustar requerem camadas 2D sem parent.');
        }
        var prop = transformProp(layer, action === 'center' ? 'ADBE Position' : 'ADBE Scale');
        if (!prop || prop.expressionEnabled) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, 'A transformacao possui expressao ou nao esta disponivel.');
        if (action === 'center' || action === 'fit') {
          var position = transformProp(layer, 'ADBE Position');
          if (!position || position.expressionEnabled) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, 'A posicao possui expressao ou nao esta disponivel.');
          if (position.dimensionsSeparated) {
            for (var d = 0; d < 2; d++) {
              if (position.getSeparationFollower(d).expressionEnabled) return failure(MotionContracts.ERROR.EXPRESSION_CONFLICT, 'Uma dimensao da posicao possui expressao.');
            }
          }
        }
        if (action === 'fit' && !sourceRect(layer, comp)) return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, 'A camada nao possui limites visiveis para ajustar.');
      }
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) { return validate(args, false); }
  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function savePreflight(args) { return validate(args, true); }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var comp = application.project.activeItem;
    var action = /** @type {string} */ (args.action);
    var result = /** @type {{action: string, changedItems: number, unchangedItems: number, skippedItems: number, createdItems: number, warnings: string[], message: string}} */ ({ action: action, changedItems: 0, unchangedItems: 0, skippedItems: 0, createdItems: 0, warnings: [], message: '' });
    runAction(comp, comp.selectedLayers, action, result);
    var warnings = [];
    for (var i = 0; i < result.warnings.length; i++) warnings.push({ code: 'QUICK_ACTION_WARNING', message: String(result.warnings[i]), details: null });
    if (!result.changedItems && !result.unchangedItems) {
      var error = /** @type {Error & {motionCode?: string}} */ (new Error(result.warnings.join(' ') || 'Nenhuma alteracao foi aplicada.'));
      error.motionCode = MotionContracts.ERROR.HOST_OPERATION_FAILED;
      throw error;
    }
    return { changed: result.changedItems > 0, warnings: warnings, data: result };
  }

  MotionRegistry.register("ae.quick-tools.apply", { preflight: preflight, run: run });
  MotionRegistry.register("ae.quick-tools.save-frame", { preflight: savePreflight, run: run });
})();
