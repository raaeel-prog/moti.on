(function () {
  "use strict";

  var csInterface = null;
  var initialized = false;

  function element(id) {
    return document.getElementById(id);
  }

  function setStatus(message, state) {
    var dot = element("statusDot");
    var text = element("statusText");
    if (dot) {
      dot.className = "status-dot" + (state ? " is-" + state : "");
    }
    if (text) {
      text.textContent = message;
    }
  }

  function setLog(message, state) {
    var box = element("logBox");
    if (!box) {
      return;
    }
    box.className = "log-box" + (state ? " is-" + state : "");
    box.textContent = message;
  }

  function setBusy(busy) {
    element("refreshButton").disabled = busy;
    element("createDemoButton").disabled = busy;
  }

  function callHost(expression, callback) {
    if (!csInterface) {
      callback(MotionProtocol.failure("CSInterface não foi inicializada.", "NO_CSINTERFACE"));
      return;
    }

    csInterface.evalScript(expression, function (rawResult) {
      callback(MotionProtocol.parse(rawResult));
    });
  }

  function renderContext(data) {
    element("hostVersion").textContent = MotionProtocol.safeText(data.hostVersion);
    element("projectName").textContent = MotionProtocol.safeText(data.projectName);
    element("projectPath").textContent = MotionProtocol.safeText(data.projectPath, "Projeto ainda não salvo");
    element("activeItemName").textContent =
      MotionProtocol.safeText(data.activeItemName, "Nenhum") +
      (data.activeItemType ? " · " + data.activeItemType : "");

    element("compositionInfo").textContent = data.isComposition
      ? MotionProtocol.formatDimension(data.compWidth, data.compHeight) +
        " · " + MotionProtocol.safeText(data.compDuration) + " s · " +
        MotionProtocol.safeText(data.compFrameRate) + " fps"
      : "Nenhuma composição ativa";
  }

  function refreshContext() {
    setBusy(true);
    setStatus("Lendo o projeto ativo…", "");
    setLog("Consultando o DOM ExtendScript do After Effects…", "");

    callHost("MotionAE.getContext()", function (envelope) {
      if (!envelope.ok) {
        setStatus("Não foi possível obter o contexto.", "error");
        setLog(envelope.error.message + " [" + envelope.error.code + "]", "error");
        setBusy(false);
        return;
      }

      renderContext(envelope.data);
      setStatus("Conectado ao After Effects.", "success");
      setLog("Contexto atualizado com sucesso.", "success");
      setBusy(false);
    });
  }

  function createDemoComposition() {
    setBusy(true);
    setStatus("Criando composição de teste…", "");
    setLog("A operação será registrada como um único grupo de desfazer.", "");

    callHost("MotionAE.createDemoComposition()", function (envelope) {
      if (!envelope.ok) {
        setStatus("A composição não foi criada.", "error");
        setLog(envelope.error.message + " [" + envelope.error.code + "]", "error");
        setBusy(false);
        return;
      }

      setStatus("Composição criada.", "success");
      setLog("Criada: " + envelope.data.compositionName, "success");
      setBusy(false);
      refreshContext();
    });
  }

  function initialize() {
    if (initialized) {
      return;
    }

    csInterface = new CSInterface();
    element("refreshButton").addEventListener("click", refreshContext);
    element("createDemoButton").addEventListener("click", createDemoComposition);
    initialized = true;
    refreshContext();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
}());
