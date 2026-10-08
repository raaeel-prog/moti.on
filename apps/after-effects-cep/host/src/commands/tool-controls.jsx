/** Read only bundled, stable pseudo-effect signatures. Display names never
 * authorize edits. Native animation/expression controls remain read-only here. */
(function (global) {
  var catalog = /** @type {any} */ (null);
  function definitions() {
    if (catalog) return catalog;
    catalog = {};
    var source = /** @type {any} */ (global).MotionControlPresets || {}, key;
    for (key in source) if (Object.prototype.hasOwnProperty.call(source, key)) {
      try { catalog[source[key].matchName] = MotionJson.parse(key); }
      catch (invalidCatalog) { /* An unknown schema never authorizes an edit. */ }
    }
    return catalog;
  }
  /** @param {any} effect @param {any} layer @param {any} comp @returns {any} */
  function describe(effect, layer, comp) {
    var rows = definitions()[effect.matchName];
    if (!rows || rows.length > 64 || effect.numProperties !== rows.length) return null;
    var controls = [], values = [], i;
    for (i = 0; i < rows.length; i += 1) {
      var row = rows[i], p = effect.property(i + 1);
      if (!p || p.matchName !== effect.matchName + "-" + ("0000" + (i + 1)).slice(-4)) return null;
      var value = p.value, kind = row[1], choices = [];
      if (kind === "dropdown" && row[6]) for (var j = 0; j < row[6].length; j += 1) choices.push({value:j+1,label:String(row[6][j][1])});
      var item = {id:String(row[0]),label:String(row[2]),kind:kind,value:value,
        locked:Boolean(layer.locked || p.numKeys > 0 || p.expression)};
      if (typeof row[4] === "number") /** @type {any} */ (item).min = row[4];
      if (typeof row[5] === "number") /** @type {any} */ (item).max = row[5];
      if (choices.length) /** @type {any} */ (item).options = choices;
      controls.push(item); values.push([p.matchName,value,p.numKeys||0,String(p.expression||"")]);
    }
    return {id:String(layer.id)+":"+effect.propertyIndex+":"+effect.matchName,name:String(effect.name),layerName:String(layer.name),
      target:{compId:comp.id,layerId:layer.id,effectIndex:effect.propertyIndex,matchName:effect.matchName,
        fingerprint:MotionJson.stringify([String(layer.comment||""),String(effect.name),Boolean(layer.locked),values])},controls:controls};
  }
  /** @returns {any[]} */
  function inspect() {
    var comp = /** @type {any} */ (app.project && app.project.activeItem), result = /** @type {any[]} */ ([]);
    if (!comp || !(comp instanceof CompItem) || comp.selectedLayers.length !== 1) return result;
    var layer = /** @type {any} */ (comp.selectedLayers[0]), parade = layer.property("ADBE Effect Parade");
    if (!parade) return result;
    for (var i = 1; i <= parade.numProperties && i <= 128 && result.length < 24; i += 1) {
      var data = describe(parade.property(i),layer,comp); if (data) result.push(data);
    }
    return result;
  }
  /** @param {string} message @returns {MotionCommandFailure} */
  function fail(message) { return {code:MotionContracts.ERROR.INVALID_PRESET,message:message,recoverable:true,details:null}; }
  /** @param {any} args @returns {any} */
  function prepare(args) {
    if (!args || !args.target || !args.values || typeof args.values !== "object") return {error:fail("Informe a ferramenta e os ajustes.")};
    for (var k in args) if (Object.prototype.hasOwnProperty.call(args,k) && k !== "target" && k !== "values") return {error:fail("Argumento desconhecido.")};
    var entries = inspect(), target = args.target, found = null;
    for (var i = 0; i < entries.length; i += 1) {
      var t = entries[i].target;
      if (t.compId === target.compId && t.layerId === target.layerId && t.effectIndex === target.effectIndex &&
          t.matchName === target.matchName && t.fingerprint === target.fingerprint) found = entries[i];
    }
    if (!found) return {error:fail("A seleção ou a ferramenta mudou. Confira os controles antes de aplicar.")};
    var writes = [], comp = /** @type {any} */ (app.project.activeItem), effect = comp.selectedLayers[0].property("ADBE Effect Parade").property(target.effectIndex);
    for (k in args.values) if (Object.prototype.hasOwnProperty.call(args.values,k)) {
      var index = -1;
      for (i = 0; i < found.controls.length; i += 1) if (found.controls[i].id === k) index = i;
      if (index < 0) return {error:fail("Controle desconhecido.")};
      var control = found.controls[index], value = args.values[k];
      if (control.locked) return {error:fail("Preserve os controles animados ou com expressão no After Effects.")};
      if (control.kind === "color" || control.kind === "point") {
        var length = control.kind === "color" ? 4 : 2;
        if (Object.prototype.toString.call(value) !== "[object Array]" || value.length !== length) return {error:fail("Dimensão do controle inválida.")};
        for (i = 0; i < value.length; i += 1) if (typeof value[i] !== "number" || !isFinite(value[i]) || (control.kind === "color" && (value[i] < 0 || value[i] > 1))) return {error:fail("Valor do controle inválido.")};
      } else {
        if (typeof value !== "number" || !isFinite(value)) return {error:fail("Use um valor numérico válido.")};
        if (control.kind === "dropdown") {
          if (value !== Math.floor(value) || value < 1 || value > control.options.length) return {error:fail("Opção inválida.")};
        } else if ((typeof control.min === "number" && value < control.min) || (typeof control.max === "number" && value > control.max) || (control.kind === "checkbox" && value !== 0 && value !== 1)) return {error:fail("Controle fora da faixa.")};
      }
      if (MotionJson.stringify(value) !== MotionJson.stringify(control.value)) writes.push({property:effect.property(index+1),before:control.value,value:value});
    }
    if (writes.length > 64) return {error:fail("Ajustes demais em uma operação.")};
    return {error:null,writes:writes};
  }
  MotionRegistry.register("ae.tools.adjust", {
    preflight:function(args) { return prepare(args).error; },
    run:function(args) {
      var ready = prepare(args); if (ready.error) throw new Error(ready.error.message);
      var applied = 0;
      try { for (var i = 0; i < ready.writes.length; i += 1) { applied = i+1; ready.writes[i].property.setValue(ready.writes[i].value); } }
      catch (writeError) {
        var failed = false;
        for (var r = applied-1; r >= 0; r -= 1) try { ready.writes[r].property.setValue(ready.writes[r].before); } catch (restoreError) { failed = true; }
        if (failed) { var error = /** @type {any} */ (new Error("Falha ao restaurar os controles. Use Desfazer.")); error.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED; throw error; }
        throw writeError;
      }
      return {changed:applied>0,data:{appliedCount:applied},warnings:[]};
    }
  });
  /** @type {any} */ (global).MotionToolControls = {inspect:inspect};
}($.global));
