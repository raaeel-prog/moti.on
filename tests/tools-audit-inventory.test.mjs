import test from "node:test";
import assert from "node:assert/strict";
import { collectInventory, buildLedger } from "../scripts/tools-audit-inventory.mjs";

test("audit inventory covers every real tool, Quick action and registered host command", async () => {
  const inventory = await collectInventory();
  assert.equal(inventory.tools.length, 52);
  assert.equal(inventory.quickActions.length, 18);
  assert.equal(inventory.commands.length, 107);
  assert.equal(new Set(inventory.tools.map(item => item.id)).size, 52);
  assert.deepEqual(inventory.parity.missingHost, []);
  assert.deepEqual(inventory.parity.missingDescriptor, []);
  assert.ok(inventory.commands.every(item => item.preflightRegistered && item.runRegistered));
  assert.ok(inventory.tools.every(item => item.hostCommands.length && item.source.line > 0));
});

test("missing receipts cannot turn structural coverage into automated or Adobe-host proof", async () => {
  const ledger = await buildLedger({ testRuns: [] });
  assert.equal(ledger.summary.automatedToolPass, 0);
  assert.ok(ledger.tools.every(item => item.automated.status === "NOT RUN"));
  assert.ok(ledger.tools.every(item => item.adobeHost.status === "NOT RUN"));
  assert.ok(ledger.quickActions.every(item => item.adobeHost.status === "NOT RUN"));
  assert.ok(ledger.commands.every(item => item.adobeHost.status === "NOT RUN"));
  assert.ok(ledger.tools.every(item => item.expectedInputs && item.visibleResult && item.reapply.policy));
  assert.ok(ledger.tools.every(item => item.automated.requiredSuites.length));
});
