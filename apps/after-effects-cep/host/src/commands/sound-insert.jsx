/**
 * Biblioteca de sons (`ae.sound.insert`, ADR 0006).
 *
 * Importa o WAV sintetizado pelo proprio Moti.on (uma vez por projeto, na
 * pasta "Moti.on Elementos/Sons") e o coloca como camada de audio na
 * composicao ativa, no tempo atual. Opcional: tocar ao contrario (esticamento
 * de -100%) e ganho em dB nos Niveis de audio. Nada e baixado nem vem de
 * terceiros.
 */
/* global ImportOptions, FolderItem, FootageItem */
(function () {
  /** @returns {any} */
  function lib() { return /** @type {any} */ ($.global).MotionElements; }
  var ALLOWED = { soundId: true, reverse: true, gainDb: true };
  var GAIN = /** @type {any[]} */ ([-24, 6]);
  var FOLDER = /** @type {any} */ ({ "pt-BR": "Moti.on Elementos", "en-US": "Moti.on Elements" });
  var SOUND_FOLDER = /** @type {any} */ ({ "pt-BR": "Sons", "en-US": "Sounds" });
  var FOLDER_TAG = "[MOTION_ELEMENTS_FOLDER]", SOUND_TAG = "[MOTION_ELEMENTS_SOUNDS]", MARK = "[MOTION_SOUND_V1]";
  var bundleFile = typeof $.fileName === "string" ? $.fileName : "";
  var staged = /** @type {any} */ (null);

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details };
  }
  /** @param {string} field @param {string} message @returns {MotionCommandFailure} */
  function invalid(field, message) { return failure(MotionContracts.ERROR.INVALID_PRESET, message, { field: field }); }
  /** @param {string} id @returns {any} */
  function find(id) {
    var list = lib().soundCatalog;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** @param {any} context @returns {string} */
  function localeOf(context) { return context && context.locale === "en-US" ? "en-US" : "pt-BR"; }
  /** @param {string} id @returns {any} */
  function soundFile(id) { return new File(new File(bundleFile).parent.parent.fsName + "/assets/sounds/" + id + ".wav"); }

  /** Mesmas regras de `soundInsertError` no contrato. @param {Record<string, any>} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) return invalid(key, "Parâmetro de som desconhecido.");
    if (typeof args.soundId !== "string" || !find(args.soundId)) return invalid("soundId", "Som desconhecido.");
    if (typeof args.reverse !== "undefined" && typeof args.reverse !== "boolean") return invalid("reverse", "Use verdadeiro ou falso para tocar ao contrário.");
    var gain = args.gainDb;
    if (typeof gain !== "undefined" && !(typeof gain === "number" && isFinite(gain) && gain >= GAIN[0] && gain <= GAIN[1])) return invalid("gainDb", "O ganho precisa estar entre -24 dB e +6 dB.");
    return null;
  }

  /** @param {Record<string, any>} args @param {any} context @returns {MotionCommandFailure|null} */
  function preflight(args, context) {
    staged = null;
    var problem = validate(args);
    if (problem) return problem;
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var project = /** @type {any} */ (app.project), comp = project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição para inserir o som.");
    var file = soundFile(args.soundId);
    if (!file.exists) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O arquivo do som não foi encontrado. Reinstale o Moti.on.", { sound: args.soundId });
    var ImportAs = /** @type {any} */ ($.global).ImportAsType, options;
    try {
      options = /** @type {any} */ (new ImportOptions(file));
      if (!ImportAs || typeof options.canImportAs !== "function" || !options.canImportAs(ImportAs.FOOTAGE)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não consegue importar o som.");
      options.importAs = ImportAs.FOOTAGE;
    } catch (probe) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não consegue importar o som.");
    }
    staged = { project: project, comp: comp, file: file, options: options, locale: localeOf(context), sound: find(args.soundId), fingerprint: MotionJson.stringify(args) };
    return null;
  }

  /** @param {any} project @param {any} parent @param {string} tag @param {string} name @param {any[]} created @returns {any} */
  function folder(project, parent, tag, name, created) {
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (item instanceof FolderItem && item.parentFolder === parent && /** @type {any} */ (item).comment === tag) return item;
    }
    var made = project.items.addFolder(name);
    made.parentFolder = parent; made.comment = tag; created.push(made);
    return made;
  }
  /** @param {any} project @param {any} file @returns {any} */
  function existingFootage(project, file) {
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i), footage = /** @type {any} */ (item);
      if (item instanceof FootageItem && footage.file && footage.file.fsName === file.fsName && !footage.footageMissing && footage.hasAudio) return item;
    }
    return null;
  }

  /** @param {Record<string, any>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged; staged = null;
    if (!plan || plan.fingerprint !== MotionJson.stringify(args) || app.project !== plan.project || plan.project.activeItem !== plan.comp || !plan.file.exists) {
      throw new Error("A inserção do som precisa de um preflight atualizado.");
    }
    var project = plan.project, comp = plan.comp, time = comp.time, selected = comp.selectedLayers, folders = /** @type {any[]} */ ([]);
    var footage = null, imported = false, layer = null, i;
    try {
      footage = existingFootage(project, plan.file);
      if (!footage) {
        var home = folder(project, project.rootFolder, FOLDER_TAG, FOLDER[plan.locale], folders);
        footage = project.importFile(plan.options); imported = true;
        footage.parentFolder = folder(project, home, SOUND_TAG, SOUND_FOLDER[plan.locale], folders);
      }
      if (!(footage instanceof FootageItem) || !/** @type {any} */ (footage).hasAudio) throw new Error("O som importado não tem áudio.");
      layer = comp.layers.add(footage);
      layer.name = "Moti.on · " + plan.sound.name[plan.locale];
      layer.comment = MARK + MotionJson.stringify({ schemaVersion: 1, soundId: plan.sound.id, reverse: args.reverse === true });
      if (args.reverse === true) {
        // Stretch -100% plays backwards; the layer then ends where it started,
        // so its in-point is moved back onto the current time.
        layer.stretch = -100;
        layer.startTime = time + /** @type {any} */ (footage).duration;
      } else {
        layer.startTime = time;
      }
      if (typeof args.gainDb === "number" && args.gainDb !== 0) {
        var levels = layer.property("ADBE Audio Group").property("ADBE Audio Levels");
        levels.setValue([args.gainDb, args.gainDb]);
      }
      for (i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
      layer.selected = true;
      comp.time = time;
    } catch (error) {
      var restored = true;
      try { if (layer) layer.remove(); } catch (layerError) { restored = false; }
      try { if (imported && footage && footage.usedIn.length === 0) footage.remove(); } catch (footageError) { restored = false; }
      for (i = folders.length - 1; i >= 0; i--) try { if (folders[i].numItems === 0) folders[i].remove(); } catch (folderError) { restored = false; }
      try { comp.time = time; for (i = 0; i < selected.length; i++) selected[i].selected = true; } catch (selectionError) { restored = false; }
      if (!restored) {
        var rollbackError = /** @type {Error & {cause?: unknown, motionCode?: string}} */ (new Error("O som falhou e não foi possível desfazer tudo; use Desfazer."));
        rollbackError.cause = error; rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      throw error;
    }
    return { changed: true, warnings: [], data: { soundId: plan.sound.id, layerIndex: layer.index, importedSound: imported, reverse: args.reverse === true } };
  }

  MotionRegistry.register("ae.sound.insert", { preflight: preflight, run: run });
}());
