/**
 * Camada de host do After Effects.
 *
 * ES5 estrito, sem modulos. A diretiva `#target aftereffects` NAO fica aqui: ela
 * e emitida por scripts/build-extendscript.mjs, para que este arquivo continue
 * sendo JavaScript parseavel por `tsc --checkJs` e por `node --check`.
 *
 * Os tipos vem de JSDoc mais host/types/extendscript.d.ts. JSDoc e comentario,
 * entao nao existe passo de compilacao e o que roda no After Effects e
 * exatamente o que esta escrito aqui.
 *
 * Este arquivo ainda usa o envelope legado `{ ok, data, error }` e expoe dois
 * comandos direto no global. O CHMS-004 substitui os dois pontos: passa a existir
 * um unico `MotionAE.dispatch`, e o envelope vira o CommandResponse da secao 8 do
 * master spec, com protocolVersion, requestId, warnings e timing.
 */
(function (global) {
  /**
   * Escapa uma string para dentro de um literal JSON.
   *
   * LIMITACAO CONHECIDA, corrigida no CHMS-004: apenas `\`, `"`, CR, LF e TAB
   * sao tratados. Os demais caracteres de controle U+0000-U+001F saem crus, o
   * que produz JSON invalido, e todo nao-ASCII sai cru, o que e fragil por
   * codepage no canal `evalScript` do Windows. Nao acrescente comandos novos que
   * dependam deste serializador; espere o MotionJson do CHMS-004.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function escapeJsonString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  /**
   * Serializador JSON escrito a mao. O ExtendScript nao possui `JSON`.
   *
   * @param {unknown} value
   * @returns {string}
   */
  function stringify(value) {
    var type = typeof value;
    /** @type {string[]} */
    var parts;
    var key;
    var i;

    if (value === null || type === "undefined") {
      return "null";
    }
    if (type === "string") {
      return "\"" + escapeJsonString(value) + "\"";
    }
    if (type === "number") {
      return isFinite(/** @type {number} */ (value)) ? String(value) : "null";
    }
    if (type === "boolean") {
      return value ? "true" : "false";
    }
    if (value instanceof Array) {
      parts = [];
      for (i = 0; i < value.length; i += 1) {
        parts.push(stringify(value[i]));
      }
      return "[" + parts.join(",") + "]";
    }

    parts = [];
    var record = /** @type {Record<string, unknown>} */ (value);
    for (key in record) {
      // Object.prototype.hasOwnProperty.call em vez de record.hasOwnProperty:
      // um objeto vindo de dados pode ter uma propriedade propria chamada
      // hasOwnProperty e mascarar o metodo. Function.prototype.call existe no ES3.
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        parts.push("\"" + escapeJsonString(key) + "\":" + stringify(record[key]));
      }
    }
    return "{" + parts.join(",") + "}";
  }

  /**
   * @param {Record<string, unknown>} [data]
   * @returns {string}
   */
  function success(data) {
    return stringify({ ok: true, data: data || {}, error: null });
  }

  /**
   * @param {unknown} error
   * @param {string} [code]
   * @returns {string}
   */
  function failure(error, code) {
    var detail = /** @type {{ message?: string, line?: number }} */ (error);
    return stringify({
      ok: false,
      data: null,
      error: {
        code: code || "AFTER_EFFECTS_ERROR",
        message: detail && detail.message ? detail.message : String(error),
        line: detail && detail.line ? detail.line : null
      }
    });
  }

  /**
   * Le o contexto atual do After Effects sem alterar nada.
   *
   * @returns {string} CommandResponse legado serializado.
   */
  function getContext() {
    try {
      var project = app.project;
      var activeItem = project ? project.activeItem : null;
      /** @type {CompItem|null} */
      var comp = activeItem && activeItem instanceof CompItem ? activeItem : null;

      return success({
        host: "After Effects",
        hostVersion: app.version,
        projectName: project && project.file ? project.file.name : "Projeto sem salvar",
        projectPath: project && project.file ? project.file.fsName : "",
        activeItemName: activeItem ? activeItem.name : "",
        activeItemType: activeItem ? (comp ? "Composição" : "Item de projeto") : "",
        isComposition: Boolean(comp),
        compWidth: comp ? comp.width : null,
        compHeight: comp ? comp.height : null,
        compDuration: comp ? Math.round(comp.duration * 1000) / 1000 : null,
        compFrameRate: comp ? Math.round(comp.frameRate * 1000) / 1000 : null
      });
    } catch (error) {
      return failure(error, "AE_CONTEXT_ERROR");
    }
  }

  /**
   * Cria uma composicao de teste com uma camada de texto centralizada.
   *
   * @returns {string} CommandResponse legado serializado.
   */
  function createDemoComposition() {
    app.beginUndoGroup("Moti.on - Criar composição de teste");

    try {
      var comp = app.project.items.addComp(
        "Moti.on Demo",
        1920,
        1080,
        1,
        5,
        30
      );

      var textLayer = comp.layers.addText("Plugin funcionando");
      var textProperty = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
      var textDocument = /** @type {TextDocument} */ (textProperty.value);
      var positionProperty = textLayer.property("ADBE Transform Group").property("ADBE Position");

      textDocument.fontSize = 86;
      textDocument.fillColor = [1, 1, 1];
      textDocument.justification = ParagraphJustification.CENTER_JUSTIFY;
      textProperty.setValue(textDocument);
      positionProperty.setValue([960, 540]);

      return success({
        compositionName: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate
      });
    } catch (error) {
      return failure(error, "AE_CREATE_COMP_ERROR");
    } finally {
      app.endUndoGroup();
    }
  }

  global.MotionAE = {
    getContext: getContext,
    createDemoComposition: createDemoComposition
  };
}($.global));
