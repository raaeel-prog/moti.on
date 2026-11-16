/**
 * Banco de midia (`ae.stock.import`, MASTER_BUILD_SPEC §18.10, ADR 0008).
 *
 * O painel ja baixou e verificou o arquivo (assinatura, tamanho, SHA-256) em
 * `Folder.userData/Moti.on/Banco de midia/<banco>/<id>.<ext>`. Aqui ele e
 * importado uma vez por projeto, na pasta "Moti.on Banco de mídia/<banco>", e
 * vira uma camada na composicao ativa, no tempo atual. O payload nao traz
 * caminho: o arquivo e derivado de banco + id + extensao, com as regras de
 * `stockImportError` no contrato.
 */
/* global ImportOptions, FolderItem, FootageItem, Folder */
(function () {
  var ALLOWED = { provider: true, assetId: true, extension: true, title: true, credit: true };
  var PROVIDERS = /** @type {any} */ ({ pexels: "Pexels", pixabay: "Pixabay", unsplash: "Unsplash", freesound: "Freesound" });
  var KINDS = /** @type {any} */ ({ jpg: "image", png: "image", mp4: "video", mov: "video", mp3: "audio", wav: "audio" });
  var LIBRARY_DIR = "Moti.on/Banco de midia";
  var FOLDER = /** @type {any} */ ({ "pt-BR": "Moti.on Banco de mídia", "en-US": "Moti.on Stock media" });
  var FOLDER_TAG = "[MOTION_STOCK_FOLDER]", PROVIDER_TAG = "[MOTION_STOCK_PROVIDER]", MARK = "[MOTION_STOCK_V1]";
  var staged = /** @type {any} */ (null);

  /** @param {string} code @param {string} message @param {unknown} [details] @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return { code: code, message: message, recoverable: true, details: typeof details === "undefined" ? null : details };
  }
  /** @param {string} field @param {string} message @returns {MotionCommandFailure} */
  function invalid(field, message) { return failure(MotionContracts.ERROR.INVALID_PRESET, message, { field: field }); }
  /** @param {unknown} value @param {number} max @returns {boolean} */
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused.
  function printable(value, max) { return typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
  /** @param {any} context @returns {string} */
  function localeOf(context) { return context && context.locale === "en-US" ? "en-US" : "pt-BR"; }

  /** Mesmas regras de `stockImportError` no contrato. @param {Record<string, any>} args @returns {MotionCommandFailure|null} */
  function validate(args) {
    for (var key in args) if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) return invalid(key, "Parâmetro de mídia desconhecido.");
    if (typeof args.provider !== "string" || !Object.prototype.hasOwnProperty.call(PROVIDERS, args.provider)) return invalid("provider", "Banco de mídia desconhecido.");
    if (typeof args.assetId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(args.assetId)) return invalid("assetId", "Identificador de mídia inválido.");
    if (typeof args.extension !== "string" || !Object.prototype.hasOwnProperty.call(KINDS, args.extension)) return invalid("extension", "Formato de mídia não suportado.");
    if (!printable(args.title, 120) || !String(args.title).replace(/\s+/g, "").length) return invalid("title", "Título de mídia inválido.");
    if (!printable(args.credit, 400)) return invalid("credit", "Crédito de mídia inválido.");
    return null;
  }
  /** @param {Record<string, any>} args @returns {any} */
  function stockFile(args) {
    var FolderApi = /** @type {any} */ (typeof Folder !== "undefined" ? Folder : null);
    if (!FolderApi || !FolderApi.userData) return null;
    return new File(FolderApi.userData.fsName + "/" + LIBRARY_DIR + "/" + args.provider + "/" + args.assetId + "." + args.extension);
  }

  /** @param {Record<string, any>} args @param {any} context @returns {MotionCommandFailure|null} */
  function preflight(args, context) {
    staged = null;
    var problem = validate(args);
    if (problem) return problem;
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    var project = /** @type {any} */ (app.project), comp = project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Abra uma composição para importar a mídia.");
    if (!isFinite(comp.time) || comp.time < 0 || comp.time >= comp.duration) return failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Posicione o indicador de tempo dentro da composição.");
    var file = stockFile(args);
    if (!file || !file.exists || !(file.length > 0)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O arquivo baixado não foi encontrado. Baixe a mídia de novo.", { assetId: args.assetId });
    var ImportAs = /** @type {any} */ ($.global).ImportAsType, options;
    try {
      options = /** @type {any} */ (new ImportOptions(file));
      if (!ImportAs || typeof options.canImportAs !== "function" || !options.canImportAs(ImportAs.FOOTAGE)) return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não reconheceu o formato deste arquivo.");
      options.importAs = ImportAs.FOOTAGE; options.sequence = false;
    } catch (probe) {
      return failure(MotionContracts.ERROR.CAPABILITY_UNAVAILABLE, "O After Effects não reconheceu o formato deste arquivo.");
    }
    staged = { project: project, comp: comp, file: file, options: options, locale: localeOf(context), kind: KINDS[args.extension], fingerprint: MotionJson.stringify(args) };
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
      if (item instanceof FootageItem && footage.file && footage.file.fsName === file.fsName && !footage.footageMissing) return item;
    }
    return null;
  }

  /** @param {Record<string, any>} args @returns {MotionCommandResult} */
  function run(args) {
    var plan = staged; staged = null;
    if (!plan || plan.fingerprint !== MotionJson.stringify(args) || app.project !== plan.project || plan.project.activeItem !== plan.comp || !plan.file.exists) {
      throw new Error("A importação da mídia precisa de um preflight atualizado.");
    }
    var project = plan.project, comp = plan.comp, time = comp.time, selected = comp.selectedLayers, folders = /** @type {any[]} */ ([]);
    var footage = null, imported = false, layer = null, i;
    try {
      footage = existingFootage(project, plan.file);
      if (!footage) {
        var home = folder(project, project.rootFolder, FOLDER_TAG, FOLDER[plan.locale], folders);
        footage = project.importFile(plan.options); imported = true;
        footage.parentFolder = folder(project, home, PROVIDER_TAG + args.provider, PROVIDERS[args.provider], folders);
        footage.comment = args.credit;
      }
      var media = /** @type {any} */ (footage);
      if (!(footage instanceof FootageItem) || (plan.kind === "audio" ? !media.hasAudio : !media.hasVideo)) throw new Error("O arquivo importado não contém a mídia esperada.");
      var still = media.mainSource && media.mainSource.isStill;
      layer = still ? comp.layers.add(footage, comp.duration - time) : comp.layers.add(footage);
      layer.startTime = time;
      layer.name = args.title;
      layer.comment = MARK + MotionJson.stringify({ schemaVersion: 1, provider: args.provider, assetId: args.assetId });
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
        var rollbackError = /** @type {Error & {cause?: unknown, motionCode?: string}} */ (new Error("A importação falhou e não foi possível desfazer tudo; use Desfazer."));
        rollbackError.cause = error; rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
        throw rollbackError;
      }
      throw error;
    }
    return { changed: true, warnings: [], data: { provider: args.provider, assetId: args.assetId, layerIndex: layer.index, imported: imported, kind: plan.kind } };
  }

  MotionRegistry.register("ae.stock.import", { preflight: preflight, run: run });
}());
