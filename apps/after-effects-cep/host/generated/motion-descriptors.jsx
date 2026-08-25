/**
 * ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 * Origem: packages/command-registry/src/{descriptors,undo-labels}.ts
 * Gerador: packages/command-registry/scripts/gen-extendscript.mjs
 *
 * Regenere com `npm run build`. O teste de drift em
 * packages/command-registry/tests/generated-drift.test.mjs falha se este arquivo
 * sair de sincronia com o fonte TypeScript.
 */
(function (global) {
  var DEFAULT_LOCALE = "en-US";

  var table = {
    "ae.context.read": {
      id: "ae.context.read",
      requirements: [],
      destructive: false,
      mutates: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.diagnostics.echo": {
      id: "ae.diagnostics.echo",
      requirements: [],
      destructive: false,
      mutates: false,
      supportsDryRun: true,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.capability.probe": {
      id: "ae.capability.probe",
      requirements: [],
      destructive: false,
      mutates: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.demo.createComposition": {
      id: "ae.demo.createComposition",
      requirements: ["hasProject"],
      destructive: false,
      mutates: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.demo.createComposition",
      undoLabels: {
        "en-US": "Moti.on: create test composition",
        "pt-BR": "Moti.on: criar composição de teste"
      }
    }
  };

  /**
   * Resolve o rotulo de Undo no idioma do usuario. Locale desconhecido cai no
   * padrao: mostrar a chave crua no menu do After Effects seria pior que mostrar
   * o texto em ingles.
   */
  function undoLabelFor(descriptor, locale) {
    if (!descriptor || !descriptor.undoLabels) return "";

    if (typeof locale === "string") {
      var normalized = locale.replace(/^\s+|\s+$/g, "").replace(/_/g, "-").toLowerCase();
      var language = normalized.split("-")[0];
      var languageMatch = null;

      for (var supported in descriptor.undoLabels) {
        if (!Object.prototype.hasOwnProperty.call(descriptor.undoLabels, supported)) continue;
        var supportedLower = supported.toLowerCase();
        if (supportedLower === normalized) return descriptor.undoLabels[supported];
        if (!languageMatch && supportedLower.split("-")[0] === language) languageMatch = supported;
      }

      if (languageMatch) return descriptor.undoLabels[languageMatch];
    }

    return descriptor.undoLabels[DEFAULT_LOCALE] || "";
  }

  global.MotionDescriptors = table;
  global.MotionDescriptors.__undoLabelFor = undoLabelFor;
}($.global));
