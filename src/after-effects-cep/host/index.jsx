#target aftereffects

(function (global) {
  function escapeJsonString(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\"/g, "\\\"")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  function stringify(value) {
    var type = typeof value;
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
      return isFinite(value) ? String(value) : "null";
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
    for (key in value) {
      if (value.hasOwnProperty(key)) {
        parts.push("\"" + escapeJsonString(key) + "\":" + stringify(value[key]));
      }
    }
    return "{" + parts.join(",") + "}";
  }

  function success(data) {
    return stringify({ ok: true, data: data || {}, error: null });
  }

  function failure(error, code) {
    return stringify({
      ok: false,
      data: null,
      error: {
        code: code || "AFTER_EFFECTS_ERROR",
        message: error && error.message ? error.message : String(error),
        line: error && error.line ? error.line : null
      }
    });
  }

  function getContext() {
    try {
      var project = app.project;
      var activeItem = project ? project.activeItem : null;
      var isComposition = activeItem && activeItem instanceof CompItem;

      return success({
        host: "After Effects",
        hostVersion: app.version,
        projectName: project && project.file ? project.file.name : "Projeto sem salvar",
        projectPath: project && project.file ? project.file.fsName : "",
        activeItemName: activeItem ? activeItem.name : "",
        activeItemType: activeItem ? (isComposition ? "Composição" : "Item de projeto") : "",
        isComposition: Boolean(isComposition),
        compWidth: isComposition ? activeItem.width : null,
        compHeight: isComposition ? activeItem.height : null,
        compDuration: isComposition ? Math.round(activeItem.duration * 1000) / 1000 : null,
        compFrameRate: isComposition ? Math.round(activeItem.frameRate * 1000) / 1000 : null
      });
    } catch (error) {
      return failure(error, "AE_CONTEXT_ERROR");
    }
  }

  function createDemoComposition() {
    app.beginUndoGroup("Moti.on - Criar composição de teste");

    try {
      if (!app.project) {
        app.newProject();
      }

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
      var textDocument = textProperty.value;
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
