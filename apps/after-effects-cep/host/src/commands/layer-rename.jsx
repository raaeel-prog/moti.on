/**
 * Preview e aplicacao do batch rename de camadas.
 *
 * O plano e calculado integralmente antes do primeiro write. Isso inclui regex,
 * nomes finais e fontes compartilhadas: duas camadas que apontam para o mesmo
 * AVItem nao podem pedir nomes finais diferentes quando `sourceName` esta ativo.
 */
(function () {
  /** @typedef {{name: string}} RenameNameTarget */
  /** @typedef {{before: string, after: string}} RenameSourcePreview */
  /** @typedef {{source: RenameNameTarget, before: string, after: string, layerIndex: number}} RenameSourcePlan */
  /** @typedef {{layer: Layer, index: number, before: string, after: string, source: RenameSourcePreview|null}} RenameItem */
  /** @typedef {{scope: string, items: RenameItem[], sourcePlans: RenameSourcePlan[], layerChangedCount: number, sourceChangedCount: number}} RenamePlan */
  /** @typedef {{target: RenameNameTarget, before: string}} RenameTouched */

  var MAX_LAYERS = 500;
  var MAX_NAME_LENGTH = 1024;
  var MAX_REGEX_LENGTH = 256;
  var MAX_SAFE_INTEGER = 9007199254740991;

  var REQUIRED_ARGS = {
    scope: true,
    prefix: true,
    suffix: true,
    find: true,
    replace: true,
    regex: true,
    counterStart: true,
    padding: true,
    sourceName: true,
    preview: true
  };

  /** @param {string} code @param {string} message @param {unknown} details @returns {MotionCommandFailure} */
  function failure(code, message, details) {
    return {
      code: code,
      message: message,
      recoverable: true,
      details: typeof details === "undefined" ? null : details
    };
  }

  /** @param {unknown} value @returns {boolean} */
  function isSafeInteger(value) {
    return (
      typeof value === "number" &&
      isFinite(value) &&
      Math.floor(value) === value &&
      Math.abs(value) <= MAX_SAFE_INTEGER
    );
  }

  /** @param {string} pattern @returns {boolean} */
  function hasLargeCountedQuantifier(pattern) {
    var counted = /\{([0-9]+)(,([0-9]*))?\}/g;
    var match;
    while ((match = counted.exec(pattern)) !== null) {
      var lower = Number(match[1]);
      var upper = match[2] ? (match[3] === "" ? lower : Number(match[3])) : lower;
      if (lower > 1024 || upper > 1024) return true;
    }
    return false;
  }

  /**
   * Recusa as construcoes mais propensas a backtracking exponencial.
   *
   * O validador e deliberadamente conservador: grupos com alternancia ou outro
   * quantificador nao podem ser quantificados de novo. Backreferences e grupos
   * estendidos tambem sao recusados. O input continua sendo uma RegExp, nunca
   * codigo avaliado.
   *
   * @param {string} pattern
   * @returns {boolean}
   */
  function isConservativeRegex(pattern) {
    if (pattern === "" || pattern.length > MAX_REGEX_LENGTH) return false;
    if (/\(\?/.test(pattern) || /\\[1-9]/.test(pattern)) return false;
    if (hasLargeCountedQuantifier(pattern)) return false;

    /** @type {Array<{quantified: boolean, alternation: boolean}>} */
    var stack = [];
    var escaped = false;
    var inClass = false;
    var quantifierCount = 0;
    var i;
    for (i = 0; i < pattern.length; i += 1) {
      var ch = pattern.charAt(i);
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (inClass) {
        if (ch === "]") inClass = false;
        continue;
      }
      if (ch === "[") {
        inClass = true;
        continue;
      }
      if (ch === "(") {
        stack.push({ quantified: false, alternation: false });
        continue;
      }
      if (ch === "|") {
        var alternationGroup = stack.length > 0 ? stack[stack.length - 1] : null;
        if (alternationGroup) alternationGroup.alternation = true;
        continue;
      }
      if (ch === "*" || ch === "+" || ch === "?" || ch === "{") {
        quantifierCount += 1;
        if (quantifierCount > 16) return false;
        var quantifiedGroup = stack.length > 0 ? stack[stack.length - 1] : null;
        if (quantifiedGroup) quantifiedGroup.quantified = true;
        continue;
      }
      if (ch === ")") {
        if (stack.length === 0) continue;
        var group = stack.pop();
        if (!group) continue;
        var next = i + 1 < pattern.length ? pattern.charAt(i + 1) : "";
        var groupIsQuantified = next === "*" || next === "+" || next === "?" || next === "{";
        if (groupIsQuantified && (group.quantified === true || group.alternation === true)) {
          return false;
        }
        if (stack.length > 0 && (group.quantified === true || groupIsQuantified)) {
          var parentGroup = stack[stack.length - 1];
          if (parentGroup) parentGroup.quantified = true;
        }
      }
    }
    if (escaped || inClass) return false;

    try {
      new RegExp(pattern, "g");
    } catch (regexError) {
      return false;
    }
    return true;
  }

  /** @param {Record<string, unknown>} args @param {boolean} expectedPreview @returns {MotionCommandFailure|null} */
  function validateArgs(args, expectedPreview) {
    var key;
    for (key in args) {
      if (
        Object.prototype.hasOwnProperty.call(args, key) &&
        !Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de rename desconhecido.", {
          field: key
        });
      }
    }
    for (key in REQUIRED_ARGS) {
      if (
        Object.prototype.hasOwnProperty.call(REQUIRED_ARGS, key) &&
        !Object.prototype.hasOwnProperty.call(args, key)
      ) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Argumento de rename ausente.", {
          field: key
        });
      }
    }

    if (args.scope !== "selected" && args.scope !== "composition") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Escopo de rename invalido.", {
        field: "scope"
      });
    }

    var stringFields = ["prefix", "suffix", "find", "replace"];
    var i;
    for (i = 0; i < stringFields.length; i += 1) {
      var field = stringFields[i] || "";
      var value = args[field];
      if (typeof value !== "string" || value.length > MAX_NAME_LENGTH) {
        return failure(MotionContracts.ERROR.INVALID_PRESET, "Texto de rename invalido.", {
          field: field,
          maxLength: MAX_NAME_LENGTH
        });
      }
    }

    if (typeof args.regex !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo regex invalido.", { field: "regex" });
    }
    if (typeof args.sourceName !== "boolean") {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo sourceName invalido.", {
        field: "sourceName"
      });
    }
    if (typeof args.preview !== "boolean" || args.preview !== expectedPreview) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Modo preview nao corresponde ao comando.", {
        field: "preview",
        expected: expectedPreview
      });
    }
    if (!isSafeInteger(args.counterStart)) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Inicio do contador invalido.", {
        field: "counterStart"
      });
    }
    if (
      !isSafeInteger(args.padding) ||
      /** @type {number} */ (args.padding) < 0 ||
      /** @type {number} */ (args.padding) > 12
    ) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Padding invalido.", { field: "padding" });
    }
    if (args.regex === true && !isConservativeRegex(/** @type {string} */ (args.find))) {
      return failure(MotionContracts.ERROR.INVALID_PRESET, "Regex invalida ou insegura.", {
        field: "find",
        maxLength: MAX_REGEX_LENGTH
      });
    }

    return null;
  }

  /** @param {string} value @param {string} find @param {string} replacement @returns {string} */
  function replaceLiteral(value, find, replacement) {
    if (find === "") return value;
    var out = "";
    var cursor = 0;
    var found;
    while ((found = value.indexOf(find, cursor)) !== -1) {
      out += value.substring(cursor, found) + replacement;
      cursor = found + find.length;
    }
    return out + value.substring(cursor);
  }

  /** @param {number} value @param {number} padding @returns {string} */
  function formatCounter(value, padding) {
    var negative = value < 0;
    var digits = String(Math.abs(value));
    while (digits.length < padding) digits = "0" + digits;
    return negative ? "-" + digits : digits;
  }

  /** @param {string} before @param {Record<string, unknown>} args @param {number} ordinal @returns {string} */
  function finalName(before, args, ordinal) {
    var base;
    if (args.regex === true) {
      base = before.replace(
        new RegExp(/** @type {string} */ (args.find), "g"),
        /** @type {string} */ (args.replace)
      );
    } else {
      base = replaceLiteral(
        before,
        /** @type {string} */ (args.find),
        /** @type {string} */ (args.replace)
      );
    }
    var result = /** @type {string} */ (args.prefix) + base + /** @type {string} */ (args.suffix);
    if (/** @type {number} */ (args.padding) > 0) {
      result += formatCounter(
        /** @type {number} */ (args.counterStart) + ordinal,
        /** @type {number} */ (args.padding)
      );
    }
    return result;
  }

  /** @param {CompItem} comp @param {string} scope @returns {Layer[]} */
  function collectTargets(comp, scope) {
    var selected = comp.selectedLayers || [];
    var targets = [];
    var i, j;
    for (i = 1; i <= comp.numLayers; i += 1) {
      var layer = comp.layer(i);
      if (scope === "composition") {
        targets.push(layer);
      } else {
        for (j = 0; j < selected.length; j += 1) {
          if (selected[j] === layer) {
            targets.push(layer);
            break;
          }
        }
      }
    }
    return targets;
  }

  /** @param {Layer} layer @returns {RenameNameTarget|null} */
  function avSource(layer) {
    var source;
    try {
      source = layer.source;
    } catch (sourceReadError) {
      return null;
    }
    if (!source || typeof source.name !== "string") return null;
    return source;
  }

  /** @param {RenameSourcePlan[]} plans @param {RenameNameTarget} source @returns {RenameSourcePlan|null} */
  function sourcePlanFor(plans, source) {
    var i;
    for (i = 0; i < plans.length; i += 1) {
      var plan = plans[i];
      if (plan && plan.source === source) return plan;
    }
    return null;
  }

  /**
   * @param {Record<string, unknown>} args
   * @param {boolean} expectedPreview
   * @returns {{error: MotionCommandFailure|null, plan: RenamePlan|null}}
   */
  function prepare(args, expectedPreview) {
    var argsError = validateArgs(args, expectedPreview);
    if (argsError) return { error: argsError, plan: null };

    var activeItem = app.project ? app.project.activeItem : null;
    if (!activeItem || !(activeItem instanceof CompItem)) {
      return {
        error: failure(MotionContracts.ERROR.NO_ACTIVE_COMP, "Nenhuma composicao ativa.", null),
        plan: null
      };
    }
    var comp = /** @type {CompItem} */ (activeItem);
    var targets = collectTargets(comp, /** @type {string} */ (args.scope));
    if (targets.length === 0) {
      return {
        error: failure(MotionContracts.ERROR.NO_SELECTION, "Nenhuma camada no escopo pedido.", {
          scope: args.scope
        }),
        plan: null
      };
    }
    if (targets.length > MAX_LAYERS) {
      return {
        error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "O rename excede 500 camadas.", {
          count: targets.length,
          maxLayers: MAX_LAYERS
        }),
        plan: null
      };
    }
    if (
      /** @type {number} */ (args.counterStart) + targets.length - 1 > MAX_SAFE_INTEGER
    ) {
      return {
        error: failure(MotionContracts.ERROR.INVALID_PRESET, "O contador excede o inteiro seguro.", {
          field: "counterStart"
        }),
        plan: null
      };
    }

    /** @type {RenameItem[]} */
    var items = [];
    /** @type {RenameSourcePlan[]} */
    var sourcePlans = [];
    var layerChangedCount = 0;
    var i;
    for (i = 0; i < targets.length; i += 1) {
      var layer = /** @type {Layer} */ (targets[i]);
      if (/** @type {{locked?: boolean}} */ (layer).locked === true) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Camada bloqueada no escopo de rename.", {
            layerIndex: layer.index
          }),
          plan: null
        };
      }
      if (typeof layer.name !== "string" || layer.name.length > MAX_NAME_LENGTH) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nome atual de camada invalido.", {
            layerIndex: layer.index,
            maxLength: MAX_NAME_LENGTH
          }),
          plan: null
        };
      }

      var before = layer.name;
      var after;
      try {
        after = finalName(before, args, i);
      } catch (nameError) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_PRESET, "Nao foi possivel aplicar a regex.", {
            field: "find"
          }),
          plan: null
        };
      }
      if (after.length > MAX_NAME_LENGTH) {
        return {
          error: failure(MotionContracts.ERROR.INVALID_PRESET, "Nome final excede 1024 caracteres.", {
            layerIndex: layer.index,
            length: after.length,
            maxLength: MAX_NAME_LENGTH
          }),
          plan: null
        };
      }

      /** @type {RenameItem} */
      var item = {
        layer: layer,
        index: layer.index,
        before: before,
        after: after,
        source: null
      };
      if (before !== after) layerChangedCount += 1;

      if (args.sourceName === true) {
        var source = avSource(layer);
        if (source) {
          if (source.name.length > MAX_NAME_LENGTH) {
            return {
              error: failure(MotionContracts.ERROR.INVALID_SELECTION_TYPE, "Nome atual da fonte invalido.", {
                layerIndex: layer.index,
                maxLength: MAX_NAME_LENGTH
              }),
              plan: null
            };
          }
          var existing = sourcePlanFor(sourcePlans, source);
          if (existing && existing.after !== after) {
            return {
              error: failure(
                MotionContracts.ERROR.INVALID_SELECTION_TYPE,
                "A mesma fonte receberia nomes finais divergentes.",
                {
                  firstLayerIndex: existing.layerIndex,
                  secondLayerIndex: layer.index
                }
              ),
              plan: null
            };
          }
          if (!existing) {
            existing = {
              source: source,
              before: source.name,
              after: after,
              layerIndex: layer.index
            };
            sourcePlans.push(existing);
          }
          item.source = {
            before: source.name,
            after: after
          };
        }
      }
      items.push(item);
    }

    var sourceChangedCount = 0;
    for (i = 0; i < sourcePlans.length; i += 1) {
      var sourcePlan = sourcePlans[i];
      if (sourcePlan && sourcePlan.before !== sourcePlan.after) sourceChangedCount += 1;
    }

    return {
      error: null,
      plan: {
        scope: /** @type {string} */ (args.scope),
        items: items,
        sourcePlans: sourcePlans,
        layerChangedCount: layerChangedCount,
        sourceChangedCount: sourceChangedCount
      }
    };
  }

  /** @param {RenamePlan} plan @returns {Record<string, unknown>} */
  function publicPlan(plan) {
    var internalItems = plan.items;
    /** @type {Array<Record<string, unknown>>} */
    var items = [];
    var i;
    for (i = 0; i < internalItems.length; i += 1) {
      var internal = /** @type {RenameItem} */ (internalItems[i]);
      /** @type {Record<string, unknown>} */
      var item = {
        index: internal.index,
        before: internal.before,
        after: internal.after
      };
      if (internal.source) item.source = internal.source;
      items.push(item);
    }
    return {
      scope: plan.scope,
      totalCount: internalItems.length,
      changedCount: plan.layerChangedCount,
      sourceChangedCount: plan.sourceChangedCount,
      items: items
    };
  }

  /** @param {Record<string, unknown>} args @returns {MotionCommandFailure|null} */
  function previewPreflight(args) {
    return prepare(args, true).error;
  }

  MotionRegistry.register("ae.layer.rename.preview", {
    preflight: previewPreflight,
    run: function (args) {
      var prepared = prepare(args, true);
      if (prepared.error || !prepared.plan) throw new Error("Preview de rename ficou invalido.");
      return {
        changed: false,
        warnings: [],
        data: publicPlan(prepared.plan)
      };
    }
  });

  MotionRegistry.register("ae.layer.rename", {
    preflight: function (args) {
      return prepare(args, false).error;
    },

    run: function (args) {
      var prepared = prepare(args, false);
      if (prepared.error || !prepared.plan) throw new Error("Rename ficou invalido depois do preflight.");

      var plan = /** @type {RenamePlan} */ (prepared.plan);
      var items = plan.items;
      var sourcePlans = plan.sourcePlans;
      /** @type {RenameTouched[]} */
      var touched = [];
      var i;

      try {
        // Camadas primeiro, fontes depois. Assim, renomear um AVItem nao muda
        // por vinculo uma camada que ainda nao recebeu seu nome explicito.
        for (i = 0; i < items.length; i += 1) {
          var item = items[i];
          if (!item || item.before === item.after) continue;
          touched.push({ target: item.layer, before: item.before });
          item.layer.name = item.after;
        }
        for (i = 0; i < sourcePlans.length; i += 1) {
          var sourcePlan = sourcePlans[i];
          if (!sourcePlan || sourcePlan.before === sourcePlan.after) continue;
          touched.push({ target: sourcePlan.source, before: sourcePlan.before });
          sourcePlan.source.name = sourcePlan.after;
        }

        // Setter que normaliza silenciosamente tambem e falha: o preview precisa
        // corresponder byte a byte ao resultado aplicado.
        for (i = 0; i < items.length; i += 1) {
          var verifyItem = items[i];
          if (verifyItem && verifyItem.layer.name !== verifyItem.after) {
            throw new Error("O host alterou o nome final de uma camada.");
          }
        }
        for (i = 0; i < sourcePlans.length; i += 1) {
          var verifySource = sourcePlans[i];
          if (verifySource && verifySource.source.name !== verifySource.after) {
            throw new Error("O host alterou o nome final de uma fonte.");
          }
        }
      } catch (applyError) {
        var rollbackFailed = false;
        for (i = touched.length - 1; i >= 0; i -= 1) {
          try {
            var undo = touched[i];
            if (undo) undo.target.name = undo.before;
          } catch (restoreError) {
            rollbackFailed = true;
          }
        }
        if (rollbackFailed) {
          var rollbackError = /** @type {Error & {motionCode?: string}} */ (
            new Error("Rollback do rename falhou.")
          );
          rollbackError.motionCode = MotionContracts.ERROR.ROLLBACK_FAILED;
          throw rollbackError;
        }
        throw applyError;
      }

      var data = publicPlan(plan);
      data.appliedCount = plan.layerChangedCount;
      data.sourceAppliedCount = plan.sourceChangedCount;
      data.unchangedCount = items.length - /** @type {number} */ (plan.layerChangedCount);
      return {
        changed:
          /** @type {number} */ (plan.layerChangedCount) > 0 ||
          /** @type {number} */ (plan.sourceChangedCount) > 0,
        warnings: [],
        data: data
      };
    }
  });
}());
