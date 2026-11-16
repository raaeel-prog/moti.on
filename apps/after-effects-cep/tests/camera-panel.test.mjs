import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createCepDocument } from "./cep-dom.mjs";
import { createI18n } from "../../../packages/ui-core/dist/i18n.js";
import { cameraRecipe } from "../../../packages/contracts/dist/camera-presets.js";
import { cameraChoreography } from "../../../packages/contracts/dist/camera-choreography.js";

const built = await build({ entryPoints: [fileURLToPath(new URL("../client/src/camera-panel.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const ui = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const builtView = await build({ entryPoints: [fileURLToPath(new URL("../client/src/camera-choreography-view.ts", import.meta.url))], bundle: true, platform: "node", format: "esm", write: false });
const view = await import(`data:text/javascript;base64,${Buffer.from(builtView.outputFiles[0].text).toString("base64")}`);

function walk(node, out = []) { for (const child of node.children ?? []) { out.push(child); walk(child, out); } return out; }
const byId = (root, id) => walk(root).find((n) => n.id === id);
const press = (root, id) => { const host = byId(root, id); const button = host?.button ?? walk(host ?? { children: [] }).find((n) => n.tagName === "BUTTON") ?? host; button.click?.() ?? button.dispatchEvent?.({ type: "click" }); };

function setup(inspect, extras={}) {
  const doc = createCepDocument(), calls = [], statuses = [];
  const panel = ui.createCameraPanel(doc, {
    i18n: createI18n({ locale: "pt-BR" }),
    execute: async (command, args, options) => { calls.push({ command, args, options }); return command === "ae.camera.inspect" ? { ok: true, data: inspect(), warnings: [] } : { ok: true, data: {}, warnings: [] }; },
    error: () => "erro",
    status: (message, tone) => statuses.push([message, tone]),...extras
  });
  return { doc, panel, calls, statuses };
}
const shot = { id: "s1", presetId: "hero-push", start: 1, duration: 4, intensity: 80,
  shape: { kind: "move", dir: "to", curve: "silk", tr: [0, 0, 0.08], rot: [0, 0, 0], orb: [0, 0], lens: 1, dolly: 0, imp: [0, 0.2, 0, 1.2, 4], org: [6, 1847, 6, 0] } };

/** Single shots live in the second mode; choreographies are the default. */
async function shotsMode(f) { press(f.panel.element, "camera-mode-shots"); await new Promise((r) => setTimeout(r, 0)); }

test("as receitas aparecem por intenção e o preview projeta três planos", async () => {
  const f = setup(() => ({ rig: null, mode: "parallax", problem: "" }));
  await f.panel.refresh();
  await shotsMode(f);
  const cards = walk(f.panel.element).filter((n) => n.className === "ch-camera-card");
  assert.equal(cards.length, 11);
  const quads = ui.previewQuads(cameraRecipe("hero-push"), 0);
  assert.equal(quads.length, 3);
  quads.forEach((q) => assert.equal(q.length, 8));
});

test("aplicar envia a receita com intensidade, início e semente sem campos extras", async () => {
  const draft = { intent: "all", recipeId: "float-loop", intensity: 60, duration: null, start: "comp", direction: "from", seed: 7 };
  assert.deepEqual(ui.applyArgs(draft, cameraRecipe("float-loop")), { presetId: "float-loop", intensity: 60, startSeconds: 0, seed: 7 });
  assert.deepEqual(ui.applyArgs({ ...draft, recipeId: "hero-push", duration: 2.5, start: "now" }, cameraRecipe("hero-push")),
    { presetId: "hero-push", intensity: 60, durationSeconds: 2.5, direction: "from" });
  const f = setup(() => ({ rig: null, mode: "parallax", problem: "" }));
  await f.panel.refresh();
  await shotsMode(f);
  press(f.panel.actions, "camera-apply");
  await new Promise((r) => setTimeout(r, 0));
  const apply = f.calls.find((c) => c.command === "ae.camera.shot.apply");
  assert.deepEqual(apply.args, { presetId: "hero-push", intensity: 100 });
});

test("cena sem 3D bloqueia o aplicar e mostra o motivo do host", async () => {
  const f = setup(() => ({ rig: null, mode: "", problem: "Câmera: não há camadas 3D." }));
  await f.panel.refresh();
  assert.match(walk(f.panel.element).find((n) => (n.className ?? "").includes("ch-camera-status")).textContent, /camadas 3D/);
  const choreoApply = byId(f.panel.actions, "camera-choreo-apply");
  assert.ok(choreoApply.getAttribute?.("aria-disabled") === "true" || choreoApply.button?.disabled || choreoApply.disabled, "coreografia também bloqueada");
  await shotsMode(f);
  const apply = byId(f.panel.actions, "camera-apply");
  assert.ok(apply.getAttribute?.("aria-disabled") === "true" || apply.button?.disabled || apply.disabled, "aplicar fica desabilitado");
});

test("coreografias: cards com a cena real, rota das camadas e aplicar com as opções", async () => {
  const scene = view.SAMPLE_SCENE.scene.map((l) => ({ ...l, name: `${l.name} real` }));
  const f = setup(() => ({ rig: null, mode: "parallax", problem: "", scene, frame: view.SAMPLE_SCENE.frame }));
  await f.panel.refresh();
  const cards = walk(f.panel.element).filter((n) => (n.className ?? "").includes("ch-camera-card--choreo"));
  assert.equal(cards.length, 7);
  // Design system 2026-11: the options fold under the cards ("Ajustes  10 s · 100 %"), closed by default.
  const body = () => byId(f.panel.element, "camera-settings-body");
  assert.equal(body().hidden, true, "folded until asked");
  const toggle = byId(f.panel.element, "camera-settings-toggle");
  assert.match(toggle.getAttribute("aria-label"), /Ajustes: 10 s · 100 %/);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  press(f.panel.element, "camera-settings-toggle");
  assert.equal(body().hidden, false, "the fold opens in place");
  assert.equal(byId(f.panel.element, "camera-settings-toggle").getAttribute("aria-expanded"), "true");
  assert.ok(walk(f.panel.element).some((n) => n.id === "choreo-duration"), "the fold shows the options");
  assert.equal(walk(f.panel.element).filter((n) => (n.className ?? "").includes("ch-camera-card--choreo")).length, 7, "and the gallery stays");
  const route = walk(f.panel.element).find((n) => (n.className ?? "").includes("ch-camera-route"));
  assert.match(route.textContent, /Artista real/);
  assert.doesNotMatch(route.textContent, /Fundo real/, "o fundo não é visitado");
  press(f.panel.actions, "camera-choreo-apply");
  await new Promise((r) => setTimeout(r, 0));
  const apply = f.calls.find((c) => c.command === "ae.camera.choreography.apply");
  // The order comes from the choreography, and the deep start's default (Z +2500) is the host's: neither is sent.
  assert.deepEqual(apply.args, { choreographyId: "deep-reveal", intensity: 100, order: "auto", layers: "auto", focus: true, motionBlur: true, life: true });
});

test("coreografia aplicada aparece como uma linha, ajusta a intensidade e sai inteira", async () => {
  const beat = (id, role) => ({ ...shot, id, presetId: "layer-tour", group: "c1", role, start: Number(id.slice(1)), duration: 1,
    shape: { ...shot.shape, kind: "visit", vis: [540, 960, 0, 3000, 540, 960, 0, 0] } });
  const f = setup(() => ({ rig: { rigId: "camera-1", mode: "parallax", shots: [beat("s1", "home"), beat("s2", "subject"), beat("s3", "life"), shot], maxShots: 24 }, mode: "parallax", problem: "" }));
  await f.panel.refresh();
  const rows = walk(f.panel.element).filter((n) => /^ch-camera-shot( |$)/.test(n.className ?? ""));
  assert.equal(rows.length, 2, "uma linha para a coreografia e uma para o shot avulso");
  assert.match(rows[0].textContent, /Tour pelas camadas · 1–4 s · 2 passos/);
  rows[0].click?.() ?? rows[0].dispatchEvent({ type: "click" });
  press(f.panel.actions, "camera-group-update");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.calls.find((c) => c.command === "ae.camera.shot.adjust").args, { shotId: "s1", intensity: 80 });
  press(f.panel.actions, "camera-group-remove");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(f.calls.find((c) => c.command === "ae.camera.shot.remove").args, { groupId: "c1" });
});

test("a prévia da coreografia projeta as camadas, esconde as que ficam atrás da lente e os argumentos são mínimos", () => {
  const choreo = view.previewPlan(cameraChoreography("deep-reveal"), view.SAMPLE_SCENE, { order: "back-to-front", maxSubjects: 0 });
  const start = view.previewLayers(view.SAMPLE_SCENE, choreo.shots, 0), end = view.previewLayers(view.SAMPLE_SCENE, choreo.shots, 9.9);
  assert.ok(start.length < end.length, "a abertura começa com camadas atrás da câmera");
  assert.equal(end.length, 4, "no layout todas aparecem");
  end.forEach((entry) => assert.equal(entry.length, 9));
  assert.deepEqual(view.choreographyArgs({ id: "layer-tour", duration: 14, start: "comp", order: "reading", layers: "selection", maxSubjects: 2,
    focus: false, motionBlur: false, life: false, intensity: 60 }),
  { choreographyId: "layer-tour", intensity: 60, order: "reading", layers: "selection", focus: false, motionBlur: false, life: false,
    durationSeconds: 14, startSeconds: 0, maxSubjects: 2 });
  // The depth field belongs to the choreographies that open from the back; only a depth other than 2500 px travels.
  assert.equal(view.opensDeep(cameraChoreography("deep-reveal")), true);
  assert.equal(view.opensDeep(cameraChoreography("layer-tour")), false);
  const base = { id: "deep-reveal", duration: null, start: "now", order: "auto", layers: "auto", maxSubjects: 0, focus: true, motionBlur: true, life: true, intensity: 100 };
  assert.equal(view.choreographyArgs({ ...base, depth: 2500 }).depth, undefined);
  assert.equal(view.choreographyArgs({ ...base, depth: 1800 }).depth, 1800);
  // At 1200 px the title would sit 133 px from the lens: the card shows the nearest clean depth, short of it.
  const shallow = view.previewPlan(cameraChoreography("deep-reveal"), view.SAMPLE_SCENE, { order: "auto", maxSubjects: 0, depth: 1200 });
  assert.ok(shallow.plan.depth > 0 && shallow.plan.depth <= 1200, `the card previews the depth asked for, or short of a wall: ${shallow.plan.depth}`);
  assert.deepEqual(shallow.plan.warnings, ["depth-adjusted"]);
});

test("shot preview uses the current intensity, duration, direction and loop seed",()=>{
  const recipe=cameraRecipe("hero-push"), draft={intensity:40,duration:2,direction:"from",seed:7};
  const shot=ui.previewShot(recipe,1,draft);
  assert.equal(shot.amount,0.4);assert.equal(shot.dur,2);assert.equal(shot.dir,"from");
  const loop=ui.previewShot(cameraRecipe("float-loop"),1,{...draft,duration:9});
  assert.equal(loop.org[1],7);assert.equal(loop.org[0],4.5);
  assert.notDeepEqual(ui.previewQuads(recipe,1,draft),ui.previewQuads(recipe,1));
  assert.equal(ui.previewQuads(recipe,1,draft,view.SAMPLE_SCENE).length,4,"real scene geometry replaces sample planes");
});

test("older camera inspect response cannot replace a newer selection snapshot",async()=>{
  const pending=[];
  const f=setup(()=>({}),{execute:()=>new Promise(resolve=>pending.push(resolve))});
  const first=f.panel.refresh(),second=f.panel.refresh();
  pending[1]({ok:true,data:{rig:null,mode:"",problem:"Current selection"},warnings:[]});await second;
  pending[0]({ok:true,data:{rig:null,mode:"",problem:"Old selection"},warnings:[]});await first;
  assert.equal(f.panel.reason.textContent, "Current selection");
});

test("choreography preview uses duration intensity and organic breathing options",()=>{
  const recipe=cameraChoreography("layer-tour"), base={order:"back-to-front",maxSubjects:0,duration:8,intensity:0,life:false};
  const still=view.previewPlan(recipe,view.SAMPLE_SCENE,base);
  assert.ok(still.shots.every(s=>s.amount===0));
  assert.ok(Math.max(...still.shots.map(s=>s.start+s.dur))<=8.001);
  const moving=view.previewPlan(recipe,view.SAMPLE_SCENE,{...base,intensity:100,life:true});
  assert.equal(moving.shots.length,still.shots.length+1);
});

test("camera previews stop for reduced motion, hidden views and dispose",async()=>{
  const pending=new Map(),cancelled=[];let next=0;
  const f=setup(()=>({rig:null,mode:"parallax",problem:""}),{
    frame:fn=>{pending.set(++next,fn);return next;},cancelFrame:id=>{cancelled.push(id);pending.delete(id);}
  });
  await f.panel.refresh();await shotsMode(f);
  const card=walk(f.panel.element).find(n=>n.className==="ch-camera-card");
  f.doc.documentElement.setAttribute("data-reduced-motion","true");
  card.emit("mouseenter");assert.equal(pending.size,0,"internal reduced motion blocks animation");
  f.doc.documentElement.removeAttribute("data-reduced-motion");
  f.doc.defaultView={matchMedia:()=>({matches:true})};
  card.emit("mouseenter");assert.equal(pending.size,0,"system reduced motion also blocks animation");
  f.doc.defaultView={matchMedia:()=>({matches:false})};
  card.emit("mouseenter");assert.equal(pending.size,1);
  f.doc.hidden=true;f.doc.emit("visibilitychange");assert.equal(pending.size,0);
  f.doc.hidden=false;card.emit("mouseenter");assert.equal(pending.size,1);
  f.panel.element.hidden=true;
  const [handle,tick]=[...pending][0];pending.delete(handle);tick(50);
  assert.equal(pending.size,0,"an inactive view cannot keep requesting frames");
  f.panel.element.hidden=false;card.emit("mouseenter");f.panel.dispose();assert.equal(pending.size,0);assert.ok(cancelled.length);
});

test("shots listados podem ser ajustados, removidos e o rig exige confirmação para sair", async () => {
  const f = setup(() => ({ rig: { rigId: "camera-1", mode: "parallax", shots: [shot], maxShots: 12 }, mode: "parallax", problem: "" }));
  await f.panel.refresh();
  await shotsMode(f);
  const row = walk(f.panel.element).find((n) => n.className === "ch-camera-shot");
  assert.match(row.textContent, /Hero Push/);
  row.click?.() ?? row.dispatchEvent({ type: "click" });
  press(f.panel.actions, "camera-update");
  await new Promise((r) => setTimeout(r, 0));
  const adjust = f.calls.find((c) => c.command === "ae.camera.shot.adjust");
  assert.deepEqual(adjust.args, { shotId: "s1", intensity: 80, startSeconds: 1, durationSeconds: 4, tr: [0, 0, 0.08], rot: [0, 0, 0], curve: "silk" });
  press(f.panel.actions, "camera-remove");
  assert.equal(f.calls.filter((c) => c.command === "ae.camera.remove").length, 0, "o primeiro clique só arma");
  press(f.panel.actions, "camera-remove");
  await new Promise((r) => setTimeout(r, 0));
  const remove = f.calls.find((c) => c.command === "ae.camera.remove");
  assert.deepEqual(remove.options, { allowDestructive: true });
});

test("choreography cards carry the design-system scene icon and replay its move on hover", async () => {
  const f = setup(() => ({ rig: null, mode: "parallax", problem: "" }));
  await f.panel.refresh();
  const cards = walk(f.panel.element).filter((n) => (n.className ?? "").includes("ch-camera-card--choreo"));
  const moves = cards.map((card) => walk(card).find((n) => n.className === "ch-camera-rig")?.getAttribute("data-move"));
  assert.deepEqual(moves, ["reveal", "tour", "seq", "zooms", "trav", "orbit", "dive"]);
  const rig = walk(cards[0]).find((n) => n.className === "ch-camera-rig");
  assert.equal(walk(rig).filter((n) => String(n.className).includes("ch-camera-rig__plane")).length, 3, "back, middle and front planes");
  cards[0].emit("mouseenter");
  assert.equal(rig.getAttribute("data-play"), "true");
});
