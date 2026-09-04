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
    "ae.anchor.align.preview": {
      id: "ae.anchor.align.preview",
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
    "ae.anchor.align": {
      id: "ae.anchor.align",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.anchor.align",
      undoLabels: {
        "en-US": "Moti.on: align anchor point",
        "pt-BR": "Moti.on: alinhar ponto de ancoragem"
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
    },
    "ae.keys.ease.apply": {
      id: "ae.keys.ease.apply",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.ease.apply",
      undoLabels: {
        "en-US": "Moti.on: apply ease",
        "pt-BR": "Moti.on: aplicar suavização"
      }
    },
    "ae.keys.reverse": {
      id: "ae.keys.reverse",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.reverse",
      undoLabels: {
        "en-US": "Moti.on: reverse keyframes",
        "pt-BR": "Moti.on: inverter keyframes"
      }
    },
    "ae.keys.reverse-values": {
      id: "ae.keys.reverse-values",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.reverse-values",
      undoLabels: {
        "en-US": "Moti.on: reverse keyframe values",
        "pt-BR": "Moti.on: inverter valores dos keyframes"
      }
    },
    "ae.keys.send-to-edge": {
      id: "ae.keys.send-to-edge",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.send-to-edge",
      undoLabels: {
        "en-US": "Moti.on: send keyframes to edge",
        "pt-BR": "Moti.on: enviar keyframes para a borda"
      }
    },
    "ae.style.neon": {
      id: "ae.style.neon",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.style.neon",
      undoLabels: {
        "en-US": "Moti.on: apply neon style",
        "pt-BR": "Moti.on: aplicar estilo neon"
      }
    },
    "ae.keys.clone": {
      id: "ae.keys.clone",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.clone",
      undoLabels: {
        "en-US": "Moti.on: duplicate keyframes",
        "pt-BR": "Moti.on: duplicar keyframes"
      }
    },
    "ae.time.controller": {
      id: "ae.time.controller",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.time.controller",
      undoLabels: {
        "en-US": "Moti.on: apply time controller",
        "pt-BR": "Moti.on: aplicar controlador de tempo"
      }
    },
    "ae.animate.kinetic": {
      id: "ae.animate.kinetic",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.animate.kinetic",
      undoLabels: {
        "en-US": "Moti.on: apply kinetic animation",
        "pt-BR": "Moti.on: aplicar animação kinetic"
      }
    },
    "ae.time.marker-loop": {
      id: "ae.time.marker-loop",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.time.markerLoop",
      undoLabels: {
        "en-US": "Moti.on: apply marker loop",
        "pt-BR": "Moti.on: aplicar loop por marcadores"
      }
    },
    "ae.animate.inertial": {
      id: "ae.animate.inertial",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.animate.inertial",
      undoLabels: {
        "en-US": "Moti.on: apply inertia",
        "pt-BR": "Moti.on: aplicar inércia"
      }
    },
    "ae.animate.jump": {
      id: "ae.animate.jump",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.animate.jump",
      undoLabels: {
        "en-US": "Moti.on: create jump",
        "pt-BR": "Moti.on: criar salto"
      }
    },
    "ae.keys.copy": {
      id: "ae.keys.copy",
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
    "ae.keys.paste": {
      id: "ae.keys.paste",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.keys.paste",
      undoLabels: {
        "en-US": "Moti.on: paste keyframes",
        "pt-BR": "Moti.on: colar keyframes"
      }
    },
    "ae.shape.library": {
      id: "ae.shape.library",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.shape.library",
      undoLabels: {
        "en-US": "Moti.on: create shape",
        "pt-BR": "Moti.on: criar forma"
      }
    },
    "ae.shape.trim-path": {
      id: "ae.shape.trim-path",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.shape.trimPath",
      undoLabels: {
        "en-US": "Moti.on: trim paths",
        "pt-BR": "Moti.on: cortar traçados"
      }
    },
    "ae.shape.break": {
      id: "ae.shape.break",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.shape.break",
      undoLabels: {
        "en-US": "Moti.on: break shape",
        "pt-BR": "Moti.on: separar formas"
      }
    },
    "ae.rig.effector": {
      id: "ae.rig.effector",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.rig.effector",
      undoLabels: {
        "en-US": "Moti.on: apply effector",
        "pt-BR": "Moti.on: aplicar effector"
      }
    },
    "ae.camera.transition": {
      id: "ae.camera.transition",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.camera.transition",
      undoLabels: {
        "en-US": "Moti.on: camera transition",
        "pt-BR": "Moti.on: transição de câmera"
      }
    },
    "ae.3d.cylinder": {
      id: "ae.3d.cylinder",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.3d.cylinder",
      undoLabels: {
        "en-US": "Moti.on: build cylinder",
        "pt-BR": "Moti.on: montar cilindro"
      }
    },
    "ae.3d.cube": {
      id: "ae.3d.cube",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.3d.cube",
      undoLabels: {
        "en-US": "Moti.on: build cube",
        "pt-BR": "Moti.on: montar cubo"
      }
    },
    "ae.effect.wave": {
      id: "ae.effect.wave",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.effect.wave",
      undoLabels: {
        "en-US": "Moti.on: apply wave",
        "pt-BR": "Moti.on: aplicar onda"
      }
    },
    "ae.effect.tile": {
      id: "ae.effect.tile",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.effect.tile",
      undoLabels: {
        "en-US": "Moti.on: tile layers",
        "pt-BR": "Moti.on: repetir camadas"
      }
    },
    "ae.effect.glitch": {
      id: "ae.effect.glitch",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.effect.glitch",
      undoLabels: {
        "en-US": "Moti.on: apply glitch",
        "pt-BR": "Moti.on: aplicar glitch"
      }
    },
    "ae.animate.parallax.quick": {
      id: "ae.animate.parallax.quick",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.animate.parallaxQuick",
      undoLabels: {
        "en-US": "Moti.on: create parallax rig",
        "pt-BR": "Moti.on: criar rig de parallax"
      }
    },
    "ae.3d.look-at": {
      id: "ae.3d.look-at",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.3d.lookAt",
      undoLabels: {
        "en-US": "Moti.on: look at target",
        "pt-BR": "Moti.on: encarar o alvo"
      }
    },
    "ae.3d.orbit": {
      id: "ae.3d.orbit",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.3d.orbit",
      undoLabels: {
        "en-US": "Moti.on: create orbit",
        "pt-BR": "Moti.on: criar órbita"
      }
    },
    "ae.effect.echo": {
      id: "ae.effect.echo",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.effect.echo",
      undoLabels: {
        "en-US": "Moti.on: apply echo",
        "pt-BR": "Moti.on: aplicar eco"
      }
    },
    "ae.comp.fast-edit.preview": {
      id: "ae.comp.fast-edit.preview",
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
    "ae.comp.fast-edit": {
      id: "ae.comp.fast-edit",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.comp.fastEdit",
      undoLabels: {
        "en-US": "Moti.on: edit composition",
        "pt-BR": "Moti.on: editar composição"
      }
    },
    "ae.vector.ai-to-vector": {
      id: "ae.vector.ai-to-vector",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.vector.aiToVector",
      undoLabels: {
        "en-US": "Moti.on: convert vector layer",
        "pt-BR": "Moti.on: converter camada de vetor"
      }
    },
    "ae.parallax.auto-focus": {
      id: "ae.parallax.auto-focus",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.parallax.autoFocus",
      undoLabels: {
        "en-US": "Moti.on: auto-focus parallax",
        "pt-BR": "Moti.on: focar parallax"
      }
    },
    "ae.parallax.wiggle": {
      id: "ae.parallax.wiggle",
      requirements: ["hasProject", "hasActiveComp", "expressionEngine"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.parallax.wiggle",
      undoLabels: {
        "en-US": "Moti.on: wiggle parallax",
        "pt-BR": "Moti.on: agitar parallax"
      }
    },
    "ae.parallax.zoom": {
      id: "ae.parallax.zoom",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.parallax.zoom",
      undoLabels: {
        "en-US": "Moti.on: zoom parallax",
        "pt-BR": "Moti.on: zoom no parallax"
      }
    },
    "ae.parallax.bake": {
      id: "ae.parallax.bake",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.parallax.bake",
      undoLabels: {
        "en-US": "Moti.on: bake parallax",
        "pt-BR": "Moti.on: bake parallax"
      }
    },
    "ae.vector.text-to-vector": {
      id: "ae.vector.text-to-vector",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.vector.textToVector",
      undoLabels: {
        "en-US": "Moti.on: apply text to vector",
        "pt-BR": "Moti.on: aplicar texto para vetor"
      }
    },
    "ae.effect.particles": {
      id: "ae.effect.particles",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.effect.particles",
      undoLabels: {
        "en-US": "Moti.on: apply particles",
        "pt-BR": "Moti.on: aplicar partículas"
      }
    },
    "ae.asset.texture": {
      id: "ae.asset.texture",
      requirements: ["hasProject", "hasActiveComp"],
      destructive: false,
      mutates: true,
      allowsNoopSuccess: false,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.asset.texture",
      undoLabels: {
        "en-US": "Moti.on: apply texture",
        "pt-BR": "Moti.on: aplicar textura"
      }
    },
    "ae.project.clean": {
      id: "ae.project.clean",
      requirements: ["hasProject"],
      destructive: true,
      mutates: true,
      allowsNoopSuccess: true,
      supportsDryRun: false,
      undoLabelKey: "undo.ae.project.clean",
      undoLabels: {
        "en-US": "Moti.on: clean project",
        "pt-BR": "Moti.on: limpar projeto"
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
