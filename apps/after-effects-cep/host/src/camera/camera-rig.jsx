/**
 * Rig of the camera engine (ADR 0007): one pose authority for camera shots.
 *
 * The controller layer owns every live control, one timing marker per shot and
 * the metadata. In Parallax mode the controller is the Parallax v3 master null
 * (the camera stays its child at [0, 0, -dist]); in standalone mode the engine
 * creates the same pair over an existing 3D scene, matching After Effects'
 * default camera so the first frame does not change.
 *
 * Every expression starts with its own header and carries the whole kernel
 * (`MotionCameraCore.source`), so it renders without the panel. Shot timing
 * comes from markers owned by parameters, never by their comment text; a marker
 * the user deletes falls back to the stored start and duration.
 */
(function (global) {
  /* global CameraLayer, MarkerValue */
  var core = /** @type {any} */ (global).MotionCameraCore;
  var catalog = /** @type {any} */ (global).MotionCameraCatalog;
  var TAG = "[Moti.on.camera.v1]";
  var SIGNATURE = "// Moti.on camera v1:";
  var HEADER = MotionContracts.EXPRESSION_HEADER + "ae.camera.kernel\n";
  /** A full-sequence choreography alone writes seven shots. */
  // A choreography writes its visits plus up to 10 focus racks and the breath.
  var MAX_SHOTS = 32;
  var MN = {
    transform: "ADBE Transform Group", options: "ADBE Camera Options Group", effects: "ADBE Effect Parade",
    position: "ADBE Position", orientation: "ADBE Orientation", rotationZ: "ADBE Rotate Z", rotationX: "ADBE Rotate X",
    rotationY: "ADBE Rotate Y", anchor: "ADBE Anchor Point", zoom: "ADBE Camera Zoom",
    focus: "ADBE Camera Focus Distance", dof: "ADBE Camera Depth of Field", aperture: "ADBE Camera Aperture",
    blur: "ADBE Camera Blur Level", slider: "ADBE Slider Control", checkbox: "ADBE Checkbox Control",
    layerControl: "ADBE Layer Control", marker: "ADBE Marker"
  };
  /** Properties the engine writes, in a fixed order, with who owns them. @type {any[]} */
  var TARGETS = [
    { key: "position", owner: "controller", path: [MN.transform, MN.position] },
    { key: "orientation", owner: "controller", path: [MN.transform, MN.orientation] },
    { key: "rotation", owner: "controller", path: [MN.transform, MN.rotationZ] },
    { key: "zoom", owner: "camera", path: [MN.options, MN.zoom] },
    { key: "focus", owner: "camera", path: [MN.options, MN.focus] },
    { key: "dof", owner: "camera", path: [MN.options, MN.dof] },
    { key: "aperture", owner: "camera", path: [MN.options, MN.aperture] },
    { key: "blur", owner: "camera", path: [MN.options, MN.blur] }
  ];
  /** Rig controls: key, control type, pt-BR and en-US labels. @type {any[]} */
  var CONTROLS = [
    ["intensity", "slider", "Intensidade (%)", "Intensity (%)"],
    ["lens", "slider", "Lente (%)", "Lens (%)"],
    ["cover", "checkbox", "Cobrir fundo", "Cover background"],
    ["focusTarget", "layer", "Alvo do foco", "Focus target"],
    ["focusOffset", "slider", "Ajuste do foco (px)", "Focus offset (px)"],
    ["focusSmooth", "slider", "Suavizar foco (s)", "Focus smoothing (s)"],
    ["dof", "checkbox", "Profundidade de campo", "Depth of field"],
    ["aperture", "slider", "Abertura (px)", "Aperture (px)"],
    ["blur", "slider", "Desfoque (%)", "Blur level (%)"]
  ];

  /** @param {string} message @returns {never} */
  function reject(message) { throw new Error(message); }
  /** @param {any} value @returns {any} */
  function copy(value) { return MotionJson.parse(MotionJson.stringify(value)); }
  /** @param {string} locale @returns {boolean} */
  function english(locale) { return typeof locale === "string" && locale.indexOf("en") === 0; }
  /** @param {any} group @param {string} name @returns {any} */
  function child(group, name) {
    if (!group) return null;
    for (var i = 1; i <= group.numProperties; i++) { var p = group.property(i); if (p.name === name || p.matchName === name) return p; }
    return null;
  }
  /** Transform and camera paths are matchNames, which `property()` resolves directly.
   * @param {any} layer @param {string[]} path @returns {any} */
  function locate(layer, path) { var p = layer; for (var i = 0; p && i < path.length; i++) p = p.property(path[i]); return p || null; }
  /** @param {any} comp @param {number} id @returns {any} */
  function byId(comp, id) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i);
    return null;
  }
  /** @param {string} id @returns {any} */
  function recipe(id) {
    if (!catalog) return null;
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }

  /* ------------------------------------------------------------- metadata */

  /** @param {any} layer @returns {any} */
  function readMeta(layer) {
    var comment = String(layer && layer.comment || ""), at = comment.indexOf(TAG);
    if (at < 0) return null;
    var line = comment.substring(at + TAG.length).split("\n")[0] || "";
    var m = /** @type {any} */ (null);
    try { m = MotionJson.parse(decodeURIComponent(line)); } catch (e) { reject("Câmera: metadados ilegíveis no controle."); }
    if (!m || m.version !== 1 || typeof m.rigId !== "string" || (m.mode !== "parallax" && m.mode !== "standalone") ||
        typeof m.controllerId !== "number" || typeof m.cameraId !== "number" || !(m.shots instanceof Array) ||
        !(m.originals instanceof Array) || !m.frame || !m.controls) reject("Câmera: metadados do rig inválidos.");
    return m;
  }
  /** @param {any} layer @param {any} meta */
  function writeMeta(layer, meta) {
    var comment = String(layer.comment || ""), start = comment.indexOf(TAG);
    if (start >= 0) {
      var end = comment.indexOf("\n", start);
      comment = comment.substring(0, start > 0 && comment.charAt(start - 1) === "\n" ? start - 1 : start) + (end < 0 ? "" : comment.substring(end));
    }
    layer.comment = comment + (meta ? (comment ? "\n" : "") + TAG + encodeURIComponent(MotionJson.stringify(meta)) : "");
  }
  /** The camera-engine controller of this comp, or null. More than one is refused.
   * @param {any} comp @returns {any} */
  function findEngine(comp) {
    var found = null;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (String(layer.comment || "").indexOf(TAG) < 0) continue;
      if (found) reject("Câmera: há mais de um rig de câmera nesta composição.");
      found = /** @type {any} */ ({ controller: layer, meta: readMeta(layer) });
    }
    if (!found) return null;
    var camera = byId(comp, found.meta.cameraId);
    if (found.meta.compId !== comp.id || found.controller.id !== found.meta.controllerId || !camera || !(camera instanceof CameraLayer)) {
      reject("Câmera: o rig foi copiado de outra composição ou perdeu a câmera. Remova os shots e aplique de novo.");
    }
    if (camera.parent !== found.controller) reject("Câmera: a câmera do rig não está mais presa ao controle.");
    found.camera = camera;
    return found;
  }
  /** Parallax v3 rig data from the master comment, or null.
   * @param {any} comp @returns {any} */
  function findParallax(comp) {
    var master = MotionRigMeta.findController(comp, "parallax.quick");
    if (!master) return null;
    var text = String(master.comment || ""), a = text.indexOf(MotionContracts.META_OPEN), b = text.indexOf(MotionContracts.META_CLOSE);
    /** @type {any} */
    var data;
    try { data = MotionJson.parse(text.substring(a + MotionContracts.META_OPEN.length, b)); } catch (e) { data = null; }
    if (!data || data.schemaVersion !== 3 || data.compId !== comp.id || data.state !== "committed" || !data.frame) {
      reject("Câmera: o rig de Parallax é antigo ou incompleto. Recrie o Parallax antes de aplicar câmera.");
    }
    var camera = byId(comp, data.cameraId);
    if (!camera || !(camera instanceof CameraLayer) || camera.parent !== master) reject("Câmera: a câmera do Parallax foi alterada ou removida.");
    return { master: master, camera: camera, data: data };
  }

  /* --------------------------------------------------------- reference */

  /** Distance from the reference camera to the nearest Parallax plane, and the
   * background overscan beyond the comp, both read from the stored originals.
   * @param {any} comp @param {any} parallax @returns {any} */
  function parallaxFrame(comp, parallax) {
    var data = parallax.data, f = data.frame, near = 0, far = -Infinity, margin = [0, 0, 0, 0], i, background = null;
    for (i = 0; i < (data.originals || []).length; i++) {
      var member = byId(comp, data.originals[i].id);
      if (!member) continue;
      var z = member.property(MN.transform).property(MN.position).valueAtTime(comp.time, true)[2];
      var distance = z + f.zoom;
      if (distance > 0 && (near === 0 || distance < near)) near = distance;
      if (z > far) { far = z; background = { layer: member, original: data.originals[i] }; }
    }
    if (background && typeof background.layer.sourceRectAtTime === "function" && !background.original.rotation) {
      var rect = background.layer.sourceRectAtTime(comp.time, false), o = background.original;
      var sx = o.scale[0] / 100, sy = o.scale[1] / 100;
      var left = o.position[0] + (rect.left - o.anchor[0]) * sx, top = o.position[1] + (rect.top - o.anchor[1]) * sy;
      var right = left + rect.width * sx, bottom = top + rect.height * sy;
      if (sx > 0 && sy > 0) margin = [Math.max(0, -left), Math.max(0, right - comp.width), Math.max(0, -top), Math.max(0, bottom - comp.height)];
    }
    return { cx: f.cx, cy: f.cy, pz: 0, dist: f.zoom, zoom: f.zoom, width: comp.width, height: comp.height,
      near: near, growth: 2, cover: 1, margin: margin, bz: background ? far : 0, duration: comp.duration };
  }
  /** After Effects' default comp camera (50 mm over a 36 mm film width), so a
   * standalone rig starts exactly where the scene was being viewed.
   * @param {any} comp @returns {any} */
  function standaloneFrame(comp) {
    var zoom = comp.width * 50 / 36;
    return { cx: comp.width / 2, cy: comp.height / 2, pz: 0, dist: zoom, zoom: zoom, width: comp.width,
      height: comp.height, near: 0, growth: 2, cover: 0, margin: [0, 0, 0, 0], duration: comp.duration };
  }
  /** Standalone needs a 3D scene of its own and no other camera to fight with.
   * @param {any} comp @returns {string} */
  function standaloneProblem(comp) {
    var threeD = 0;
    for (var i = 1; i <= comp.numLayers; i++) {
      var layer = comp.layer(i);
      if (layer instanceof CameraLayer) return "Câmera: esta composição já tem uma câmera. Adotar câmeras existentes ainda não é suportado; use Parallax ou remova a câmera.";
      if (typeof LightLayer !== "undefined" && layer instanceof LightLayer) continue;
      if (layer.threeDLayer && layer.enabled !== false) threeD++;
    }
    return threeD ? "" : "Câmera: não há camadas 3D. Prepare a cena com Parallax ou ative 3D nas camadas antes de aplicar a câmera.";
  }

  /* ------------------------------------------------------------- controls */

  /** @param {string} key @param {string} locale @returns {string} */
  function controlName(key, locale) {
    for (var i = 0; i < CONTROLS.length; i++) {
      var c = CONTROLS[i];
      if (c[0] === key) return (english(locale) ? "Moti.on Camera · " + c[3] : "Moti.on Câmera · " + c[2]);
    }
    return reject("Câmera: controle desconhecido.");
  }
  /** @param {string} type @returns {string} */
  function matchNameFor(type) { return type === "checkbox" ? MN.checkbox : type === "layer" ? MN.layerControl : MN.slider; }
  /** @param {any} plan @param {string} name @param {string} type @param {any} value @returns {any} */
  function ensureControl(plan, name, type, value) {
    var parade = plan.controller.property(MN.effects), effect = child(parade, name), matchName = matchNameFor(type);
    if (effect) {
      if (effect.matchName !== matchName) reject("Câmera: um efeito do usuário usa o nome de um controle do rig.");
      return effect;
    }
    if (!parade.canAddProperty(matchName)) reject("Câmera: o After Effects não permite adicionar o controle " + name + ".");
    effect = parade.addProperty(matchName);
    effect.name = name;
    plan.createdEffects.push(name);
    effect.property(1).setValue(value);
    return effect;
  }
  /** @param {any} plan @param {any} meta @param {string} locale */
  function ensureRigControls(plan, meta, locale) {
    var camera = plan.camera, options = camera.property(MN.options);
    var aperture = options.property(MN.aperture), blur = options.property(MN.blur);
    var defaults = /** @type {Record<string, any>} */ ({ intensity: 100, lens: 100, cover: meta.frame.cover ? 1 : 0, focusTarget: 0,
      focusOffset: 0, focusSmooth: 0.12, dof: 0, aperture: aperture ? aperture.valueAtTime(0, true) : 25, blur: blur ? blur.valueAtTime(0, true) : 100 });
    for (var i = 0; i < CONTROLS.length; i++) {
      var key = CONTROLS[i][0];
      if (!meta.controls[key]) meta.controls[key] = controlName(key, locale);
      ensureControl(plan, meta.controls[key], CONTROLS[i][1], defaults[key]);
    }
  }
  /** @param {any} shot @param {any} r @param {string} locale @returns {string} */
  function shotControlName(shot, r, locale) {
    return (english(locale) ? "Moti.on Camera " : "Moti.on Câmera ") + shot.id + " · " + r.name[english(locale) ? "en-US" : "pt-BR"] + " (%)";
  }

  /* -------------------------------------------------------------- markers */

  /** @param {any} value @param {string} rigId @returns {string} */
  function markerShot(value, rigId) {
    if (!value || typeof value.getParameters !== "function") return "";
    var p = value.getParameters();
    return p["Moti.on.camera"] === rigId && typeof p["Moti.on.shot"] === "string" ? p["Moti.on.shot"] : "";
  }
  /** @param {any} controller @returns {any} */
  function markers(controller) { var p = controller.property(MN.marker); return p && typeof p.setValueAtTime === "function" ? p : null; }
  /** Current timing of every shot: its marker when present, the stored values otherwise.
   * @param {any} controller @param {any} meta */
  function syncTiming(controller, meta) {
    var prop = markers(controller), i, j;
    if (!prop) return;
    for (i = 1; i <= prop.numKeys; i++) {
      var id = markerShot(prop.keyValue(i), meta.rigId);
      if (!id) continue;
      for (j = 0; j < meta.shots.length; j++) {
        if (meta.shots[j].id === id) { meta.shots[j].start = prop.keyTime(i); meta.shots[j].dur = Math.max(prop.keyValue(i).duration, 0.001); }
      }
    }
  }
  /** @param {any} plan @param {any} meta @param {any} shot @param {string} label */
  function placeMarker(plan, meta, shot, label) {
    var prop = markers(plan.controller);
    if (!prop || typeof MarkerValue === "undefined") return;
    removeMarker(plan.controller, meta, shot.id);
    var value = /** @type {any} */ (new MarkerValue(label));
    value.duration = shot.dur;
    var params = value.getParameters();
    params["Moti.on.camera"] = meta.rigId;
    params["Moti.on.shot"] = shot.id;
    value.setParameters(params);
    prop.setValueAtTime(shot.start, value);
  }
  /** @param {any} controller @param {any} meta @param {string} id */
  function removeMarker(controller, meta, id) {
    var prop = markers(controller);
    if (!prop) return;
    for (var i = prop.numKeys; i >= 1; i--) if (markerShot(prop.keyValue(i), meta.rigId) === id) prop.removeKey(i);
  }
  /** @param {any} controller @returns {any[]} */
  function snapshotMarkers(controller) {
    var prop = markers(controller), out = [];
    if (prop) for (var i = 1; i <= prop.numKeys; i++) out.push({ time: prop.keyTime(i), value: prop.keyValue(i) });
    return out;
  }
  /** @param {any} controller @param {any[]} items */
  function restoreMarkers(controller, items) {
    var prop = markers(controller);
    if (!prop) return;
    while (prop.numKeys > 0) prop.removeKey(prop.numKeys);
    for (var i = 0; i < items.length; i++) prop.setValueAtTime(items[i].time, items[i].value);
  }

  /* ---------------------------------------------------------- expressions */

  /** @param {string} rigId @returns {string} */
  function prefix(rigId) { return HEADER + SIGNATURE + rigId + "\n"; }
  /** @param {unknown} source @param {string} rigId @returns {boolean} */
  function isManaged(source, rigId) { return typeof source === "string" && source.replace(/\r\n?/g, "\n").indexOf(prefix(rigId)) === 0; }
  /** @param {unknown} source @returns {boolean} */
  function isAnyManaged(source) { return typeof source === "string" && source.replace(/\r\n?/g, "\n").indexOf(HEADER + SIGNATURE) === 0; }
  /** @param {string} owner @param {any} meta @returns {string} */
  function prelude(owner, meta) {
    var c = meta.controls, s = [], i, text;
    for (i = 0; i < meta.shots.length; i++) {
      var shot = meta.shots[i];
      var entry = /** @type {any} */ ({ id: shot.id, kind: shot.shape.kind, start: shot.start, dur: shot.dur, amount: 0, dir: shot.shape.dir,
        curve: shot.shape.curve, tr: shot.shape.tr, rot: shot.shape.rot, orb: shot.shape.orb, lens: shot.shape.lens,
        dolly: shot.shape.dolly, imp: shot.shape.imp, org: shot.shape.org });
      if (shot.shape.vis) entry.vis = shot.shape.vis;
      // A focus rack follows its layer live: the Layer Control's name and the point in the layer's own space.
      if (shot.focus) { entry.fl = shot.focus.control; entry.fo = shot.focus.local; }
      s.push(entry);
    }
    text = prefix(meta.rigId) + core.source + "\nvar ctl=" + owner + ";\n" +
      "function num(n,d){try{var v=Number(ctl.effect(n)(1));return isFinite(v)?v:d;}catch(e){return d;}}\n" +
      "var RIG=" + MotionJson.stringify(meta.frame) + ";RIG.cover=num(" + MotionJson.stringify(c.cover) + ",RIG.cover)?1:0;\n" +
      "var SH=" + MotionJson.stringify(s) + ";var gain=num(" + MotionJson.stringify(c.intensity) + ",100)/100;\n";
    for (i = 0; i < meta.shots.length; i++) {
      var sh = meta.shots[i];
      // A choreography's beats share one intensity control over their own base amounts.
      text += sh.group ? "SH[" + i + "].amount=" + (sh.amount / 100) + "*num(" + MotionJson.stringify(sh.control) + ",100)/100*gain;\n"
        : "SH[" + i + "].amount=num(" + MotionJson.stringify(sh.control) + "," + sh.amount + ")/100*gain;\n";
    }
    return text + "var cues=ctl.marker;for(var mi=1;mi<=Math.min(cues.numKeys,250);mi++){var cue=cues.key(mi),pr=cue.parameters;" +
      "if(pr&&pr[\"Moti.on.camera\"]===" + MotionJson.stringify(meta.rigId) + "){for(var si=0;si<SH.length;si++)if(SH[si].id===pr[\"Moti.on.shot\"])" +
      "{SH[si].start=cue.time;SH[si].dur=Math.max(thisComp.frameDuration,cue.duration);}}}\nvar P=camPose(time,RIG,SH);\n";
  }
  /** Expression text for each written property.
   * @param {any} meta @returns {Record<string, string>} */
  function render(meta) {
    var c = meta.controls, f = meta.frame, camera = prelude("parent", meta), controller = prelude("thisLayer", meta);
    // The focus point is the Focus target layer (or the pivot); visits and focus
    // racks move it through the kernel's fold of the same shots. A rack reads its
    // layer where it is now, so an animated title stays sharp.
    var focus = camera +
      "var ref=[" + f.cx + "," + f.cy + "," + f.pz + "],tgt=null;try{tgt=ctl.effect(" + MotionJson.stringify(c.focusTarget) + ")(1);}catch(e){tgt=null;}\n" +
      "if(tgt&&(tgt.index===ctl.index||tgt.index===index))tgt=null;\n" +
      "var hasV=false;for(var vi=0;vi<SH.length;vi++)if(SH[vi].kind===\"visit\"||SH[vi].kind===\"focus\")hasV=true;\n" +
      "function live(ti){for(var k=0;k<SH.length;k++){var q=SH[k];if(!q.fl)continue;try{var L=ctl.effect(q.fl)(1);" +
      "if(L&&L.index!==ctl.index&&L.index!==index){var w=L.toWorld([q.fo[0],q.fo[1],0],ti);q.vis[4]=w[0];q.vis[5]=w[1];q.vis[6]=w[2];}}catch(e){}}}\n" +
      // Smoothing only helps a moving Focus target layer under depth of field; the
      // visits' rack is already smooth, and without depth of field nothing shows.
      "var off=num(" + MotionJson.stringify(c.focusOffset) + ",0),sm=Math.max(0,Math.min(1,num(" + MotionJson.stringify(c.focusSmooth) + ",0.12)));\n" +
      "var n=(sm>0&&!hasV&&num(" + MotionJson.stringify(c.dof) + ",0))?7:1,sum=0,wsum=0;\n" +
      "for(var i=0;i<n;i++){var ti=time-(n>1?sm*i/(n-1):0),w=n-i,c=toWorld([0,0,0],ti),fw=normalize(toWorldVec([0,0,1],ti));\n" +
      "var fb=Math.max(1,(ref[0]-c[0])*fw[0]+(ref[1]-c[1])*fw[1]+(ref[2]-c[2])*fw[2]);\n" +
      "var tp=tgt?tgt.toWorld(tgt.anchorPoint.valueAtTime(ti),ti):ref;if(hasV){live(ti);RIG.fd=[tp[0],tp[1],tp[2]];tp=camPose(ti,RIG,SH).fp;}\n" +
      "sum+=w*camFocusDepth(c,fw,tp,off,50,fb);wsum+=w;}\nsum/wsum;";
    var simple = prefix(meta.rigId) + "var ctl=parent;\nfunction num(n,d){try{var v=Number(ctl.effect(n)(1));return isFinite(v)?v:d;}catch(e){return d;}}\n";
    return {
      position: controller + "[P.m[0]+value[0]-RIG.cx,P.m[1]+value[1]-RIG.cy,P.m[2]+value[2]-RIG.pz];",
      orientation: controller + "camOrientation(P);",
      rotation: controller + "value+P.roll;",
      zoom: camera + "P.zoom*(value/" + f.zoom + ")*Math.max(1,num(" + MotionJson.stringify(c.lens) + ",100))/100;",
      focus: focus,
      dof: simple + "num(" + MotionJson.stringify(c.dof) + ",0)?1:0;",
      aperture: simple + "Math.max(0,num(" + MotionJson.stringify(c.aperture) + ",value));",
      blur: simple + "Math.max(0,num(" + MotionJson.stringify(c.blur) + ",value));"
    };
  }

  /* -------------------------------------------------------------- writing */

  /** @param {any} plan @param {string} owner @returns {any} */
  function ownerLayer(plan, owner) { return owner === "controller" ? plan.controller : plan.camera; }
  /** May the engine write this property? Empty, already ours, or a legacy
   * Moti.on Parallax focus (kept as the original to restore on removal).
   * @param {any} prop @param {any} meta @param {string} key @returns {string} */
  function writeProblem(prop, meta, key) {
    if (!prop || !prop.canSetExpression) return "Câmera: a propriedade " + key + " não aceita expressão.";
    if (prop.expression === "" || isManaged(prop.expression, meta.rigId)) return "";
    if (key === "focus" && MotionExpressions.isManagedParallaxFocus(prop.expression)) return "";
    if (key === "orientation" || key === "position" || key === "rotation") {
      return "Câmera: o controle do rig tem uma expressão (" + key + ") que não é do motor de câmera. Remova-a ou faça Bake antes.";
    }
    return "Câmera: a câmera tem uma expressão em " + key + " que não é do motor. Remova-a antes de aplicar.";
  }
  /** Writes every engine expression; records each original once.
   * @param {any} plan @param {any} meta */
  function writeAll(plan, meta) {
    var texts = render(meta), comp = plan.comp;
    for (var i = 0; i < TARGETS.length; i++) {
      var target = TARGETS[i], layer = ownerLayer(plan, target.owner), prop = locate(layer, target.path);
      var problem = writeProblem(prop, meta, target.key);
      if (problem) reject(problem);
      var known = false;
      for (var j = 0; j < meta.originals.length; j++) if (meta.originals[j].key === target.key) known = true;
      if (!known) meta.originals.push({ key: target.key, expression: prop.expression, enabled: prop.expressionEnabled });
      plan.snapshots.push({ layer: layer, path: target.path, expression: prop.expression, enabled: prop.expressionEnabled });
      prop.expression = texts[target.key];
      prop.expressionEnabled = true;
      prop.valueAtTime(comp.time, false);
      if (prop.expressionError) reject("Câmera: o After Effects recusou a expressão (" + target.key + "): " + prop.expressionError);
    }
  }
  /** Restores the original expressions recorded by `writeAll`.
   * @param {any} plan @param {any} meta */
  function restoreOriginals(plan, meta) {
    for (var i = 0; i < TARGETS.length; i++) {
      var target = TARGETS[i], prop = locate(ownerLayer(plan, target.owner), target.path), original = null;
      for (var j = 0; j < meta.originals.length; j++) if (meta.originals[j].key === target.key) original = meta.originals[j];
      if (!prop || !original) continue;
      if (!isManaged(prop.expression, meta.rigId)) continue;
      prop.expression = original.expression;
      prop.expressionEnabled = original.enabled;
    }
  }
  /** Undo of a partial run: expressions, markers, controls, metadata and layers.
   * @param {any} plan */
  function rollback(plan) {
    var failed = false, i;
    for (i = plan.snapshots.length - 1; i >= 0; i--) {
      try { var s = plan.snapshots[i], p = locate(s.layer, s.path); p.expression = s.expression; p.expressionEnabled = s.enabled; } catch (e) { failed = true; }
    }
    try { if (plan.markerSnapshot) restoreMarkers(plan.controller, plan.markerSnapshot); } catch (e) { failed = true; }
    for (i = plan.createdEffects.length - 1; i >= 0; i--) {
      try { var e = child(plan.controller.property(MN.effects), plan.createdEffects[i]); if (e) e.remove(); } catch (e2) { failed = true; }
    }
    try { if (plan.commentBefore !== null) plan.controller.comment = plan.commentBefore; } catch (e) { failed = true; }
    for (i = plan.createdLayers.length - 1; i >= 0; i--) { try { plan.createdLayers[i].remove(); } catch (e) { failed = true; } }
    if (failed) { var error = /** @type {any} */ (new Error("Câmera: restauração incompleta.")); error.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw error; }
  }

  /* ---------------------------------------------------------------- plans */

  /** Resolves the rig for a mutation without touching the project.
   * @param {any} comp @param {boolean} allowCreate @returns {any} */
  function plan(comp, allowCreate) {
    var engine = findEngine(comp), result = /** @type {any} */ ({ comp: comp, snapshots: [], createdEffects: [], createdLayers: [],
      markerSnapshot: null, commentBefore: null });
    if (engine) {
      result.controller = engine.controller; result.camera = engine.camera; result.meta = engine.meta; result.mode = engine.meta.mode;
      if (engine.controller.locked || engine.camera.locked) reject("Câmera: desbloqueie o controle e a câmera do rig.");
      return result;
    }
    var parallax = findParallax(comp);
    if (parallax) {
      if (parallax.master.locked || parallax.camera.locked) reject("Câmera: desbloqueie o controle e a câmera do Parallax.");
      result.controller = parallax.master; result.camera = parallax.camera; result.mode = "parallax"; result.parallax = parallax;
    } else {
      var problem = standaloneProblem(comp);
      if (problem) reject(problem);
      result.mode = "standalone";
    }
    if (!allowCreate) reject("Câmera: aplique um shot antes de ajustar.");
    return result;
  }
  /** Validates the properties the engine will write, before anything changes.
   * @param {any} p */
  function checkWritable(p) {
    if (!p.controller) return;
    var probe = p.meta || { rigId: "" };
    for (var i = 0; i < TARGETS.length; i++) {
      var prop = locate(ownerLayer(p, TARGETS[i].owner), TARGETS[i].path);
      var problem = writeProblem(prop, probe, TARGETS[i].key);
      if (problem && !(p.meta && prop && isManaged(prop.expression, p.meta.rigId))) reject(problem);
    }
    var orientation = locate(p.controller, [MN.transform, MN.orientation]);
    if (orientation && orientation.numKeys > 0) reject("Câmera: a Orientation do controle tem keyframes. Remova-os antes de aplicar.");
    var rx = locate(p.controller, [MN.transform, MN.rotationX]), ry = locate(p.controller, [MN.transform, MN.rotationY]);
    if ((rx && (rx.numKeys || rx.valueAtTime(0, true))) || (ry && (ry.numKeys || ry.valueAtTime(0, true)))) {
      reject("Câmera: zere a rotação X/Y do controle antes de aplicar.");
    }
  }
  /** Creates the standalone pair, or adopts the Parallax master, and the metadata.
   * @param {any} p @param {string} locale */
  function establish(p, locale) {
    var comp = p.comp;
    if (p.meta) return;
    var frame = p.mode === "parallax" ? parallaxFrame(comp, p.parallax) : standaloneFrame(comp);
    if (p.mode === "standalone") {
      var controller = comp.layers.addNull(comp.duration);
      p.createdLayers.push(controller);
      controller.name = MotionContracts.RIG_PREFIX + "CAMERA | CONTROL";
      controller.threeDLayer = true;
      controller.guideLayer = true;
      controller.property(MN.transform).property(MN.anchor).setValue([0, 0, 0]);
      controller.property(MN.transform).property(MN.position).setValue([frame.cx, frame.cy, frame.pz]);
      var camera = comp.layers.addCamera(MotionContracts.RIG_PREFIX + "CAMERA", [frame.cx, frame.cy]);
      p.createdLayers.push(camera);
      camera.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
      camera.inPoint = 0; camera.outPoint = comp.duration;
      camera.property(MN.options).property(MN.zoom).setValue(frame.zoom);
      camera.property(MN.options).property(MN.focus).setValue(frame.dist);
      camera.parent = controller;
      camera.property(MN.transform).property(MN.position).setValue([0, 0, -frame.dist]);
      camera.property(MN.transform).property(MN.orientation).setValue([0, 0, 0]);
      p.controller = controller; p.camera = camera;
    }
    p.commentBefore = String(p.controller.comment || "");
    p.meta = { version: 1, rigId: "camera-" + comp.id + "-" + p.controller.id, mode: p.mode, compId: comp.id,
      controllerId: p.controller.id, cameraId: p.camera.id, locale: locale, frame: frame, controls: {}, originals: [],
      created: p.mode === "standalone" ? [p.controller.id, p.camera.id] : [], shots: [], next: 1,
      pluginVersion: /** @type {any} */ (MotionContracts).PLUGIN_VERSION || "" };
  }
  /* ---------------------------------------------------------------- scene */

  /** A point of the layer's own space in its parent's space, after expressions.
   * @param {any} layer @param {any} point @returns {any} */
  function toParent(layer, point) {
    var tr = layer.property(MN.transform), pos = tr.property(MN.position).value, anchor = tr.property(MN.anchor).value;
    var v = MotionTransform.apply(MotionTransform.linearMatrix(layer), [point[0] - anchor[0], point[1] - anchor[1], (point[2] || 0) - (anchor[2] || 0)]);
    return [pos[0] + v[0], pos[1] + v[1], (pos.length > 2 ? pos[2] : 0) + v[2]];
  }
  /** @param {any} layer @param {any} point @returns {any} */
  function toWorldPoint(layer, point) {
    var q = toParent(layer, point), parent = layer.parent, guard = 0;
    while (parent && guard < 32) { q = toParent(parent, q); parent = parent.parent; guard++; }
    return q;
  }
  /** @param {any} layer @returns {string} */
  function kindOf(layer) {
    if (typeof TextLayer !== "undefined" && layer instanceof TextLayer) return "text";
    if (typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) return "shape";
    return layer.source instanceof CompItem ? "comp" : "image";
  }
  /** May a choreography visit this layer? Visible 3D picture layers only.
   * @param {any} p @param {any} layer @returns {boolean} */
  function visitable(p, layer) {
    if (!layer.threeDLayer || layer.enabled === false || layer.guideLayer || layer.adjustmentLayer || layer.nullLayer) return false;
    if (layer instanceof CameraLayer || (typeof LightLayer !== "undefined" && layer instanceof LightLayer)) return false;
    if ((p.controller && layer === p.controller) || (p.camera && layer === p.camera)) return false;
    return layer.hasVideo !== false;
  }
  /** One layer as the planner sees it: world centre and half extents at the comp
   * time, after the Parallax compensation; `mx` the magnification its footage
   * holds; `lc` the centre in the layer's own space, which the focus expression
   * follows live when the layer animates.
   * @param {any} comp @param {any} layer @param {any} frame @param {boolean} background @returns {any} */
  function sceneLayer(comp, layer, frame, background) {
    var r = layer.sourceRectAtTime(comp.time, false), corners = /** @type {any[]} */ ([]), i;
    var local = /** @type {any[]} */ ([[r.left, r.top], [r.left + r.width, r.top], [r.left + r.width, r.top + r.height], [r.left, r.top + r.height]]);
    for (i = 0; i < 4; i++) corners.push(toWorldPoint(layer, local[i]));
    var c = /** @type {any} */ ([0, 0, 0]);
    for (i = 0; i < 4; i++) { c[0] += corners[i][0] / 4; c[1] += corners[i][1] / 4; c[2] += corners[i][2] / 4; }
    /** @param {any} a @param {any} b @returns {number} */
    function span(a, b) { return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2) + Math.pow(b[2] - a[2], 2)) / 2; }
    var hw = span(corners[0], corners[1]), hh = span(corners[0], corners[3]), mx = 0, kind = kindOf(layer);
    var refDistance = Math.max(1, c[2] - (frame.pz - frame.dist)), shown = 2 * hw * frame.zoom / refDistance;
    if (kind === "image" && layer.source && layer.source.width && shown > 0) mx = layer.source.width / shown;
    return { id: layer.id, name: layer.name, kind: kind, c: c, hw: hw, hh: hh, bg: background ? 1 : 0, mx: mx, lc: [r.left + r.width / 2, r.top + r.height / 2] };
  }
  /** Layers a choreography can visit: the Parallax members (the farthest one is the
   * background), or every visitable 3D layer of a standalone scene; optionally only
   * the selected ones. Invisible or degenerate layers are skipped. With `time`,
   * the layers are read there (the time indicator moves for the read and comes
   * back): a title that scales in from 0 is degenerate at its first frame.
   * @param {any} p @param {any} frame @param {boolean} selectedOnly @param {number} [time] @returns {any[]} */
  function scene(p, frame, selectedOnly, time) {
    var comp = p.comp, saved = comp.time;
    if (typeof time !== "number" || !isFinite(time) || Math.abs(time - saved) < 1e-6) return sceneNow(p, frame, selectedOnly);
    comp.time = Math.max(0, Math.min(comp.duration - comp.frameDuration, time));
    try { return sceneNow(p, frame, selectedOnly); } finally { comp.time = saved; }
  }
  /** @param {any} p @param {any} frame @param {boolean} selectedOnly @returns {any[]} */
  function sceneNow(p, frame, selectedOnly) {
    var comp = p.comp, out = [], i, layer, parallax = p.mode === "parallax" ? (p.parallax || findParallax(comp)) : null;
    var members = [], far = -Infinity, farId = -1;
    if (parallax) {
      for (i = 0; i < (parallax.data.originals || []).length; i++) { layer = byId(comp, parallax.data.originals[i].id); if (layer) members.push(layer); }
    } else {
      for (i = 1; i <= comp.numLayers; i++) members.push(comp.layer(i));
    }
    for (i = 0; i < members.length; i++) {
      layer = members[i];
      if (!visitable(p, layer) || (selectedOnly && !layer.selected)) continue;
      var entry = sceneLayer(comp, layer, frame, false);
      if (!(entry.hw > 0.5 && entry.hh > 0.5) || entry.c[2] <= frame.pz - frame.dist + 1) continue;
      out.push(entry);
      if (parallax && entry.c[2] > far) { far = entry.c[2]; farId = entry.id; }
    }
    for (i = 0; i < out.length; i++) if (out[i].id === farId && out.length > 1) out[i].bg = 1;
    return out;
  }
  /** The frame a rig has, or would have if a shot were applied now. @param {any} p @returns {any} */
  function frameOf(p) {
    if (p.meta) return p.meta.frame;
    return p.mode === "parallax" ? parallaxFrame(p.comp, p.parallax) : standaloneFrame(p.comp);
  }

  /** @param {any} p @param {string} locale */
  function prepareWrite(p, locale) {
    if (p.commentBefore === null) p.commentBefore = String(p.controller.comment || "");
    p.markerSnapshot = snapshotMarkers(p.controller);
    ensureRigControls(p, p.meta, locale);
  }
  /** Removes every engine control, marker and expression, keeping the layers.
   * @param {any} p */
  function detach(p) {
    var meta = p.meta, parade = p.controller.property(MN.effects), i;
    restoreOriginals(p, meta);
    var prop = markers(p.controller);
    if (prop) for (i = prop.numKeys; i >= 1; i--) if (markerShot(prop.keyValue(i), meta.rigId)) prop.removeKey(i);
    var names = [];
    for (var key in meta.controls) if (Object.prototype.hasOwnProperty.call(meta.controls, key)) names.push(meta.controls[key]);
    for (i = 0; i < meta.shots.length; i++) {
      names.push(meta.shots[i].control);
      if (meta.shots[i].focus) names.push(meta.shots[i].focus.control);
    }
    for (i = 0; i < names.length; i++) { var e = child(parade, names[i]); if (e) e.remove(); }
    writeMeta(p.controller, null);
  }

  global.MotionCameraRig = {
    TAG: TAG, MAX_SHOTS: MAX_SHOTS, TARGETS: TARGETS, MN: MN,
    recipe: recipe, readMeta: readMeta, writeMeta: writeMeta, findEngine: findEngine, findParallax: findParallax,
    plan: plan, checkWritable: checkWritable, establish: establish, prepareWrite: prepareWrite, writeAll: writeAll,
    rollback: rollback, detach: detach, syncTiming: syncTiming, placeMarker: placeMarker, removeMarker: removeMarker,
    shotControlName: shotControlName, ensureControl: ensureControl, render: render, isManaged: isManaged,
    isAnyManaged: isAnyManaged, locate: locate, child: child, copy: copy, reject: reject, byId: byId,
    controlName: controlName, scene: scene, frameOf: frameOf
  };
}($.global));
