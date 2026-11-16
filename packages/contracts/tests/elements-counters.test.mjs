import test from "node:test";
import assert from "node:assert/strict";

import { MOTION_ELEMENTS, elementCounterText, elementInsertError, elementTextRoles, resolveElementArgs } from "../dist/index.js";

const counters = MOTION_ELEMENTS.filter(element => element.kind === "counter");
const counterOf = element => element.layers.find(layer => layer.type === "text" && layer.counter).counter;

test("timers and counters are six oneshot elements with exactly one counter text", () => {
  assert.deepEqual(counters.map(element => element.id), ["countdown-ring", "stopwatch", "stat-count", "percent-bar", "rating", "follower-ticker"]);
  for (const element of counters) {
    assert.equal(element.timing, "oneshot", element.id);
    assert.equal(element.layers.filter(layer => layer.type === "text" && layer.counter).length, 1, element.id);
    const counter = counterOf(element);
    assert.ok(["clock", "number"].includes(counter.format), element.id);
    assert.ok(Number.isFinite(counter.from) && Number.isFinite(counter.to) && counter.from !== counter.to, element.id);
    assert.ok(Number.isInteger(counter.decimals) && counter.decimals >= 0 && counter.decimals <= 3, element.id);
    if (counter.span) assert.ok(counter.span[0] >= 0 && counter.span[0] < counter.span[1] && counter.span[1] <= 1, element.id);
    assert.equal(elementInsertError({ elementId: element.id }), null, element.id);
  }
  for (const element of MOTION_ELEMENTS.filter(element => element.kind !== "counter")) {
    assert.ok(element.layers.every(layer => layer.type !== "text" || !layer.counter), `${element.id} is not a counter`);
  }
});

test("a counter text is not a typed role, so the user cannot override it", () => {
  const stat = counters.find(element => element.id === "stat-count");
  assert.deepEqual(elementTextRoles(stat), ["subtitle"]);
  assert.deepEqual(Object.keys(resolveElementArgs({ elementId: "stat-count" }, "pt-BR").texts), ["subtitle"]);
  assert.equal(elementInsertError({ elementId: "stat-count", texts: { title: "999" } }), "texts.title");
  assert.deepEqual(elementTextRoles(counters.find(element => element.id === "countdown-ring")), []);
});

test("clocks run one second per second, stop at End and show hours past an hour", () => {
  const down = { format: "clock", from: 10, to: 0, decimals: 0, ease: "linear" };
  assert.equal(elementCounterText(down, 0, 10, "pt-BR"), "00:10");
  assert.equal(elementCounterText(down, .2, 10, "pt-BR"), "00:10", "a countdown shows the second still running");
  assert.equal(elementCounterText(down, 1, 10, "pt-BR"), "00:09");
  assert.equal(elementCounterText(down, 9.5, 10, "pt-BR"), "00:01");
  assert.equal(elementCounterText(down, 30, 10, "pt-BR"), "00:00", "holds at End");
  const up = { format: "clock", from: 0, to: 30, decimals: 0, ease: "linear" };
  assert.equal(elementCounterText(up, 12.9, 30, "en-US"), "00:12");
  assert.equal(elementCounterText(up, 99, 30, "en-US"), "00:30");
  assert.equal(elementCounterText({ ...up, from: 3599, to: 3700 }, 2, 60, "pt-BR"), "1:00:01");
});

test("numbers follow the eased span with grouping, decimals, prefix and suffix in the session language", () => {
  const stat = counterOf(counters.find(element => element.id === "stat-count"));
  assert.equal(elementCounterText(stat, 0, 2.5, "pt-BR"), "0+");
  assert.equal(elementCounterText(stat, 2.5 * .8, 2.5, "pt-BR"), "1.000+", "finished at the end of the span");
  assert.equal(elementCounterText(stat, 2.5, 2.5, "en-US"), "1,000+");
  const rating = counterOf(counters.find(element => element.id === "rating"));
  assert.equal(elementCounterText(rating, 2, 2, "pt-BR"), "4,9");
  assert.equal(elementCounterText(rating, 2, 2, "en-US"), "4.9");
  const linear = { format: "number", from: 0, to: 12345.5, decimals: 1, prefix: "R$ ", suffix: " ok", ease: "linear" };
  assert.equal(elementCounterText(linear, .5, 1, "pt-BR"), "R$ 6.172,8 ok");
  assert.equal(elementCounterText({ ...linear, from: -0.04, to: -0.04, prefix: "", suffix: "" }, 0, 1, "pt-BR"), "0,0", "no negative zero");
  const values = [];
  for (let t = 0; t <= 1.0001; t += .05) values.push(Number(elementCounterText({ format: "number", from: 0, to: 100, decimals: 0, ease: "in-out" }, t, 1, "en-US")));
  assert.ok(values.every((v, i) => i === 0 || v >= values[i - 1]), "monotonic");
});
