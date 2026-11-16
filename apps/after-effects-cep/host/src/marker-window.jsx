/** Range timing cues (marker version 2). Each owned cue is a marker with a
 * duration: the entrance plays from the cue start, the exit ends at the cue end.
 * A cue written on a layer edge records that edge relative to the layer's
 * startTime, so an untouched cue keeps following the edge when the layer is
 * trimmed, while a cue the user dragged is read literally. The host and the
 * generated expression share these rules so preflight sees what AE renders. */
(function (global) {
  /* global MarkerValue */
  var EDGE = "Moti.on.edge";
  var INSTANCE = "Moti.on.instance";
  var PHASE = "Moti.on.phase";

  /** @param {any} value @returns {boolean} */
  function finite(value) { return typeof value === "number" && isFinite(value); }

  /** @param {any} params @returns {number|null} */
  function storedEdge(params) {
    if (!params || params[EDGE] === undefined) return null;
    var edge = parseFloat(params[EDGE]);
    return finite(edge) ? edge : null;
  }

  /** Effective window of one cue on the layer as it is now.
   * @param {string} role @param {number} time @param {number} duration @param {any} params
   * @param {any} layer @param {number} frameDuration @returns {{start:number,end:number,duration:number,anchored:boolean}} */
  function cueWindow(role, time, duration, params, layer, frameDuration) {
    var tolerance = frameDuration / 2, edge = storedEdge(params), span = duration > 0 ? duration : 0;
    var origin = finite(layer.startTime) ? layer.startTime : 0, anchored, start, end;
    if (role === "in") {
      anchored = edge !== null && Math.abs(time - origin - edge) <= tolerance;
      start = anchored ? layer.inPoint : time;
      end = start + span;
    } else {
      anchored = edge !== null && Math.abs(time + span - origin - edge) <= tolerance;
      end = anchored ? layer.outPoint : time + span;
      start = end - span;
    }
    return {start: start, end: end, duration: span, anchored: anchored};
  }

  /** Copy of `params` whose edge entry matches where the window now sits.
   * @param {any} params @param {string} role @param {number} start @param {number} end
   * @param {any} layer @param {number} frameDuration @returns {any} */
  function edgeParams(params, role, start, end, layer, frameDuration) {
    var copy = /** @type {any} */ ({}), key, origin = finite(layer.startTime) ? layer.startTime : 0, tolerance = frameDuration / 2;
    for (key in params) if (Object.prototype.hasOwnProperty.call(params, key) && key !== EDGE) copy[key] = params[key];
    if (role === "in" && Math.abs(start - layer.inPoint) <= tolerance) copy[EDGE] = String(layer.inPoint - origin);
    if (role === "out" && Math.abs(end - layer.outPoint) <= tolerance) copy[EDGE] = String(layer.outPoint - origin);
    return copy;
  }

  /** Independent copy of a cue, so a rollback snapshot is never mutated.
   * @param {any} source @returns {any} */
  function copy(source) {
    var value = /** @type {any} */ (new MarkerValue(source.comment)), fields = /** @type {any[]} */ (["chapter", "url", "frameTarget", "duration", "cuePointName", "eventCuePoint", "label", "protectedRegion"]);
    for (var i = 0; i < fields.length; i++) if (typeof source[fields[i]] !== "undefined") value[fields[i]] = source[fields[i]];
    value.setParameters(source.getParameters());
    return value;
  }

  /** Expression prelude defining inStart, markerIn, outEnd and markerOut.
   * `dur` (the Duration control) only fills in for a deleted cue.
   * @param {string} instanceJson already-serialized instance id @returns {string} */
  function expression(instanceJson) {
    return "var inStart=inPoint,markerIn=dur,outEnd=outPoint,markerOut=dur,edgeTol=thisComp.frameDuration/2,cueOrigin=thisLayer.startTime,cues=thisLayer.marker;\n" +
      "for(var mi=1;mi<=Math.min(cues.numKeys,250);mi++){var cue=cues.key(mi),params=cue.parameters;if(params[\"" + INSTANCE + "\"]!==" + instanceJson + ")continue;" +
      "var role=params[\"" + PHASE + "\"],edge=params[\"" + EDGE + "\"],span=cue.duration>0?cue.duration:dur;" +
      "if(role===\"in\"){markerIn=span;inStart=edge!==undefined&&Math.abs(cue.time-cueOrigin-parseFloat(edge))<=edgeTol?inPoint:cue.time;}" +
      "if(role===\"out\"){markerOut=span;outEnd=edge!==undefined&&Math.abs(cue.time+span-cueOrigin-parseFloat(edge))<=edgeTol?outPoint:cue.time+span;}}\n" +
      "inStart=Math.max(inPoint,Math.min(outPoint,inStart));outEnd=Math.max(inPoint,Math.min(outPoint,outEnd));" +
      "markerIn=Math.max(.0001,Math.min(outPoint-inStart,markerIn));markerOut=Math.max(.0001,Math.min(outEnd-inPoint,markerOut));\n";
  }

  /** @type {any} */ (global).MotionMarkerWindow = {EDGE: EDGE, cueWindow: cueWindow, edgeParams: edgeParams, copy: copy, expression: expression};
}($.global));
