// Verificação real dos Elementos (`ae.elements.insert`) no After Effects.
// Rodar com o AE já aberto e o projeto do usuário salvo:
//   AfterFX.exe -r "<repo>\scripts\verify-elements.jsx"
// Carrega o host compilado (dist), cria uma comp de QA e, no fim, remove todo
// item de projeto que não existia antes (comps, pastas, sons, sólidos). O
// projeto não é salvo. Cada comando só é enviado com a comp de QA ativa.
// Saída: artifacts\elements-verify\result.json e PNGs. Requer `npm run build`.
(function () {
  var repo = File($.fileName).parent.parent.fsName, out = new Folder(repo + "/artifacts/elements-verify");
  if (!out.exists) out.create();
  var results = { host: app.version, build: app.buildName, os: $.os, startedAt: new Date().toString(), tests: [], elements: {} };
  var previous = app.project.activeItem, comp = null, serial = 0, before = {}, probe = null, probeSlider = null;
  for (var b = 1; b <= app.project.numItems; b++) before[app.project.item(b).id] = true;
  function save() { var f = new File(out.fsName + "/result.json"); f.encoding = "UTF-8"; f.open("w"); f.write(MotionJson.stringify(results)); f.close(); }
  function assert(value, message) { if (!value) throw new Error(message); }
  function test(name, fn) {
    try { var detail = fn(); results.tests.push({ name: name, status: "PASS", detail: detail || null }); }
    catch (e) { results.tests.push({ name: name, status: "FAIL", error: String(e), line: e.line || null }); }
  }
  function guard() { if (app.project.activeItem !== comp) comp.openInViewer(); if (app.project.activeItem !== comp) throw new Error("A comp de QA não está ativa; nada foi enviado."); }
  /** An open Moti.on panel may reload its installed host mid-run: load the build under test before every command. */
  function host() { $.evalFile(new File(repo + "/dist/after-effects-cep/host/index.jsx")); results.hostLoads = (results.hostLoads || 0) + 1; }
  function insert(args, time) {
    guard(); host();
    comp.time = time;
    var r = MotionJson.parse(MotionAE.dispatch(MotionJson.stringify({ protocolVersion: 1, requestId: "elements-" + (++serial), command: "ae.elements.insert",
      args: args, context: { host: "after-effects", hostVersion: app.version, locale: "pt-BR" }, options: { preserveSelection: true } })));
    assert(r.ok, args.elementId + ": " + MotionJson.stringify(r.error || r));
    return { response: r, layer: comp.layer(1) };
  }
  /** Average alpha of a layer over a comp region, after its effects and pre-comp. */
  function alpha(layer, center, radius, time) {
    probeSlider.expression = "thisComp.layer(" + MotionJson.stringify(layer.name) + ").sampleImage([" + center[0] + "," + center[1] + "],[" + radius[0] + "," + radius[1] + "],true,time)[3];";
    probeSlider.expressionEnabled = true;
    var v = probeSlider.valueAtTime(time, false); if (probeSlider.expressionError) throw new Error(probeSlider.expressionError); return v;
  }
  /** Every expression inside the pre-comp evaluates without error. */
  function expressionErrors(inner, time) {
    var errors = [];
    function walk(group, path) {
      for (var i = 1; i <= group.numProperties; i++) {
        var p = group.property(i);
        if (p.numProperties !== undefined && p.propertyType !== PropertyType.PROPERTY) { walk(p, path + "/" + p.name); continue; }
        var driven = false; try { driven = p.canSetExpression && p.expressionEnabled; } catch (none) { driven = false; }
        if (!driven) continue;
        p.valueAtTime(time, false);
        if (p.expressionError) errors.push(path + "/" + p.name + ": " + p.expressionError);
      }
    }
    for (var l = 1; l <= inner.numLayers; l++) walk(inner.layer(l), inner.layer(l).name);
    return errors;
  }
  function png(name, t) { var f = new File(out.fsName + "/" + name + ".png"); if (f.exists) f.remove(); comp.saveFrameToPng(t, f); return name; }
  var IDS = ["burst", "ring", "sparkle", "check", "arrow", "underline", "circle-draw", "lt-bar", "lt-line", "lt-tag", "title-pop", "title-rise", "title-frame"];
  var LOWER = { "lt-bar": true, "lt-line": true, "lt-tag": true };

  app.beginSuppressDialogs();
  try {
    host();
    comp = app.project.items.addComp("Moti.on QA Elementos", 1920, 1080, 1, 10, 30); comp.openInViewer();
    probe = comp.layers.addNull(10); probe.name = "sonda"; probe.enabled = false;
    probeSlider = probe.property("ADBE Effect Parade").addProperty("ADBE Slider Control").property(1);

    test("Cada elemento entra, aparece no repouso e sai sem erro de expressão", function () {
      var wrong = [];
      for (var i = 0; i < IDS.length; i++) {
        var id = IDS[i], made = insert({ elementId: id, sound: "none" }, 1), layer = made.layer, inner = layer.source;
        var d = inner.duration, oneshot = id === "burst" || id === "ring" || id === "sparkle";
        var center = LOWER[id] ? [480, 860] : [960, 540], radius = LOWER[id] ? [480, 160] : [420, 300];
        var start = alpha(layer, center, radius, 1), rest = alpha(layer, center, radius, 1 + (oneshot ? d * .45 : d / 2)), end = alpha(layer, center, radius, 1 + d - 1 / 30);
        var errors = expressionErrors(inner, d / 2);
        results.elements[id] = { start: start, rest: rest, end: end, controllers: made.response.data.controllers, errors: errors, png: png(id, 1 + (oneshot ? d * .45 : d / 2)) };
        if (errors.length) wrong.push(id + " expressões: " + errors.join("; "));
        if (!(rest > .0005)) wrong.push(id + " invisível no repouso (" + rest + ")");
        if (!oneshot && !(start < rest * .2)) wrong.push(id + " já visível no início (" + start + " de " + rest + ")");
        if (!(end < rest * .35)) wrong.push(id + " ainda visível no fim (" + end + " de " + rest + ")");
        layer.enabled = false;
      }
      assert(!wrong.length, wrong.join(" | "));
    });

    test("A caixa da tarja acompanha o texto substituído na camada pai", function () {
      var made = insert({ elementId: "lt-bar", texts: { title: "Ana" }, sound: "none" }, 0), layer = made.layer;
      // Expressions find layers by name: the copy needs its own.
      var copy = layer.duplicate(), overrides = copy.property("ADBE Layer Overrides"), title = null;
      copy.name = layer.name + " (texto longo)";
      for (var i = 1; i <= overrides.numProperties; i++) if (overrides.property(i).name === "Título") title = overrides.property(i);
      assert(title, "substituição Título ausente na camada pai");
      var doc = title.value; doc.text = "Ana Clara Souza Mendes da Silva"; title.setValue(doc);
      // Right of the short box and below the baseline (no descenders in the
      // text): only a box that followed the long text covers this point.
      var point = [134 + 22 + 360, 864], t = 2;
      var shortBox = alpha(layer, point, [6, 2], t), longBox = alpha(copy, point, [6, 2], t);
      copy.enabled = false; var shortPng = png("override-curto", t);
      layer.enabled = false; copy.enabled = true; var longPng = png("override-longo", t); copy.enabled = false;
      results.overrideBox = { shortBox: shortBox, longBox: longBox, png: [shortPng, longPng] };
      assert(shortBox < .1 && longBox > .5, "caixa curta " + shortBox + ", caixa com texto longo " + longBox);
    });

    test("O som entra na pré-comp e é importado uma vez", function () {
      var first = insert({ elementId: "check" }, 0), second = insert({ elementId: "lt-tag" }, 0), sounds = 0, audio = null;
      for (var i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); if (item instanceof FootageItem && item.file && item.file.name === "pop.wav") sounds++; }
      var inner = first.layer.source;
      for (var l = 1; l <= inner.numLayers; l++) if (inner.layer(l).hasAudio) audio = inner.layer(l);
      first.layer.enabled = false; second.layer.enabled = false;
      assert(sounds === 1, "pop.wav importado " + sounds + " vezes");
      assert(audio && first.layer.hasAudio, "pré-comp sem áudio");
      assert(first.response.data.importedSound === true && second.response.data.importedSound === false, "reuso do som");
      return { duration: audio.source.duration };
    });
  } catch (fatal) {
    results.fatal = String(fatal); results.line = fatal.line || null;
  } finally {
    // Remove everything this run created, comps first so footage and solids are unused.
    var created = [];
    for (var n = app.project.numItems; n >= 1; n--) { var it = app.project.item(n); if (!before[it.id]) created.push(it); }
    for (var pass = 0; pass < 3; pass++) for (var c = 0; c < created.length; c++) {
      var x = created[c]; if (!x) continue;
      var kind = x instanceof CompItem ? 0 : x instanceof FolderItem ? 2 : 1;
      if (kind !== pass) continue;
      try { x.remove(); created[c] = null; } catch (gone) { /* removed with its folder */ created[c] = null; }
    }
    if (previous instanceof CompItem) previous.openInViewer();
    app.endSuppressDialogs(false);
    var ok = 0; for (var t = 0; t < results.tests.length; t++) if (results.tests[t].status === "PASS") ok++;
    results.summary = { pass: ok, total: results.tests.length }; results.finishedAt = new Date().toString();
    save();
  }
})();
