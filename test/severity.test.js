"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { assess, failsGate } = require("../src/qa/severity");

test("assess: saubere Seite → none / 100", () => {
  const a = assess({ consoleLogs: [], navOk: true, network: [] });
  assert.equal(a.level, "none");
  assert.equal(a.score, 100);
});

test("assess: Konsolen-Fehler → high", () => {
  const a = assess({ consoleLogs: [{ type: "error", text: "boom" }], navOk: true });
  assert.equal(a.level, "high");
  assert.ok(a.score < 100);
});

test("assess: 5xx-Netzwerkfehler → high (serverErrors gezählt)", () => {
  const a = assess({
    consoleLogs: [],
    navOk: true,
    network: [{ url: "http://x/api", status: 500 }],
  });
  assert.equal(a.level, "high");
  assert.equal(a.serverErrors, 1);
});

test("assess: 4xx-Netzwerkfehler → mindestens medium (clientErrors gezählt)", () => {
  const a = assess({
    consoleLogs: [],
    navOk: true,
    network: [{ url: "http://x/missing", status: 404 }],
  });
  assert.equal(a.clientErrors, 1);
  assert.ok(["medium", "high"].includes(a.level));
});

test("assess: nur Warnungen → low/medium, nie high", () => {
  const low = assess({ consoleLogs: [{ type: "warning", text: "w" }], navOk: true });
  assert.equal(low.level, "low");
  const med = assess({
    consoleLogs: [1, 2, 3].map(() => ({ type: "warning", text: "w" })),
    navOk: true,
  });
  assert.equal(med.level, "medium");
});

test("failsGate: respektiert Schwelle, ignoriert ungültige", () => {
  assert.equal(failsGate("high", "high"), true);
  assert.equal(failsGate("low", "high"), false);
  assert.equal(failsGate("high", "none"), false);
  assert.equal(failsGate("high", undefined), false); // --fail-on ohne Wert
});
