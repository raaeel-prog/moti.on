"use strict";

const premiere = require("premierepro");
const Protocol = require("../shared/protocol.js");

async function getContext() {
  try {
    const project = await premiere.Project.getActiveProject();

    if (!project) {
      return Protocol.failure(
        "Nenhum projeto está aberto no Premiere Pro.",
        "NO_ACTIVE_PROJECT"
      );
    }

    const sequence = await project.getActiveSequence();
    const sequences = await project.getSequences();

    let videoTrackCount = 0;
    let audioTrackCount = 0;

    if (sequence) {
      const trackCounts = await Promise.all([
        sequence.getVideoTrackCount(),
        sequence.getAudioTrackCount()
      ]);
      videoTrackCount = trackCounts[0];
      audioTrackCount = trackCounts[1];
    }

    return Protocol.success({
      host: "Premiere Pro",
      projectName: project.name,
      projectPath: project.path || "Projeto ainda não salvo",
      sequenceName: sequence ? sequence.name : "Nenhuma sequência ativa",
      sequenceCount: sequences ? sequences.length : 0,
      videoTrackCount: videoTrackCount,
      audioTrackCount: audioTrackCount
    });
  } catch (error) {
    return Protocol.failure(
      error && error.message ? error.message : String(error),
      "PREMIERE_CONTEXT_ERROR",
      error && error.stack ? error.stack : null
    );
  }
}

async function runSelfTest() {
  const checks = [];

  try {
    checks.push({ name: "Módulo premierepro", ok: Boolean(premiere && premiere.Project) });

    const project = await premiere.Project.getActiveProject();
    checks.push({ name: "Acesso ao projeto ativo", ok: Boolean(project) });

    if (project) {
      const sequences = await project.getSequences();
      checks.push({ name: "Leitura de sequências", ok: Array.isArray(sequences) });
    }

    const allPassed = checks.every(function (check) { return check.ok; });
    return allPassed
      ? Protocol.success({ checks: checks })
      : Protocol.failure("Um ou mais testes não passaram.", "SELF_TEST_FAILED", checks);
  } catch (error) {
    return Protocol.failure(
      error && error.message ? error.message : String(error),
      "SELF_TEST_ERROR",
      checks
    );
  }
}

module.exports = {
  getContext,
  runSelfTest
};
