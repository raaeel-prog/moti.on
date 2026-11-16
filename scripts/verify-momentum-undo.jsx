// Undo da coleção Impulso em chamadas separadas, como um usuário faria:
// rode três vezes com o AE aberto: AfterFX.exe -r "<repo>\scripts\verify-momentum-undo.jsx"
//   1ª: cria a comp de QA e aplica o Pêndulo (Ambos) numa camada com comentário e marcador do usuário;
//   2ª: executa Editar > Desfazer uma vez;
//   3ª: confere que a camada voltou ao original, grava o resultado e remove a comp.
// O After Effects tem uma única pilha de Desfazer por projeto: rode apenas num
// projeto novo e vazio, sem mexer nele entre as chamadas.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/momentum-verify");
  if (!out.exists) out.create();
  var state = $.global.motionMomentumUndo;
  function write(name, data) { var f = new File(out.fsName + "/" + name); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(data)); f.close(); }
  if (!state) {
    if (app.project.file !== null || app.project.numItems !== 0) { write("undo-step1.json", {step: 1, error: "Abra um projeto novo e vazio: o Desfazer é do projeto inteiro."}); return; }
    $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx"));
    var comp = app.project.items.addComp("Moti.on QA Impulso Undo", 1920, 1080, 1, 5, 30); comp.openInViewer();
    try {
    var l = comp.layers.addSolid([.2, .5, .9], "Undo", 200, 200, 1, 5); l.comment = "original"; l.selected = true;
    l.property("ADBE Marker").setValueAtTime(2, new MarkerValue("User cue"));
    var p = null, i; for (i = 0; i < MotionLibraryCatalog.length; i++) if (MotionLibraryCatalog[i].id === "momentum-pendulum") p = MotionLibraryCatalog[i];
    var args = {presetId: p.id, phase: "both", direction: "preset", durationFrames: 40, intensity: 100, staggerFrames: 0, unit: "preset"};
    for (var k in p.defaults) if (p.defaults.hasOwnProperty(k)) args[k] = p.defaults[k];
    args.presetId = p.id; args.phase = "both";
    // The command acts on the active comp: never send unless it is this QA comp.
    if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado.");
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({protocolVersion: 1, requestId: "momentum-undo", command: "ae.presets.phase-apply", args: args, context: {host: "after-effects", hostVersion: app.version, locale: "pt-BR"}, options: {preserveSelection: true}})));
    $.global.motionMomentumUndo = {step: 1, compId: comp.id, applied: r.ok, effects: l.property("ADBE Effect Parade").numProperties};
    write("undo-step1.json", $.global.motionMomentumUndo);
    } catch (setupError) { comp.remove(); write("undo-step1.json", {step: 1, error: String(setupError)}); }
    return;
  }
  if (state.step === 1) {
    // Undo the apply only if it is still the last change: the layer still holds its controls.
    var qa = null; for (var q = 1; q <= app.project.numItems; q++) if (app.project.item(q).id === state.compId) qa = app.project.item(q);
    if (!qa) { write("undo-step2.json", {step: 2, error: "comp de QA ausente"}); $.global.motionMomentumUndo = undefined; return; }
    qa.openInViewer(); if (app.project.activeItem !== qa) { write("undo-step2.json", {step: 2, error: "comp de QA não ficou ativa"}); return; }
    if (app.project.numItems !== 1 || qa.layer(1).property("ADBE Effect Parade").numProperties !== state.effects) { write("undo-step2.json", {step: 2, error: "o projeto mudou desde a aplicação; nada foi desfeito"}); $.global.motionMomentumUndo = undefined; return; }
    app.executeCommand(16); state.step = 2; write("undo-step2.json", {step: 2}); return;
  }
  var target = null; for (var j = 1; j <= app.project.numItems; j++) if (app.project.item(j).id === state.compId) target = app.project.item(j);
  var layer = target && target.layer(1), markers = layer && layer.property("ADBE Marker"), tr = layer && layer.property("ADBE Transform Group");
  var result = {host: app.version, appliedBeforeUndo: state.applied, effectsBeforeUndo: state.effects,
    effectsAfterUndo: layer ? layer.property("ADBE Effect Parade").numProperties : null, comment: layer ? layer.comment : null,
    markers: markers ? markers.numKeys : null, userCue: markers && markers.numKeys === 1 ? markers.keyValue(1).comment : null,
    expressions: tr ? [tr.property("ADBE Position").expression, tr.property("ADBE Rotate Z").expression, tr.property("ADBE Opacity").expression].join("") : null};
  result.status = state.applied && state.effects > 0 && result.effectsAfterUndo === 0 && result.comment === "original" && result.markers === 1 && result.userCue === "User cue" && result.expressions === "" ? "PASS" : "FAIL";
  write("undo-result.json", result);
  if (target) target.remove();
  $.global.motionMomentumUndo = undefined;
})();
