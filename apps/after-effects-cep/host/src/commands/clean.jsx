/* global FootageItem */
(function () {
  var ALLOWED = { removeConfirmed: true, selectedItemIds: true, scanToken: true };
  var scanSerial = 0;
  var lastScan = /** @type {any} */ (null);
  var stagedRemoval = /** @type {any} */ (null);

  /** @param {string} code @param {string} message @returns {MotionCommandFailure} */
  function failure(code, message) {
    return { code: code, message: message, recoverable: true, details: null };
  }
  /** @param {any} item @returns {boolean} */
  function isManaged(item) {
    var comment = typeof item.comment === "string" ? item.comment : "";
    var start = comment.indexOf(MotionContracts.META_OPEN);
    var end = comment.indexOf(MotionContracts.META_CLOSE, start + MotionContracts.META_OPEN.length);
    if (start < 0 || end <= start) return false;
    try {
      var meta = /** @type {any} */ (MotionJson.parse(comment.substring(start + MotionContracts.META_OPEN.length, end)));
      return !!meta && meta.schemaVersion === 1 && typeof meta.rigId === "string" && meta.rigId.length > 0 &&
        typeof meta.rigType === "string" && meta.rigType.length > 0;
    } catch (error) { return false; }
  }
  /** @param {any} item @returns {boolean} */
  function isUnusedFootage(item) {
    return item instanceof FootageItem && item.usedIn && item.usedIn.length === 0;
  }
  /** @param {any} item @returns {number|null} */
  function itemId(item) {
    return typeof item.id === "number" && isFinite(item.id) && item.id > 0 && Math.floor(item.id) === item.id ? item.id : null;
  }
  /** @param {any} project @returns {any[]} */
  function collect(project) {
    var found = [];
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (isUnusedFootage(item)) found.push(item);
    }
    return found;
  }
  /** @param {any} project @param {number} id @returns {any} */
  function findById(project, id) {
    for (var i = 1; i <= project.numItems; i++) {
      var item = project.item(i);
      if (itemId(item) === id) return item;
    }
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function preflight(args) {
    stagedRemoval = null;
    for (var key in args) {
      if (Object.prototype.hasOwnProperty.call(args, key) && !Object.prototype.hasOwnProperty.call(ALLOWED, key)) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento desconhecido para Clean.");
      }
    }
    if (typeof args.removeConfirmed !== "boolean") return failure(MotionContracts.ERROR.INVALID_PRESET, "removeConfirmed precisa ser booleano.");
    if (typeof app === "undefined" || !app.project) return failure(MotionContracts.ERROR.NO_ACTIVE_PROJECT, "Nenhum projeto aberto.");
    if (args.removeConfirmed === false) {
      if (typeof args.selectedItemIds !== "undefined" || typeof args.scanToken !== "undefined") {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "A varredura nao aceita selecao nem token de remocao.");
      }
      return null;
    }
    if (!args.selectedItemIds || !(args.selectedItemIds instanceof Array) || args.selectedItemIds.length === 0 || args.selectedItemIds.length > 100) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Escolha explicitamente os itens gerenciados na previa antes de remover.");
    }
    if (typeof args.scanToken !== "string" || !lastScan || args.scanToken !== lastScan.token || app.project !== lastScan.project) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "A previa do Clean expirou. Faca uma nova varredura.");
    }
    var chosen = [], seen = /** @type {any} */ ({}), id, item;
    for (var i = 0; i < args.selectedItemIds.length; i++) {
      id = args.selectedItemIds[i];
      if (typeof id !== "number" || !isFinite(id) || id <= 0 || Math.floor(id) !== id || seen[id]) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "A selecao de itens da previa e invalida.");
      }
      seen[id] = true;
      item = findById(app.project, id);
      if (!item || !isUnusedFootage(item) || !isManaged(item) || lastScan.items[id] !== item) {
        return failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Um item mudou, esta em uso ou nao pertence a suite. Faca nova varredura.");
      }
      chosen.push(item);
    }
    stagedRemoval = { project: app.project, token: args.scanToken, items: chosen };
    return null;
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandResult} */
  function run(args) {
    var project = app.project;
    if (args.removeConfirmed === false) {
      var found = collect(project), findings = [], managed = /** @type {any} */ ({}), removableCount = 0;
      for (var i = 0; i < found.length; i++) {
        var item = found[i], id = itemId(item), managedItem = isManaged(item);
        if (managedItem && id !== null) { managed[id] = item; removableCount++; }
        findings.push({ id: id, name: String(item.name || ""), origin: managedItem ? "managed" : "external", risk: managedItem ? "low" : "high" });
      }
      scanSerial++;
      var token = "clean-" + new Date().getTime() + "-" + scanSerial;
      lastScan = { project: project, token: token, items: managed };
      return { changed: false, warnings: [], data: { scanned: true, unusedCount: found.length, removableCount: removableCount, findings: findings, scanToken: token } };
    }
    var plan = stagedRemoval;
    stagedRemoval = null;
    if (!plan || !lastScan || project !== plan.project || lastScan.token !== plan.token) throw new Error("A previa do Clean expirou.");
    var removed = [];
    try {
      for (var j = 0; j < plan.items.length; j++) {
        var target = plan.items[j], targetId = itemId(target);
        if (!target || targetId === null || findById(project, targetId) !== target || !isUnusedFootage(target) || !isManaged(target)) {
          throw new Error("Um item mudou durante a remocao. A operacao foi interrompida.");
        }
        target.remove();
        if (findById(project, targetId) === target) throw new Error("O item permaneceu no projeto apos remove().");
        removed.push(targetId);
      }
      lastScan = null;
      return { changed: removed.length > 0, warnings: [], data: { removedCount: removed.length, removedItemIds: removed } };
    } catch (error) {
      lastScan = null;
      throw MotionErrors.error(
        "hostError.removedPartially",
        "Clean falhou depois de remover " + removed.length + " item(ns): " + String(error),
        { count: removed.length },
        MotionContracts.ERROR.HOST_OPERATION_FAILED
      );
    }
  }
  MotionRegistry.register("ae.project.clean", { preflight: preflight, run: run });
})();
