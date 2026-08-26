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
      allowsNoopSuccess: false,
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
      allowsNoopSuccess: false,
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
      allowsNoopSuccess: false,
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
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.demo.createComposition",
      undoLabels: {
        "en-US": "Moti.on: create test composition",
        "pt-BR": "Moti.on: criar composição de teste"
      }
    },
    "ae.expression.loopout": {
      id: "ae.expression.loopout",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.expression.loopout",
      undoLabels: {
        "en-US": "Moti.on: apply LoopOut",
        "pt-BR": "Moti.on: aplicar LoopOut"
      }
    },
    "ae.expression.smooth": {
      id: "ae.expression.smooth",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.expression.smooth",
      undoLabels: {
        "en-US": "Moti.on: apply Smooth",
        "pt-BR": "Moti.on: aplicar Smooth"
      }
    },
    "ae.expression.wiggle": {
      id: "ae.expression.wiggle",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.expression.wiggle",
      undoLabels: {
        "en-US": "Moti.on: apply Wiggle",
        "pt-BR": "Moti.on: aplicar Wiggle"
      }
    },
    "ae.expression.flicker": {
      id: "ae.expression.flicker",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.expression.flicker",
      undoLabels: {
        "en-US": "Moti.on: apply Flicker",
        "pt-BR": "Moti.on: aplicar Flicker"
      }
    },
    "ae.text.box": {
      id: "ae.text.box",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.text.box",
      undoLabels: {
        "en-US": "Moti.on: create text box",
        "pt-BR": "Moti.on: criar caixa de texto"
      }
    },
    "ae.layer.list": {
      id: "ae.layer.list",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: false,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.layer.parent": {
      id: "ae.layer.parent",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.layer.parent",
      undoLabels: {
        "en-US": "Moti.on: parent layers",
        "pt-BR": "Moti.on: parentear camadas"
      }
    },
    "ae.layer.create-null": {
      id: "ae.layer.create-null",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.layer.createNull",
      undoLabels: {
        "en-US": "Moti.on: create null",
        "pt-BR": "Moti.on: criar null"
      }
    },
    "ae.layer.flip": {
      id: "ae.layer.flip",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.layer.flip",
      undoLabels: {
        "en-US": "Moti.on: flip layers",
        "pt-BR": "Moti.on: espelhar camadas"
      }
    },
    "ae.layer.rename.preview": {
      id: "ae.layer.rename.preview",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: false,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.layer.rename": {
      id: "ae.layer.rename",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.layer.rename",
      undoLabels: {
        "en-US": "Moti.on: rename layers",
        "pt-BR": "Moti.on: renomear camadas"
      }
    },
    "ae.layer.reverse-order.preview": {
      id: "ae.layer.reverse-order.preview",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: false,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.layer.reverse-order": {
      id: "ae.layer.reverse-order",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.layer.reverseOrder",
      undoLabels: {
        "en-US": "Moti.on: reverse layer order",
        "pt-BR": "Moti.on: inverter ordem das camadas"
      }
    },
    "ae.keys.cut.preview": {
      id: "ae.keys.cut.preview",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: false,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.keys.cut": {
      id: "ae.keys.cut",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.cut",
      undoLabels: {
        "en-US": "Moti.on: cut keyframes",
        "pt-BR": "Moti.on: cortar keyframes"
      }
    },
    "ae.keys.delay.preview": {
      id: "ae.keys.delay.preview",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: false,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.none",
      undoLabels: {
        "en-US": "",
        "pt-BR": ""
      }
    },
    "ae.keys.delay": {
      id: "ae.keys.delay",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.delay",
      undoLabels: {
        "en-US": "Moti.on: delay animation",
        "pt-BR": "Moti.on: atrasar animação"
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
