/**
 * Writer, reader e updater de Live Controls para After Effects (CHMS-UX-006).
 *
 * Este modulo materializa apenas Expression Controls nativos. Ele nao abre Undo
 * Group: o dispatcher continua sendo o unico dono da transacao. O chamador
 * persiste `records` e `userOverrides` em `RigMetadata.userOverrides`, de modo
 * que este arquivo nao precisa conhecer o formato fisico do comentario da layer.
 *
 * Identidade e resolucao seguem o contrato do Addendum A2:
 *
 *  1. nome customizado + matchName;
 *  2. indice gravado + matchName como fallback;
 *  3. nunca usar o nome localizado da propriedade interna — sempre `(1)`.
 *
 * Adicionar um efeito invalida handles anteriores de grupos indexados no AE.
 * Nenhum handle de efeito sobrevive a uma chamada de `addProperty` neste modulo.
 */
(function (global) {
  var PREFIX = "CHMS";
  var SEPARATOR = " · ";
  var LAYER_LIMIT = 12;
  var CONTROLLER_LIMIT = 24;

  /** @type {Record<string, string>} */
  var MATCH_NAMES = {
    slider: "ADBE Slider Control",
    angle: "ADBE Angle Control",
    color: "ADBE Color Control",
    checkbox: "ADBE Checkbox Control",
    point: "ADBE Point Control",
    dropdown: "ADBE Dropdown Control"
  };

  /** @type {Record<string, boolean>} */
  var VALID_TARGETS = {
    layer: true,
    controller: true,
    "comp-controller": true,
    "camera-controller": true
  };

  /** @type {Record<string, boolean>} */
  var VALID_UNITS = {
    px: true,
    "%": true,
    "°": true,
    fps: true,
    frames: true,
    s: true,
    x: true,
    none: true
  };

  /** @param {any} object @param {string} key @returns {boolean} */
  function owns(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /** @param {any} value @returns {boolean} */
  function isArray(value) {
    return value instanceof Array;
  }

  /** @param {any} value @returns {boolean} */
  function finiteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  /** @param {any} value @returns {string} */
  function cleanRequiredText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/^\s+|\s+$/g, "");
  }

  /** @param {string} message @param {string} code @param {any} details @returns {Error} */
  function codedError(message, code, details) {
    var error = /** @type {Error & {code?: string, details?: unknown}} */ (new Error(message));
    error.code = code;
    error.details = details;
    return error;
  }

  /** @param {string} message @returns {never} */
  function invalid(message) {
    throw codedError(message, "INVALID_LIVE_CONTROLS", null);
  }

  /** @param {any} value @returns {any} */
  function cloneValue(value) {
    /** @type {any} */
    var copy;
    var i;
    var key;
    if (isArray(value)) {
      copy = [];
      for (i = 0; i < value.length; i += 1) copy.push(cloneValue(value[i]));
      return copy;
    }
    if (value && typeof value === "object") {
      copy = {};
      for (key in value) {
        if (owns(value, key)) {
          copy[key] = cloneValue(value[key]);
        }
      }
      return copy;
    }
    return value;
  }

  /** @param {any} record @returns {any} */
  function copyRecord(record) {
    return cloneValue(record);
  }

  /** @param {any} left @param {any} right @returns {boolean} */
  function valuesEqual(left, right) {
    var i;
    if (isArray(left) || isArray(right)) {
      if (!isArray(left) || !isArray(right) || left.length !== right.length) return false;
      for (i = 0; i < left.length; i += 1) {
        if (!valuesEqual(left[i], right[i])) return false;
      }
      return true;
    }
    return left === right;
  }

  /** @param {any} value @returns {string} */
  function fingerprintValue(value) {
    var out;
    var i;
    if (isArray(value)) {
      out = "[";
      for (i = 0; i < value.length; i += 1) {
        if (i > 0) out += ",";
        out += fingerprintValue(value[i]);
      }
      return out + "]";
    }
    if (typeof value === "string") return "s:" + value.length + ":" + value;
    if (typeof value === "number") return "n:" + String(value);
    if (typeof value === "boolean") return value ? "b:1" : "b:0";
    if (value === null) return "null";
    return "u";
  }

  /** @param {string} source @returns {string} */
  function shortHash(source) {
    var hash = 2166136261;
    var i;
    for (i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  /** @param {any[]} entries @returns {string} */
  function fingerprint(entries) {
    var source = "";
    var i;
    for (i = 0; i < entries.length; i += 1) {
      source += String(entries[i].paramId) + "=" + fingerprintValue(entries[i].value) + ";";
      source += String(entries[i].resolution) + ";" + String(entries[i].actualName || "") + "|";
    }
    return "lc1:" + shortHash(source);
  }

  /** @param {unknown} layer @returns {PropertyGroup} */
  function requireParade(layer) {
    var parade = MotionEffects.parade(layer);
    if (!parade) invalid("A layer alvo não expõe o grupo ADBE Effect Parade.");
    return /** @type {PropertyGroup} */ (parade);
  }

  /** @param {string} text @param {string} field */
  function validateDisplayText(text, field) {
    var i;
    var code;
    if (text.length === 0 || text.length > 160) invalid(field + " precisa ter entre 1 e 160 caracteres.");
    for (i = 0; i < text.length; i += 1) {
      code = text.charCodeAt(i);
      if (code < 32 || code === 127) invalid(field + " contém caractere de controle.");
    }
  }

  /** @param {any} raw @param {string} control @returns {any} */
  function normalizeHostValue(raw, control) {
    var i;
    var normalized;
    if (control === "slider" || control === "angle") {
      if (!finiteNumber(raw)) invalid("Controle numérico exige valor finito.");
      return raw;
    }
    if (control === "checkbox") {
      if (raw === true || raw === 1) return 1;
      if (raw === false || raw === 0) return 0;
      invalid("Checkbox aceita apenas boolean, 0 ou 1.");
    }
    if (control === "point") {
      if (!isArray(raw) || raw.length !== 2) invalid("Controle de ponto exige [x, y].");
      normalized = [];
      for (i = 0; i < 2; i += 1) {
        if (!finiteNumber(raw[i])) invalid("Coordenadas do ponto precisam ser finitas.");
        normalized.push(raw[i]);
      }
      return normalized;
    }
    if (control === "color") {
      if (!isArray(raw) || raw.length !== 4) invalid("Controle de cor exige [r, g, b, a].");
      normalized = [];
      for (i = 0; i < 4; i += 1) {
        if (!finiteNumber(raw[i]) || raw[i] < 0 || raw[i] > 1) {
          invalid("Canais de cor precisam estar entre 0 e 1.");
        }
        normalized.push(raw[i]);
      }
      return normalized;
    }
    if (control === "dropdown") {
      if (!finiteNumber(raw)) invalid("Dropdown exige valor numérico finito.");
      return raw;
    }
    invalid("Tipo de Live Control desconhecido: " + String(control) + ".");
  }

  /**
   * @param {any} binding
   * @param {string} locale
   * @returns {{labels: string[], values: number[], selectedIndex: number}}
   */
  function validateDropdown(binding, locale) {
    var options = binding.options;
    var labels = [];
    var values = [];
    /** @type {Record<string, boolean>} */
    var seenLabels = {};
    /** @type {Record<string, boolean>} */
    var seenValues = {};
    var i;
    if (!isArray(options) || options.length === 0 || options.length > 100) {
      invalid("Uma opção dropdown precisa conter entre 1 e 100 itens.");
    }
    for (i = 0; i < options.length; i += 1) {
      var option = options[i];
      if (!option || typeof option !== "object" || !finiteNumber(option.value)) {
        invalid("Cada opção dropdown precisa de value numérico.");
      }
      var optionLabels = option.label;
      var label = optionLabels && typeof optionLabels === "object" ? cleanRequiredText(optionLabels[locale]) : "";
      if (!label && optionLabels && typeof optionLabels === "object") label = cleanRequiredText(optionLabels["en-US"]);
      validateDisplayText(label, "O rótulo da opção dropdown");
      if (label.indexOf("|") >= 0) invalid("O rótulo de uma opção dropdown não pode conter '|'.");
      var labelKey = "$" + label;
      var valueKey = "$" + String(option.value);
      if (owns(seenLabels, labelKey)) invalid("O rótulo de cada opção dropdown precisa ser único.");
      if (owns(seenValues, valueKey)) invalid("O value de cada opção dropdown precisa ser único.");
      seenLabels[labelKey] = true;
      seenValues[valueKey] = true;
      labels.push(label);
      values.push(option.value);
    }
    return { labels: labels, values: values, selectedIndex: 0 };
  }

  /** @param {string} unit @returns {string} */
  function unitSuffix(unit) {
    return unit && unit !== "none" ? " (" + unit + ")" : "";
  }

  /** @param {string} rigId @returns {string} */
  function shortRigId(rigId) {
    var compact = rigId.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    return compact.length >= 4 ? compact.substring(0, 4) : (compact + "rig0").substring(0, 4);
  }

  /**
   * Valida toda a entrada sem mutar o projeto.
   *
   * @param {any} config
   * @returns {{rigId: string, tool: string, locale: string, targetKind: string, items: any[]}}
   */
  function prepare(config) {
    var bindings;
    var values;
    var rigId;
    var tool;
    var locale;
    var targetKind;
    /** @type {Record<string, boolean>} */
    var seenIds = {};
    /** @type {Record<string, boolean>} */
    var seenOrders = {};
    /** @type {any[]} */
    var items = [];
    var i;
    if (!config || typeof config !== "object") invalid("Configuração de Live Controls ausente.");
    bindings = config.bindings;
    values = config.values;
    rigId = cleanRequiredText(config.rigId);
    tool = cleanRequiredText(config.tool);
    locale = cleanRequiredText(config.locale) || "en-US";
    targetKind = cleanRequiredText(config.targetKind) || "layer";
    validateDisplayText(rigId, "rigId");
    validateDisplayText(tool, "Nome da ferramenta");
    if (!VALID_TARGETS[targetKind]) invalid("Destino de Live Controls inválido.");
    if (!isArray(bindings) || bindings.length === 0) invalid("bindings precisa conter pelo menos um controle.");
    if (!values || typeof values !== "object" || isArray(values)) invalid("values precisa ser um objeto.");

    for (i = 0; i < bindings.length; i += 1) {
      var binding = bindings[i];
      if (!binding || typeof binding !== "object") invalid("Binding inválido na posição " + i + ".");
      var paramId = cleanRequiredText(binding.paramId);
      var control = cleanRequiredText(binding.control);
      var order = binding.order;
      var target = cleanRequiredText(binding.target);
      if (
        !paramId ||
        paramId.length > 96 ||
        !/^[A-Za-z0-9._-]+$/.test(paramId) ||
        paramId === "__proto__" ||
        paramId === "prototype" ||
        paramId === "constructor"
      ) {
        invalid("paramId inválido.");
      }
      var paramKey = "$" + paramId;
      if (owns(seenIds, paramKey)) invalid("paramId duplicado: " + paramId + ".");
      if (!owns(MATCH_NAMES, control)) invalid("Tipo de controle desconhecido: " + control + ".");
      if (target !== "layer" && target !== "controller" && target !== "comp-controller") {
        invalid("Target inválido para " + paramId + ".");
      }
      if (!finiteNumber(order) || Math.floor(order) !== order || order < 0) invalid("order precisa ser inteiro não negativo.");
      var orderKey = "$" + String(order);
      if (owns(seenOrders, orderKey)) invalid("A ordem visual dos controles precisa ser única.");
      if (!owns(values, paramId)) invalid("Valor ausente para " + paramId + ".");

      var labels = binding.label;
      var label = labels && typeof labels === "object" ? cleanRequiredText(labels[locale]) : "";
      if (!label && labels && typeof labels === "object") label = cleanRequiredText(labels["en-US"]);
      validateDisplayText(label, "Rótulo de " + paramId);

      var unit = typeof binding.unit === "string" ? binding.unit : "none";
      if (!VALID_UNITS[unit]) invalid("Unidade inválida para " + paramId + ".");
      if (typeof binding.min !== "undefined" && !finiteNumber(binding.min)) invalid("min precisa ser finito.");
      if (typeof binding.max !== "undefined" && !finiteNumber(binding.max)) invalid("max precisa ser finito.");
      if (finiteNumber(binding.min) && finiteNumber(binding.max) && binding.min > binding.max) {
        invalid("min não pode ser maior que max.");
      }

      var logicalValue = cloneValue(values[paramId]);
      var hostValue = normalizeHostValue(logicalValue, control);
      var dropdown = null;
      if (control === "dropdown") {
        dropdown = validateDropdown(binding, locale);
        var selected = -1;
        var optionIndex;
        for (optionIndex = 0; optionIndex < dropdown.values.length; optionIndex += 1) {
          if (dropdown.values[optionIndex] === logicalValue) selected = optionIndex + 1;
        }
        if (selected < 1) invalid("O valor de dropdown não corresponde a nenhuma opção.");
        dropdown.selectedIndex = selected;
        hostValue = selected;
      }

      seenIds[paramKey] = true;
      seenOrders[orderKey] = true;
      items.push({
        binding: binding,
        paramId: paramId,
        control: control,
        order: order,
        target: target,
        label: label,
        unit: unit,
        logicalValue: logicalValue,
        hostValue: hostValue,
        dropdown: dropdown,
        baseName: PREFIX + SEPARATOR + tool + SEPARATOR + label + unitSuffix(unit)
      });
    }

    items.sort(function (left, right) {
      return /** @type {number} */ (left.order) - /** @type {number} */ (right.order);
    });
    return { rigId: rigId, tool: tool, locale: locale, targetKind: targetKind, items: items };
  }

  /** @param {string} matchName @returns {boolean} */
  function isLiveMatchName(matchName) {
    var key;
    for (key in MATCH_NAMES) {
      if (owns(MATCH_NAMES, key) && MATCH_NAMES[key] === matchName) return true;
    }
    return false;
  }

  /** @param {PropertyGroup} parade @returns {number} */
  function countLiveControls(parade) {
    var count = 0;
    var i;
    for (i = 1; i <= parade.numProperties; i += 1) {
      var effect = parade.property(i);
      if (effect && isLiveMatchName(effect.matchName)) count += 1;
    }
    return count;
  }

  /** @param {string} targetKind @returns {number} */
  function capacityFor(targetKind) {
    return targetKind === "layer" ? LAYER_LIMIT : CONTROLLER_LIMIT;
  }

  /** @param {PropertyGroup} parade @param {number} requested @param {string} targetKind */
  function assertCapacity(parade, requested, targetKind) {
    var total = countLiveControls(parade) + requested;
    var capacity = capacityFor(targetKind);
    var suggested;
    if (total <= capacity) return;
    suggested = targetKind === "layer" ? "controller" : "comp-controller";
    var error = /** @type {Error & {suggestedTarget?: string}} */ (
      codedError("Live Controls excedem a capacidade segura do destino.", "CONTROLS_OVERFLOW", {
        total: total,
        capacity: capacity,
        targetKind: targetKind
      })
    );
    error.suggestedTarget = suggested;
    throw error;
  }

  /** @param {PropertyGroup} parade @param {string} name @returns {boolean} */
  function nameExists(parade, name) {
    var i;
    for (i = 1; i <= parade.numProperties; i += 1) {
      var effect = parade.property(i);
      if (effect && effect.name === name) return true;
    }
    return false;
  }

  /** @param {PropertyGroup} parade @param {string} baseName @param {string} rigId @returns {string} */
  function uniqueName(parade, baseName, rigId) {
    var suffix;
    var candidate;
    var serial;
    if (!nameExists(parade, baseName)) return baseName;
    suffix = " #" + shortRigId(rigId);
    candidate = baseName + suffix;
    serial = 2;
    while (nameExists(parade, candidate)) {
      candidate = baseName + suffix + "-" + serial;
      serial += 1;
    }
    return candidate;
  }

  /** @param {PropertyGroup} parade @param {string} matchName @returns {PropertyGroup} */
  function addAndResolve(parade, matchName) {
    parade.addProperty(matchName);
    var effect = parade.property(parade.numProperties);
    if (!effect || effect.matchName !== matchName) throw new Error("After Effects não devolveu o controle recém-criado.");
    return /** @type {PropertyGroup} */ (effect);
  }

  /** @param {{labels: string[]}} dropdown @returns {string} */
  function dropdownDocumentation(dropdown) {
    var text = " (";
    var i;
    for (i = 0; i < dropdown.labels.length; i += 1) {
      if (i > 0) text += SEPARATOR;
      text += String(i + 1) + " " + dropdown.labels[i];
    }
    return text + ")";
  }

  /** @param {any[]} warnings @param {string} reason @param {string} paramId */
  function warnDropdownFallback(warnings, reason, paramId) {
    warnings.push({
      code: "DROPDOWN_FALLBACK",
      message: "Dropdown indisponível; foi criado um slider inteiro equivalente.",
      details: { paramId: paramId, reason: reason }
    });
  }

  /**
   * @param {PropertyGroup} parade
   * @param {any} item
   * @param {{rigId: string, locale: string}} prepared
   * @param {any[]} warnings
   * @returns {any}
   */
  function createOne(parade, item, prepared, warnings) {
    var requestedControl = /** @type {string} */ (item.control);
    var actualControl = requestedControl;
    var matchName = /** @type {string} */ (MATCH_NAMES[requestedControl]);
    var dropdown = item.dropdown;
    var fallback = null;
    var nameBase = /** @type {string} */ (item.baseName);
    var effect;
    var property;
    var returnedProperty;
    var reason;

    if (
      requestedControl === "dropdown" &&
      !parade.canAddProperty(/** @type {string} */ (MATCH_NAMES.dropdown))
    ) {
      actualControl = "slider";
      matchName = /** @type {string} */ (MATCH_NAMES.slider);
      fallback = "dropdown-as-slider";
      nameBase += dropdownDocumentation(dropdown);
      warnDropdownFallback(warnings, "matchName-unavailable", /** @type {string} */ (item.paramId));
    }
    if (!parade.canAddProperty(matchName)) throw new Error("O host não pode criar " + matchName + ".");

    var name = uniqueName(parade, nameBase, prepared.rigId);
    effect = addAndResolve(parade, matchName);
    effect.name = name;
    property = /** @type {Property} */ (effect.property(1));
    if (!property) throw new Error("O Live Control não expõe a propriedade interna (1).");

    if (requestedControl === "dropdown" && actualControl === "dropdown") {
      reason = "";
      try {
        if (property.isDropdownEffect !== true || typeof property.setPropertyParameters !== "function") {
          reason = "property-capability-unavailable";
        } else {
          returnedProperty = property.setPropertyParameters(dropdown.labels);
          if (returnedProperty) property = returnedProperty;
        }
      } catch (dropdownError) {
        reason = "setPropertyParameters-failed";
      }
      if (reason) {
        effect.remove();
        actualControl = "slider";
        matchName = /** @type {string} */ (MATCH_NAMES.slider);
        fallback = "dropdown-as-slider";
        nameBase = /** @type {string} */ (item.baseName) + dropdownDocumentation(dropdown);
        name = uniqueName(parade, nameBase, prepared.rigId);
        if (!parade.canAddProperty(matchName)) throw new Error("O host não oferece dropdown nem slider de fallback.");
        effect = addAndResolve(parade, matchName);
        effect.name = name;
        property = /** @type {Property} */ (effect.property(1));
        if (!property) throw new Error("O slider de fallback não expõe a propriedade interna (1).");
        warnDropdownFallback(warnings, reason, /** @type {string} */ (item.paramId));
      }
    }

    var valueToWrite = fallback ? item.logicalValue : item.hostValue;
    property.setValue(cloneValue(valueToWrite));

    /** @type {any} */
    var record = {
      schemaVersion: 1,
      paramId: item.paramId,
      name: name,
      matchName: matchName,
      index: effect.propertyIndex,
      control: requestedControl,
      actualControl: actualControl,
      target: item.target,
      order: item.order,
      locale: prepared.locale,
      lastAppliedValue: cloneValue(item.logicalValue)
    };
    if (item.unit !== "none") record.unit = item.unit;
    if (finiteNumber(item.binding.min)) record.min = item.binding.min;
    if (finiteNumber(item.binding.max)) record.max = item.binding.max;
    if (dropdown) record.optionValues = cloneValue(dropdown.values);
    if (fallback) record.fallback = fallback;
    return record;
  }

  /**
   * @param {PropertyGroup} parade
   * @param {any} record
   * @returns {{effect: PropertyGroup|null, resolution: string, actualName: string|null, index: number|null}}
   */
  function resolveEffect(parade, record) {
    var name = typeof record.name === "string" ? record.name : "";
    var matchName = typeof record.matchName === "string" ? record.matchName : "";
    var i;
    for (i = 1; i <= parade.numProperties; i += 1) {
      var named = parade.property(i);
      if (named && named.name === name && named.matchName === matchName) {
        return { effect: named, resolution: "name", actualName: named.name, index: i };
      }
    }
    var storedIndex = record.index;
    if (finiteNumber(storedIndex) && storedIndex >= 1 && Math.floor(storedIndex) === storedIndex) {
      var indexed = parade.property(storedIndex);
      if (indexed && indexed.matchName === matchName) {
        return { effect: indexed, resolution: "index", actualName: indexed.name, index: storedIndex };
      }
    }
    return { effect: null, resolution: "missing", actualName: null, index: null };
  }

  /** @param {any} record @param {any} hostValue @returns {any} */
  function logicalFromHost(record, hostValue) {
    if (record.control === "checkbox") return hostValue === 1;
    if (record.control === "dropdown" && record.actualControl === "dropdown" && isArray(record.optionValues)) {
      var index = typeof hostValue === "number" ? Math.floor(hostValue) : 0;
      if (index >= 1 && index <= record.optionValues.length) return cloneValue(record.optionValues[index - 1]);
    }
    return cloneValue(hostValue);
  }

  /** @param {any} record @param {any} logicalValue @returns {any} */
  function hostFromLogical(record, logicalValue) {
    if (record.control === "checkbox") return logicalValue === true || logicalValue === 1 ? 1 : 0;
    if (record.control === "dropdown" && record.actualControl === "dropdown" && isArray(record.optionValues)) {
      var i;
      for (i = 0; i < record.optionValues.length; i += 1) {
        if (record.optionValues[i] === logicalValue) return i + 1;
      }
      invalid("Valor lógico não existe nas opções de " + String(record.paramId) + ".");
    }
    return cloneValue(logicalValue);
  }

  /** @param {PropertyGroup} parade @param {any[]} created @returns {boolean} */
  function removeCreated(parade, created) {
    var ok = true;
    var i;
    for (i = created.length - 1; i >= 0; i -= 1) {
      try {
        var resolved = resolveEffect(parade, created[i]);
        if (!resolved.effect) ok = false;
        else resolved.effect.remove();
      } catch (removeError) {
        ok = false;
      }
    }
    return ok;
  }

  /**
   * Remove tudo que esta chamada anexou depois do tamanho inicial. Diferente de
   * `removeCreated`, cobre a janela em que o efeito já existe no host mas seu
   * registro ainda não pôde ser montado porque `setValue` falhou.
   *
   * @param {PropertyGroup} parade
   * @param {number} initialCount
   * @returns {boolean}
   */
  function removeSince(parade, initialCount) {
    var ok = true;
    var i;
    for (i = parade.numProperties; i > initialCount; i -= 1) {
      try {
        var effect = parade.property(i);
        if (!effect) ok = false;
        else effect.remove();
      } catch (removeError) {
        ok = false;
      }
    }
    return ok;
  }

  /** @param {PropertyGroup} parade @param {any[]} records */
  function refreshCreatedIndices(parade, records) {
    var i;
    for (i = 0; i < records.length; i += 1) {
      var resolved = resolveEffect(parade, records[i]);
      if (resolved.effect && resolved.index !== null) records[i].index = resolved.index;
    }
  }

  /**
   * Cria um conjunto completo. Todos os dados validaveis e a capacidade sao
   * checados antes da primeira mutacao; falha de host remove apenas o que esta
   * chamada criou.
   *
   * @param {unknown} layer
   * @param {any} config
   * @returns {{records: any[], warnings: any[]}}
   */
  function create(layer, config) {
    var prepared = prepare(config);
    var parade = requireParade(layer);
    var initialCount = parade.numProperties;
    /** @type {any[]} */
    var records = [];
    /** @type {any[]} */
    var warnings = [];
    var i;
    assertCapacity(parade, prepared.items.length, prepared.targetKind);
    try {
      for (i = 0; i < prepared.items.length; i += 1) {
        records.push(createOne(parade, prepared.items[i], prepared, warnings));
      }
      refreshCreatedIndices(parade, records);
      return { records: records, warnings: warnings };
    } catch (writeError) {
      if (!removeSince(parade, initialCount)) {
        var rollbackError = /** @type {Error & {motionCode?: string, cause?: unknown}} */ (
          new Error("Live Controls falharam e o rollback não pôde remover tudo que foi criado.")
        );
        rollbackError.motionCode = "ROLLBACK_FAILED";
        rollbackError.cause = writeError;
        throw rollbackError;
      }
      throw writeError;
    }
  }

  /** @param {unknown} layer @param {any[]} records */
  function read(layer, records) {
    var parade = requireParade(layer);
    /** @type {Record<string, any>} */
    var values = {};
    /** @type {any[]} */
    var refreshed = [];
    /** @type {any[]} */
    var entries = [];
    /** @type {any[]} */
    var warnings = [];
    /** @type {string[]} */
    var missing = [];
    /** @type {string[]} */
    var renamed = [];
    var i;
    if (!isArray(records)) invalid("records precisa ser um array.");
    for (i = 0; i < records.length; i += 1) {
      var record = records[i];
      if (!record || typeof record !== "object") invalid("Registro de Live Control inválido.");
      var paramId = cleanRequiredText(record.paramId);
      if (!paramId) invalid("Registro sem paramId.");
      var resolved = resolveEffect(parade, record);
      var nextRecord = copyRecord(record);
      /** @type {any} */
      var entry = {
        paramId: paramId,
        resolution: resolved.resolution,
        actualName: resolved.actualName,
        index: resolved.index,
        requiresRelink: false,
        value: null
      };
      if (!resolved.effect) {
        missing.push(paramId);
      } else {
        var property = /** @type {Property} */ (resolved.effect.property(1));
        if (!property) {
          entry.resolution = "missing";
          entry.actualName = null;
          entry.index = null;
          missing.push(paramId);
        } else {
          var logicalValue = logicalFromHost(record, property.value);
          values[paramId] = logicalValue;
          entry.value = cloneValue(logicalValue);
          if (resolved.resolution === "name") nextRecord.index = resolved.index;
          if (resolved.resolution === "index" && resolved.actualName !== record.name) {
            entry.requiresRelink = true;
            renamed.push(paramId);
          }
        }
      }
      refreshed.push(nextRecord);
      entries.push(entry);
    }
    if (missing.length > 0) {
      warnings.push({
        code: "CONTROLS_MISSING",
        message: "Um ou mais Live Controls não foram encontrados.",
        action: "relink",
        details: { paramIds: missing }
      });
    }
    if (renamed.length > 0) {
      warnings.push({
        code: "CONTROLS_RENAMED",
        message: "Controles renomeados precisam ser religados para atualizar as expressões.",
        action: "relink",
        details: { paramIds: renamed }
      });
    }
    return {
      values: values,
      records: refreshed,
      entries: entries,
      warnings: warnings,
      fingerprint: fingerprint(entries)
    };
  }

  /** @param {any[]} records @param {string} paramId @returns {any} */
  function recordByParamId(records, paramId) {
    var i;
    for (i = 0; i < records.length; i += 1) {
      if (records[i] && records[i].paramId === paramId) return records[i];
    }
    return null;
  }

  /**
   * Atualiza sobreviventes, preserva valores/keyframes alterados no host e cria
   * somente os controles ausentes. `overwriteUserOverrides` e consentimento
   * explicito; nem ele apaga animacao — keyframes sempre vencem.
   *
   * @param {unknown} layer
   * @param {any} config
   * @param {any[]} records
   * @param {{overwriteUserOverrides?: boolean}} [options]
   */
  function update(layer, config, records, options) {
    var prepared = prepare(config);
    var parade = requireParade(layer);
    var overwrite = !!(options && options.overwriteUserOverrides === true);
    /** @type {Record<string, any>} */
    var existingByParam = {};
    /** @type {any[]} */
    var missingItems = [];
    /** @type {any[]} */
    var plans = [];
    /** @type {Record<string, any>} */
    var resultByParam = {};
    /** @type {Record<string, any>} */
    var userOverrides = {};
    /** @type {any[]} */
    var warnings = [];
    /** @type {any[]} */
    var createdRecords = [];
    /** @type {any[]} */
    var written = [];
    /** @type {any[]} */
    var orphanedRecords = [];
    /** @type {string[]} */
    var orphanedParamIds = [];
    var i;
    if (!isArray(records)) invalid("records precisa ser um array.");

    for (i = 0; i < records.length; i += 1) {
      var sourceRecord = records[i];
      if (!sourceRecord || typeof sourceRecord !== "object") invalid("Registro inválido no updater.");
      var sourceId = cleanRequiredText(sourceRecord.paramId);
      var sourceKey = "$" + sourceId;
      if (!sourceId || owns(existingByParam, sourceKey)) invalid("Metadata contém paramId ausente ou duplicado.");
      existingByParam[sourceKey] = sourceRecord;
      var stillBound = false;
      var boundIndex;
      for (boundIndex = 0; boundIndex < prepared.items.length; boundIndex += 1) {
        if (prepared.items[boundIndex].paramId === sourceId) stillBound = true;
      }
      if (!stillBound) {
        orphanedRecords.push(copyRecord(sourceRecord));
        orphanedParamIds.push(sourceId);
      }
    }

    if (orphanedRecords.length > 0) {
      warnings.push({
        code: "CONTROLS_ORPHANED",
        message: "Controles fora do binding atual foram preservados para Religar ou Limpar.",
        action: "relink-or-clean",
        details: { paramIds: orphanedParamIds }
      });
    }

    for (i = 0; i < prepared.items.length; i += 1) {
      var item = prepared.items[i];
      var record = recordByParamId(records, /** @type {string} */ (item.paramId));
      if (!record) {
        missingItems.push(item);
        continue;
      }
      var resolved = resolveEffect(parade, record);
      if (!resolved.effect) {
        missingItems.push(item);
        continue;
      }
      var property = /** @type {Property} */ (resolved.effect.property(1));
      if (!property) {
        missingItems.push(item);
        continue;
      }
      var currentHost = cloneValue(property.value);
      var currentLogical = logicalFromHost(record, currentHost);
      var nextRecord = copyRecord(record);
      if (resolved.resolution === "name") nextRecord.index = resolved.index;
      var animated = property.numKeys > 0;
      var manuallyChanged = !valuesEqual(currentLogical, record.lastAppliedValue);
      var shouldWrite = !animated && (!manuallyChanged || overwrite);
      if (animated) {
        userOverrides[item.paramId] = cloneValue(currentLogical);
        warnings.push({
          code: "CONTROLS_KEYFRAMED",
          message: "Controle animado foi preservado.",
          details: { paramId: item.paramId }
        });
      } else if (manuallyChanged && !overwrite) {
        userOverrides[item.paramId] = cloneValue(currentLogical);
      }
      plans.push({
        item: item,
        record: nextRecord,
        oldHostValue: currentHost,
        shouldWrite: shouldWrite,
        desiredHostValue: hostFromLogical(record, item.logicalValue)
      });
      resultByParam[item.paramId] = nextRecord;
    }

    if (missingItems.length > 0) {
      assertCapacity(parade, missingItems.length, prepared.targetKind);
      warnings.push({
        code: "CONTROLS_MISSING",
        message: "Controles ausentes foram recriados; revise as expressões e use Religar quando necessário.",
        action: "relink",
        details: { count: missingItems.length }
      });
    }

    try {
      if (missingItems.length > 0) {
        /** @type {any[]} */
        var missingBindings = [];
        /** @type {Record<string, any>} */
        var missingValues = {};
        for (i = 0; i < missingItems.length; i += 1) {
          missingBindings.push(missingItems[i].binding);
          missingValues[missingItems[i].paramId] = cloneValue(missingItems[i].logicalValue);
        }
        var created = create(layer, {
          rigId: prepared.rigId,
          tool: prepared.tool,
          locale: prepared.locale,
          targetKind: prepared.targetKind,
          bindings: missingBindings,
          values: missingValues
        });
        createdRecords = created.records;
        for (i = 0; i < created.records.length; i += 1) {
          resultByParam[created.records[i].paramId] = created.records[i];
        }
        for (i = 0; i < created.warnings.length; i += 1) warnings.push(created.warnings[i]);
      }

      for (i = 0; i < plans.length; i += 1) {
        var plan = plans[i];
        if (!plan.shouldWrite) continue;
        var current = resolveEffect(parade, plan.record);
        if (!current.effect) throw new Error("Live Control desapareceu durante a atualização.");
        var currentProperty = /** @type {Property} */ (current.effect.property(1));
        if (!currentProperty || currentProperty.numKeys > 0) throw new Error("Live Control mudou durante a atualização.");
        if (!valuesEqual(logicalFromHost(plan.record, currentProperty.value), plan.item.logicalValue)) {
          currentProperty.setValue(cloneValue(plan.desiredHostValue));
          written.push(plan);
        }
        plan.record.index = current.index;
        plan.record.lastAppliedValue = cloneValue(plan.item.logicalValue);
        resultByParam[plan.item.paramId] = plan.record;
      }
    } catch (updateError) {
      var rollbackOk = true;
      for (i = written.length - 1; i >= 0; i -= 1) {
        try {
          var oldEffect = resolveEffect(parade, written[i].record);
          if (!oldEffect.effect) rollbackOk = false;
          else {
            var oldProperty = /** @type {Property} */ (oldEffect.effect.property(1));
            if (!oldProperty || oldProperty.numKeys > 0) rollbackOk = false;
            else oldProperty.setValue(cloneValue(written[i].oldHostValue));
          }
        } catch (restoreError) {
          rollbackOk = false;
        }
      }
      if (!removeCreated(parade, createdRecords)) rollbackOk = false;
      if (!rollbackOk) {
        var rollbackError = /** @type {Error & {motionCode?: string, cause?: unknown}} */ (
          new Error("Live Controls falharam e o estado anterior não pôde ser restaurado.")
        );
        rollbackError.motionCode = "ROLLBACK_FAILED";
        rollbackError.cause = updateError;
        throw rollbackError;
      }
      throw updateError;
    }

    var resultRecords = [];
    for (i = 0; i < prepared.items.length; i += 1) {
      var resultRecord = resultByParam[prepared.items[i].paramId];
      if (!resultRecord) throw new Error("Updater não produziu metadata para todos os controles.");
      resultRecords.push(resultRecord);
    }
    refreshCreatedIndices(parade, resultRecords);
    var activeValues = read(layer, resultRecords).values;
    for (i = 0; i < orphanedRecords.length; i += 1) resultRecords.push(orphanedRecords[i]);
    refreshCreatedIndices(parade, resultRecords);
    return {
      records: resultRecords,
      orphanedRecords: orphanedRecords,
      warnings: warnings,
      userOverrides: userOverrides,
      values: activeValues
    };
  }

  /** @param {string} text @returns {string} */
  function escapeExpressionString(text) {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  /** @param {number} value @returns {string} */
  function numberLiteral(value) {
    if (!finiteNumber(value)) invalid("Limite de expressão precisa ser finito.");
    return String(value);
  }

  /** @param {any} record @returns {string} */
  function expressionReference(record) {
    if (!record || typeof record.name !== "string" || record.name.length === 0) invalid("Registro sem nome de efeito.");
    var expression = 'effect("' + escapeExpressionString(record.name) + '")(1)';
    if (finiteNumber(record.max)) expression = "Math.min(" + numberLiteral(record.max) + ", " + expression + ")";
    if (finiteNumber(record.min)) expression = "Math.max(" + numberLiteral(record.min) + ", " + expression + ")";
    return expression;
  }

  /**
   * Confirma explicitamente um efeito escolhido pelo usuario depois de rename e
   * reescreve apenas as propriedades de expressao passadas pelo chamador.
   *
   * @param {unknown} layer
   * @param {any} record
   * @param {number} effectIndex
   * @param {any[]} expressionProperties
   * @param {Function} renderer
   */
  function relink(layer, record, effectIndex, expressionProperties, renderer) {
    var parade = requireParade(layer);
    var i;
    if (!record || typeof record !== "object") invalid("Registro ausente para Religar.");
    if (!finiteNumber(effectIndex) || effectIndex < 1 || Math.floor(effectIndex) !== effectIndex) invalid("Índice inválido para Religar.");
    if (!isArray(expressionProperties)) invalid("Lista de expressões inválida para Religar.");
    if (typeof renderer !== "function") invalid("Renderer de expressão ausente para Religar.");
    var effect = parade.property(effectIndex);
    if (!effect || effect.matchName !== record.matchName) {
      throw codedError("O efeito escolhido não corresponde ao tipo do Live Control.", "CONTROLS_MISSING", {
        paramId: record.paramId,
        effectIndex: effectIndex
      });
    }
    var nextRecord = copyRecord(record);
    nextRecord.name = effect.name;
    nextRecord.index = effectIndex;
    var expression = renderer(nextRecord);
    if (typeof expression !== "string" || expression.length === 0) invalid("Renderer devolveu expressão vazia.");
    /** @type {any[]} */
    var previous = [];
    for (i = 0; i < expressionProperties.length; i += 1) {
      var property = expressionProperties[i];
      if (!property || property.canSetExpression === false) invalid("Propriedade não aceita expressão.");
      previous.push({ property: property, expression: property.expression, enabled: property.expressionEnabled });
    }
    try {
      for (i = 0; i < expressionProperties.length; i += 1) {
        var target = expressionProperties[i];
        if (typeof target.setExpression === "function") target.setExpression(expression);
        else target.expression = expression;
        if (typeof target.expressionEnabled !== "undefined") target.expressionEnabled = true;
      }
    } catch (writeError) {
      var rollbackOk = true;
      for (i = previous.length - 1; i >= 0; i -= 1) {
        try {
          if (typeof previous[i].property.setExpression === "function") {
            previous[i].property.setExpression(previous[i].expression);
          } else {
            previous[i].property.expression = previous[i].expression;
          }
          if (typeof previous[i].enabled !== "undefined") previous[i].property.expressionEnabled = previous[i].enabled;
        } catch (restoreError) {
          rollbackOk = false;
        }
      }
      if (!rollbackOk) {
        var rollbackError = /** @type {Error & {motionCode?: string, cause?: unknown}} */ (
          new Error("Religar falhou e as expressões anteriores não puderam ser restauradas.")
        );
        rollbackError.motionCode = "ROLLBACK_FAILED";
        rollbackError.cause = writeError;
        throw rollbackError;
      }
      throw writeError;
    }
    return { record: nextRecord, warnings: [] };
  }

  /**
   * Planeja onde o chamador deve materializar os controles. Criar layers fica a
   * cargo do comando de rig porque so ele conhece metadata, camera e selecao.
   *
   * @param {any} context
   */
  function planPlacement(context) {
    var selectionCount = context && finiteNumber(context.selectionCount) ? context.selectionCount : 0;
    var existing = context && finiteNumber(context.existingControlCount) ? context.existingControlCount : 0;
    var requested = context && finiteNumber(context.requestedControlCount) ? context.requestedControlCount : 0;
    var targetKind;
    var warnings = [];
    if (context && context.cameraRig === true) targetKind = "camera-controller";
    else if ((context && context.compRig === true) || selectionCount >= 9) targetKind = "comp-controller";
    else if (selectionCount >= 2) targetKind = "controller";
    else targetKind = "layer";

    if (targetKind === "layer" && existing + requested > LAYER_LIMIT) {
      targetKind = "controller";
      warnings.push({
        code: "CONTROLS_PROMOTED",
        message: "Os controles foram promovidos para um controller por capacidade.",
        details: { from: "layer", to: "controller" }
      });
    }
    if (targetKind === "controller" && existing + requested > CONTROLLER_LIMIT) {
      targetKind = "comp-controller";
      warnings.push({
        code: "CONTROLS_PROMOTED",
        message: "Os controles foram promovidos para o Control Room por capacidade.",
        details: { from: "controller", to: "comp-controller" }
      });
    }
    if (existing + requested > CONTROLLER_LIMIT) {
      warnings.push({
        code: "CONTROLS_OVERFLOW",
        message: "Mais de 24 controles exigem outro controller.",
        details: { total: existing + requested }
      });
    }
    return { targetKind: targetKind, warnings: warnings };
  }

  global.MotionLiveControls = {
    MATCH_NAMES: MATCH_NAMES,
    LAYER_LIMIT: LAYER_LIMIT,
    CONTROLLER_LIMIT: CONTROLLER_LIMIT,
    create: create,
    read: read,
    update: update,
    relink: relink,
    expressionReference: expressionReference,
    planPlacement: planPlacement
  };
}($.global));
