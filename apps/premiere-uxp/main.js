"use strict";

const { entrypoints } = require("uxp");
const Protocol = require("./shared/protocol.js");
const PremiereAdapter = require("./host/premiere-adapter.js");

let initialized = false;

function element(id) {
  return document.getElementById(id);
}

function setStatus(message, state) {
  const dot = element("statusDot");
  const text = element("statusText");

  if (dot) {
    dot.className = "status-dot" + (state ? " is-" + state : "");
  }
  if (text) {
    text.textContent = message;
  }
}

function setLog(message, state) {
  const box = element("logBox");
  if (!box) {
    return;
  }
  box.className = "log-box" + (state ? " is-" + state : "");
  box.textContent = message;
}

function setBusy(busy) {
  const refreshButton = element("refreshButton");
  const selfTestButton = element("selfTestButton");
  if (refreshButton) {
    refreshButton.disabled = busy;
  }
  if (selfTestButton) {
    selfTestButton.disabled = busy;
  }
}

function renderContext(data) {
  element("projectName").textContent = Protocol.safeText(data.projectName);
  element("projectPath").textContent = Protocol.safeText(data.projectPath);
  element("sequenceName").textContent = Protocol.safeText(data.sequenceName);
  element("sequenceCount").textContent = Protocol.safeText(data.sequenceCount, "0");
  element("trackCount").textContent =
    Protocol.safeText(data.videoTrackCount, "0") + " vídeo · " +
    Protocol.safeText(data.audioTrackCount, "0") + " áudio";
}

async function refreshContext() {
  setBusy(true);
  setStatus("Lendo o projeto ativo…", "");
  setLog("Consultando a API UXP do Premiere Pro…", "");

  const envelope = await PremiereAdapter.getContext();

  if (!envelope.ok) {
    setStatus("Não foi possível obter o contexto.", "error");
    setLog(envelope.error.message + " [" + envelope.error.code + "]", "error");
    setBusy(false);
    return;
  }

  renderContext(envelope.data);
  setStatus("Conectado ao Premiere Pro.", "success");
  setLog("Contexto atualizado com sucesso.", "success");
  setBusy(false);
}

async function runSelfTest() {
  setBusy(true);
  setStatus("Executando verificações…", "");
  setLog("Validando acesso ao runtime e ao DOM do Premiere…", "");

  const envelope = await PremiereAdapter.runSelfTest();
  const checks = envelope.ok
    ? envelope.data.checks
    : (envelope.error && envelope.error.details ? envelope.error.details : []);

  const lines = checks.map(function (check) {
    return (check.ok ? "✓ " : "✕ ") + check.name;
  });

  if (envelope.ok) {
    setStatus("Autoteste concluído.", "success");
    setLog(lines.join("\n"), "success");
  } else {
    setStatus("Autoteste encontrou uma pendência.", "error");
    setLog(lines.join("\n") || envelope.error.message, "error");
  }

  setBusy(false);
}

function initializePanel() {
  if (initialized) {
    return;
  }

  const refreshButton = element("refreshButton");
  const selfTestButton = element("selfTestButton");

  if (!refreshButton || !selfTestButton) {
    return;
  }

  refreshButton.addEventListener("click", function () {
    refreshContext().catch(function (error) {
      const envelope = Protocol.failure(error.message || String(error), "UNHANDLED_UI_ERROR");
      setStatus("Falha inesperada.", "error");
      setLog(envelope.error.message, "error");
      setBusy(false);
    });
  });

  selfTestButton.addEventListener("click", function () {
    runSelfTest().catch(function (error) {
      setStatus("Falha inesperada.", "error");
      setLog(error.message || String(error), "error");
      setBusy(false);
    });
  });

  initialized = true;
  refreshContext();
}

entrypoints.setup({
  // O UXP exige os hooks de ciclo de vida do plugin, mas nao ha nada a fazer
  // neles ainda. Ficam vazios de proposito: MASTER_BUILD_SPEC secao 34 proibe
  // console.log fora do logger, e o logger estruturado chega no CHMS-007.
  plugin: {
    create: function () {},
    destroy: function () {}
  },
  panels: {
    mainPanel: {
      show: function () {
        initializePanel();
      }
    }
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePanel);
} else {
  initializePanel();
}
