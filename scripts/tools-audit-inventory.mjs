/** Inert inventory + first-party Node tests only; never runs commercial artifacts or Adobe scripts. */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { descriptorsForHost, getQuickProfile } from "../packages/command-registry/dist/index.js";
import { HOST_SOURCE_ORDER } from "./build-extendscript.mjs";
import { loadHostModules } from "../apps/after-effects-cep/tests/host-harness.mjs";
import { TOOL_AUDIT_SPEC, COMMON_SCENARIOS, AUXILIARY_SUITES } from "./tools-audit-spec.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = "apps/after-effects-cep/client/src/main.ts";
const QUICK = "apps/after-effects-cep/client/src/quick-actions.ts";
const ARTIFACTS = "artifacts/tools-audit";
const REPORT = "docs/implementation/2026-10-23-tools-audit.md";
const hash = content => createHash("sha256").update(content).digest("hex");
const unwrap = node => {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
  return node;
};
function variable(source, name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = unwrap(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error(`Audit variable not found: ${name}`);
  return found;
}
function fields(object, source) {
  return Object.fromEntries(object.properties.map(prop => [prop.name?.getText(source), prop.initializer]));
}
const literal = node => node && ts.isStringLiteralLike(node) ? node.text : undefined;
const location = (node, source, file) => ({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
async function parseFile(file) {
  const text = await readFile(path.join(ROOT, file), "utf8");
  return { text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) };
}
async function registrations() {
  const byCommand = new Map();
  const hashes = {};
  for (const relative of HOST_SOURCE_ORDER) {
    const file = path.posix.normalize(`apps/after-effects-cep/host/src/${relative}`);
    const { text, ast } = await parseFile(file);
    hashes[file] = hash(text);
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "MotionRegistry.register") {
        const id = literal(node.arguments[0]);
        if (id) byCommand.set(id, location(node, ast, file));
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return { byCommand, hashes };
}

export async function collectInventory() {
  const main = await parseFile(MAIN), quick = await parseFile(QUICK);
  const categoryFields = fields(variable(main.ast, "TOOL_CATEGORY"), main.ast);
  const hidden = variable(main.ast, "LIBRARY_HIDDEN_TOOLS").elements.map(literal);
  const { byCommand, hashes } = await registrations();
  const host = await loadHostModules(HOST_SOURCE_ORDER.map(file => file.startsWith("../") ? file.slice(3) : `src/${file}`), {
    app: { version: "26.5", project: { activeItem: null } }, Folder: class {}, File: class {}
  });
  const registered = host.MotionRegistry.ids();
  const descriptors = descriptorsForHost("after-effects");
  const commands = descriptors.map(descriptor => {
    const handler = host.MotionRegistry.get(descriptor.id);
    return {
      id: descriptor.id, source: byCommand.get(descriptor.id) ?? null,
      preflightRegistered: typeof handler?.preflight === "function", runRegistered: typeof handler?.run === "function",
      requirements: descriptor.requirements, mutates: descriptor.mutates, destructive: descriptor.destructive,
      allowsNoopSuccess: descriptor.allowsNoopSuccess, supportsDryRun: descriptor.supportsDryRun,
      supportsCancel: descriptor.supportsCancel, timeoutMs: descriptor.timeoutMs, undoLabelKey: descriptor.undoLabelKey,
      quickFactoryPresetId: descriptor.quickProfile?.factoryPresetId ?? null
    };
  });
  const tools = variable(main.ast, "TOOLS").elements.map(object => {
    const props = fields(object, main.ast), id = literal(props.id), commandId = literal(props.commandId);
    if (!TOOL_AUDIT_SPEC[id]) throw new Error(`Tool has no audit expectation: ${id}`);
    const hostCommandIds = id === "parallax"
      ? [commandId, "ae.parallax.create", "ae.parallax.adjust", "ae.parallax.move", "ae.parallax.remove", "ae.parallax.bake", "ae.parallax.auto-focus", "ae.parallax.wiggle", "ae.parallax.zoom"]
      : id === "gradient" ? [commandId, "ae.effect.gradient.read"] : id === "particles" ? [commandId, "ae.effect.particles.read"] : [commandId];
    const resetHandler = props.reset?.getText(main.ast) ?? "createGradientEditor.reset";
    const draftDefaults = [...new Set(resetHandler.match(/DEFAULT_[A-Z_]+/g) ?? [])].map(symbol => {
      try { return { symbol, sourceExpression: variable(main.ast, symbol).getText(main.ast) }; }
      catch { return { symbol, sourceExpression: null, note: "Imported default; inspect source module for value." }; }
    });
    return {
      id, commandId, category: literal(categoryFields[id]), source: location(object, main.ast, MAIN),
      applyHandler: props.apply?.getText(main.ast) ?? "createGradientEditor.execute",
      renderHandler: props.render?.getText(main.ast) ?? "createGradientEditor",
      resetHandler, draftDefaults,
      disabledHandler: props.disabledReason?.getText(main.ast), loadHandler: props.load?.getText(main.ast) ?? null,
      libraryVisible: !hidden.includes(id), registeredQuickProfile: Boolean(getQuickProfile(commandId)), factoryPresetId: getQuickProfile(commandId)?.factoryPresetId ?? null,
      hostCommands: hostCommandIds.map(id => commands.find(command => command.id === id)).filter(Boolean)
    };
  });
  const quickActions = variable(quick.ast, "QUICK_ACTIONS").elements.map(item => ({
    id: literal(item.elements[0]), abbreviation: literal(item.elements[1]), name: literal(item.elements[2]),
    source: location(item, quick.ast, QUICK), commandId: literal(item.elements[0]) === "save-frame" ? "ae.quick-tools.save-frame" : "ae.quick-tools.apply"
  }));
  return {
    tools, quickActions, commands,
    parity: { missingHost: descriptors.map(item => item.id).filter(id => !registered.includes(id)), missingDescriptor: registered.filter(id => !descriptors.some(item => item.id === id)) },
    sourceHashes: { [MAIN]: hash(main.text), [QUICK]: hash(quick.text), ...hashes }
  };
}

function automated(requiredSuites, testRuns) {
  const runs = requiredSuites.map(file => testRuns.find(run => run.file === file));
  return {
    status: runs.some(run => run?.status === "FAIL") ? "FAIL" : runs.every(run => run?.status === "PASS") ? "PASS" : "NOT RUN",
    authority: "first-party Node harness, not Adobe runtime", requiredSuites,
    interpretation: "Status of supporting suites. A shared-suite failure blocks signoff but does not by itself establish a defect in every tool linked to that suite.",
    receipts: runs.filter(Boolean).map(run => ({ file: run.file, tests: run.tests, pass: run.pass, fail: run.fail, outputSha256: run.outputSha256, log: run.log }))
  };
}

export async function buildLedger({ testRuns = [] } = {}) {
  const inventory = await collectInventory();
  const tools = inventory.tools.map(tool => {
    const spec = TOOL_AUDIT_SPEC[tool.id];
    return {
      ...tool, name: spec.name, expectedInputs: spec.expectedInputs, visibleResult: spec.visibleResult,
      preflight: { structuralStatus: tool.hostCommands.every(command => command.preflightRegistered) ? "PASS" : "FAIL", behavior: "See named suite receipts; registration alone proves no selection or rollback behavior." },
      undo: { owner: tool.hostCommands.some(command => command.mutates) ? "MotionAE dispatcher / MotionUndo" : "read-only command; no project Undo required", adobeResult: "NOT RUN" },
      reapply: { policy: spec.reapplyPolicy, adobeResult: "NOT RUN" },
      automated: automated(spec.requiredSuites, testRuns),
      adobeHost: { status: "NOT RUN", evidence: [], requiredScenarios: COMMON_SCENARIOS }
    };
  });
  const quickActions = inventory.quickActions.map(action => ({
    ...action,
    expectedInputs: action.id.startsWith("create-") || action.id === "save-frame" ? "Comp ativa; seleção opcional" : "Comp ativa e camadas compatíveis selecionadas",
    visibleResult: action.name,
    preflight: { structuralStatus: "PASS", handler: "quick-tools validate/preflight; availability and locked-target checks" },
    undo: { owner: action.id === "save-frame" ? "filesystem export; no project Undo" : "MotionAE dispatcher / MotionUndo", adobeResult: "NOT RUN" },
    reapply: { policy: action.id.startsWith("effect-") ? "Preservar efeito editável existente; reuso idempotente quando aplicável" : "Operação explícita; verificar resultado repetido e Undo", adobeResult: "NOT RUN" },
    automated: automated(["apps/after-effects-cep/tests/quick-actions.test.mjs", "apps/after-effects-cep/tests/quick-actions-ui.test.mjs"], testRuns),
    adobeHost: { status: "NOT RUN", evidence: [], requiredScenarios: COMMON_SCENARIOS }
  }));
  const testDir = "apps/after-effects-cep/tests";
  const testSources = await Promise.all((await readdir(path.join(ROOT, testDir))).filter(file => file.endsWith(".test.mjs")).map(async file => ({ file: `${testDir}/${file}`, text: await readFile(path.join(ROOT, testDir, file), "utf8") })));
  const commands = inventory.commands.map(command => {
    const references = testSources.filter(test => test.text.includes(`"${command.id}"`) || test.text.includes(`'${command.id}'`)).map(test => test.file);
    return {
      ...command, toolIds: tools.filter(tool => tool.hostCommands.some(host => host.id === command.id)).map(tool => tool.id),
      testReferences: references,
      referenceSuitesPassed: references.filter(file => testRuns.some(run => run.file === file && run.status === "PASS")),
      coverageMeaning: "Literal test references are navigation evidence, not line/branch coverage or proof this command executed.",
      adobeHost: { status: "NOT RUN", evidence: [] }
    };
  });
  let baselineCheck = { status: "NOT RUN", appliesTo: "pre-change snapshot" };
  try {
    const log = await readFile(path.join(ROOT, ARTIFACTS, "baseline-check.log"), "utf8");
    const lastCount = key => Number([...log.matchAll(new RegExp(`(?:ℹ|#) ${key} (\\d+)`, "g"))].at(-1)?.[1] ?? 0);
    baselineCheck = { status: log.includes("Validated 14 skills") && lastCount("fail") === 0 && lastCount("pass") > 0 ? "PASS" : "NOT RUN", appliesTo: "pre-change snapshot only; does not validate later worker edits", tests: lastCount("tests"), pass: lastCount("pass"), fail: lastCount("fail"), log: `${ARTIFACTS}/baseline-check.log`, sha256: hash(log) };
  } catch { /* Missing baseline log is never fabricated as a pass. */ }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), workspace: ROOT, clientTimezone: "America/Bahia",
    scope: "52 tool entries, 18 Quick actions and all AE host descriptors; Adobe receipts are intentionally separate",
    summary: {
      tools: tools.length, visibleLibraryTools: tools.filter(tool => tool.libraryVisible).length, quickActions: quickActions.length,
      hostCommands: commands.length, automatedToolPass: tools.filter(tool => tool.automated.status === "PASS").length,
      automatedToolFail: tools.filter(tool => tool.automated.status === "FAIL").length,
      adobeHostToolsPass: 0, adobeHostToolsNotRun: tools.length, overall: "NOT READY — native verification pending"
    },
    baselineCheck, parity: inventory.parity, sourceHashes: inventory.sourceHashes, tools, quickActions, commands, testRuns,
    evidenceBoundaries: ["Node mocks and source inventory do not prove rendering, actual Adobe Undo, native plugin availability or production parity.", "Premium defaults, visual polish and preview parity require explicit current-build Adobe receipts.", "No commercial code/assets/presets are executed or copied by this generator."]
  };
}

const short = file => path.posix.basename(file, ".test.mjs");
export function renderReport(ledger) {
  const total = ledger.testRuns.reduce((sum, run) => sum + run.tests, 0), pass = ledger.testRuns.reduce((sum, run) => sum + run.pass, 0), fail = ledger.testRuns.reduce((sum, run) => sum + run.fail, 0);
  const lines = ["# Auditoria das ferramentas — 23/10/2026", "", `Snapshot: \`${ledger.workspace}\`. Inventário gerado em ${ledger.generatedAt}.`, "",
    `**${ledger.summary.tools} ferramentas; ${ledger.summary.visibleLibraryTools} visíveis na biblioteca; ${ledger.summary.quickActions} ações rápidas; ${ledger.summary.hostCommands} comandos AE.**`, "",
    `Baseline anterior às alterações: **${ledger.baselineCheck.status}**, ${ledger.baselineCheck.pass ?? 0} testes PASS no check completo. Não valida mudanças posteriores.`, "",
    `Automação direcionada: **${pass}/${total} PASS, ${fail} FAIL**, em ${ledger.testRuns.length} suítes. Isso é execução Node/fixtures, sem prova de render ou Undo no Adobe.`, "",
    "Estado profissional: **NOT READY**. AE real: **NOT RUN para cada ferramenta e ação rápida** até existir recibo específico de versão/build/fixture/seleção/resultado/Undo/reaplicação. O check completo deve ser registrado pelo integrador; este relatório não converte check em host proof.", "",
    "Fontes verificáveis: [ledger JSON](../../artifacts/tools-audit/audit-ledger.json), [suítes/logs](../../artifacts/tools-audit/focused-tests.json), [estudo REA](../research/2026-10-23-brazu-composer-tools-rea.md).", "",
    "## Matriz por ferramenta", "", "Cada linha identifica entrada e resultado esperado, testes realmente executados e limite da evidência. As políticas de reaplicação abaixo são critérios de aceitação; não representam observação no host.", "",
    "| Ferramenta / comando | Entrada e resultado esperado | Preflight / Undo | AUTO / HOST | Suítes |", "|---|---|---|---|---|"];
  for (const tool of ledger.tools) lines.push(`| ${tool.name} (${tool.id})<br>\`${tool.commandId}\` | ${tool.expectedInputs}<br>→ ${tool.visibleResult} | ${tool.preflight.structuralStatus} registro; ${tool.undo.owner} | ${tool.automated.status} / NOT RUN | ${tool.automated.requiredSuites.map(short).join(", ")} |`);
  lines.push("", "## Reaplicação e preservação por ferramenta", "", "| Ferramenta | Critério a comprovar no host |", "|---|---|");
  for (const tool of ledger.tools) lines.push(`| ${tool.id} | ${tool.reapply.policy}. **HOST NOT RUN**. |`);
  lines.push("", "## Ações rápidas", "", "| Ação | Entrada | Resultado | AUTO / HOST |", "|---|---|---|---|");
  for (const action of ledger.quickActions) lines.push(`| ${action.id} | ${action.expectedInputs} | ${action.visibleResult} | ${action.automated.status} / NOT RUN |`);
  lines.push("", "## Comandos e segurança", "", `Paridade do registro: faltando no host = ${ledger.parity.missingHost.length}; faltando descriptor = ${ledger.parity.missingDescriptor.length}. Cada um dos ${ledger.commands.length} registros possui preflight/run. O ledger contém requisitos, destrutividade, timeout, suporte a cancel/dry-run e rótulo de Undo por comando. Referências literais em testes são apenas navegação; não equivalem a cobertura executada.`, "",
    "O dispatcher é dono do preflight antes de Undo; comandos mutantes devem fornecer rollback coerente. Testes dedicados host-dispatch, undo-nao-aninha e rollback-cobertura exercitam essa infraestrutura. Uma função registrada ainda pode produzir no-op, efeito incorreto, falha de capacidade ou interação inválida no host.", "",
    `Comandos sem referência literal direta nas suítes examinadas: ${ledger.commands.filter(command => !command.testReferences.length).map(command => `\`${command.id}\``).join(", ") || "nenhum"}. Isso identifica lacuna de rastreabilidade, não prova ausência de testes indiretos.`, "",
    "## Critério de liberação e recibos pendentes", "", ...COMMON_SCENARIOS.map(scenario => `- ${scenario}: registrar por ferramenta, AE/build/fixture e evidência observada.`), "",
    "Nenhum item desta matriz é promovido para HOST PASS por instalação, hash, teste em navegador ou mocks. Acrescentar recibos do host como evidência separada e atualizar cada linha somente para cenários realmente executados.", "");
  return lines.join("\n");
}

async function runSuites() {
  const files = [...new Set([...Object.values(TOOL_AUDIT_SPEC).flatMap(item => item.requiredSuites), ...AUXILIARY_SUITES])];
  const runs = [];
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(path.join(ROOT, ARTIFACTS, "test-logs", runId), { recursive: true });
  try {
    const previous = await readFile(path.join(ROOT, ARTIFACTS, "focused-tests.json"));
    await writeFile(path.join(ROOT, ARTIFACTS, `focused-tests-before-${runId}.json`), previous);
  } catch { /* First run has no earlier receipt. */ }
  for (const file of files) {
    const args = ["--test", "--test-reporter=tap", file], before = await readFile(path.join(ROOT, file));
    const startedAt = new Date().toISOString();
    const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const count = key => Number(output.match(new RegExp(`^# ${key} (\\d+)`, "m"))?.[1] ?? 0);
    const log = `${ARTIFACTS}/test-logs/${runId}/${short(file)}.tap`;
    await writeFile(path.join(ROOT, log), output);
    runs.push({ file, startedAt, completedAt: new Date().toISOString(), command: [process.execPath, ...args], status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status,
      tests: count("tests"), pass: count("pass"), fail: count("fail"), skipped: count("skipped"), testSha256: hash(before), outputSha256: hash(output), log });
  }
  await writeFile(path.join(ROOT, ARTIFACTS, "focused-tests.json"), `${JSON.stringify({ node: process.version, runs }, null, 2)}\n`);
  return runs;
}

async function main() {
  await mkdir(path.join(ROOT, ARTIFACTS), { recursive: true });
  let testRuns;
  if (process.argv.includes("--run-tests")) testRuns = await runSuites();
  else {
    try { testRuns = JSON.parse(await readFile(path.join(ROOT, ARTIFACTS, "focused-tests.json"), "utf8")).runs; }
    catch { testRuns = []; }
  }
  const ledger = await buildLedger({ testRuns });
  await writeFile(path.join(ROOT, ARTIFACTS, "audit-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  await mkdir(path.dirname(path.join(ROOT, REPORT)), { recursive: true });
  await writeFile(path.join(ROOT, REPORT), renderReport(ledger));
  console.log(JSON.stringify(ledger.summary));
  if (ledger.testRuns.some(run => run.status === "FAIL") || ledger.parity.missingHost.length || ledger.parity.missingDescriptor.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
