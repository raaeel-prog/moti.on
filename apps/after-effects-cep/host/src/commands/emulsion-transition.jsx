/** Thin test integration. The distributable pack does not depend on Moti.on. */
(function (global) {
  var pack = /** @type {any} */ (global).EmulsionV2;
  var manifest = /** @type {any} */ (global).EmulsionV2Manifest;
  var camera = /** @type {any} */ (global).MotionCameraTransition;
  var scriptFile = /** @type {any} */ ($).fileName;
  var root = /** @type {any} */ (global).MotionEmulsionAssetRoot;
  var presetIds = /** @type {Record<string, boolean>} */ ({});
  for (var recipeIndex = 0; recipeIndex < manifest.profiles.length; recipeIndex++) {
    presetIds[manifest.profiles[recipeIndex].id] = true;
  }
  if (!root && scriptFile) root = new File(scriptFile).parent.parent.fsName + "/packs/emulsion-v2/materials";
  var configurationError = /** @type {any} */ (null);
  try { pack.configure(manifest, root || ""); } catch (error) { configurationError = error; }

  /** @param {any} error */
  function problem(error) { var known=/** @type {any} */ (MotionContracts.ERROR);return {code:known[error.code] || known.INVALID_PRESET,message:String(error.message || error),recoverable:true,details:null}; }
  /** @param {any} args */
  function preflight(args) { if(configurationError)return problem(configurationError);var error=pack.preflight(comp(),args);return error ? problem(error) : null; }
  /** @param {any} args @param {any} context */
  function apply(args,context) { try { return result(pack.apply(comp(),args,context.locale),args.presetId); } catch(error) { var failure=/** @type {any} */ (error);failure.motionCode=problem(failure).code;throw failure; } }

  /** @param {string} id */
  function film(id) { return Object.prototype.hasOwnProperty.call(presetIds, id); }
  function comp() { return /** @type {any} */ (app.project && app.project.activeItem); }
  function selectedFilm() { var c = comp(), list = c && c.selectedLayers || []; for (var i = 0; i < list.length; i++) if (pack.owns(list[i])) return true; return false; }
  /** @param {any} value @param {string} presetId */
  function result(value, presetId) {
    return {changed:true, data:{appliedCount:1,presetId:presetId,layerId:value.layer.id,precompId:value.precompId,created:value.created,cameraTransition:true,packId:manifest.id},warnings:[]};
  }
  var handler = /** @type {any} */ (MotionRegistry.get("ae.presets.camera-transition"));
  var oldPreflight = handler.preflight, oldRun = handler.run;
  /** @param {any} args @param {any} context */
  handler.preflight = function (args, context) { return film(args.presetId) ? preflight(args) : oldPreflight(args, context); };
  /** @param {any} args @param {any} context */
  handler.run = function (args, context) { return film(args.presetId) ? apply(args, context) : oldRun(args, context); };

  var oldOwns = camera.owns, oldInspect = camera.inspect, oldSelected = camera.hasSelected;
  var oldAdjust = camera.adjustPreflight, oldApply = camera.apply;
  var oldSelection = camera.selectionPreflight, oldRemove = camera.remove, oldBake = camera.bake;
  /** @param {any} layer */
  camera.owns = function (layer) { return pack.owns(layer) || oldOwns(layer); };
  /** @param {any} layer */
  camera.inspect = function (layer) { return pack.owns(layer) ? pack.inspect(layer) : oldInspect(layer); };
  /** @param {any} c */
  camera.hasSelected = function (c) { var list=c && c.selectedLayers || [];for(var i=0;i<list.length;i++)if(pack.owns(list[i]))return true;return oldSelected(c); };
  /** @param {any} args */
  camera.adjustPreflight = function (args) { if(!film(args.presetId))return oldAdjust(args);var error=pack.adjustPreflight(args);return error ? problem(error) : null; };
  /** @param {any} args @param {any} context */
  camera.apply = function (args, context) { return film(args.presetId) ? apply(args, context) : oldApply(args, context); };
  /** @param {string} action */
  camera.selectionPreflight = function (action) { if(!selectedFilm())return oldSelection(action);var error=pack.selectionPreflight(action,comp());return error ? problem(error) : null; };
  camera.remove = function () { if(!selectedFilm())return oldRemove();var value=pack.remove(comp());return {changed:true,data:{appliedCount:value.removed || 1},warnings:[]}; };
  camera.bake = function () { if(!selectedFilm())return oldBake();pack.bake(comp());return {changed:true,data:{appliedCount:1},warnings:[]}; };
}($.global));
