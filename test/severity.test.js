"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { assess, failsGate } = require("../src/qa/severity");
const { loadConfig } = require("../src/config");

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

test("assess: Findings senken Score mit einheitlichen Gewichten", () => {
  const a = assess({
    consoleLogs: [],
    navOk: true,
    findings: [
      { severity: "high", message: "Blocker" },
      { severity: "medium", message: "Warnung" },
      { severity: "low", message: "Hinweis" },
    ],
  });
  assert.equal(a.level, "high");
  assert.equal(a.score, 50);
  assert.deepEqual(a.findings, { high: 1, medium: 1, low: 1 });
});

test("config: qa.thresholds werden tief gemerged und überschreibbar", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cue-config-thresholds-"));
  fs.writeFileSync(
    path.join(root, "cue.config.json"),
    JSON.stringify({ qa: { thresholds: { web: { temporal: { maxJump: 25 } }, game: { startTimeoutMs: 20000 } } } })
  );
  const cfg = loadConfig({ root });
  assert.equal(cfg.qa.thresholds.web.temporal.maxJump, 25);
  assert.equal(cfg.qa.thresholds.web.temporal.minMotion, 0.35);
  assert.equal(cfg.qa.thresholds.game.startTimeoutMs, 20000);
  fs.rmSync(root, { recursive: true, force: true });
});


test("failsGate: respektiert Schwelle, ignoriert ungültige", () => {
  assert.equal(failsGate("high", "high"), true);
  assert.equal(failsGate("low", "high"), false);
  assert.equal(failsGate("high", "none"), false);
  assert.equal(failsGate("high", undefined), false); // --fail-on ohne Wert
});
