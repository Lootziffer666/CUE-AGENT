"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const schema = require("../src/qa/verdict-schema.json");
const { buildVerdictReport, writeVerdict } = require("../src/qa/report");

const required = schema.required;

function assertVerdictShape(report) {
  for (const key of required) assert.ok(Object.prototype.hasOwnProperty.call(report, key), `${key} fehlt`);
  assert.strictEqual(report.schema, "cue.verdict/1");
  assert.strictEqual(report.tool, "cue-agent");
  assert.ok(["none", "low", "medium", "high"].includes(report.severity));
  assert.ok(report.score >= 0 && report.score <= 100);
  assert.ok(Array.isArray(report.checks));
  assert.ok(Array.isArray(report.findings));
  for (const check of report.checks) {
    assert.ok(Array.isArray(check.evidence));
    assert.ok(check.evidence.length > 0 || check.evidenceNote, `${check.id} braucht Evidence oder evidenceNote`);
  }
  for (const finding of report.findings) {
    assert.ok(Array.isArray(finding.evidence));
    assert.ok(finding.evidence.length > 0 || finding.evidenceNote, `${finding.category} braucht Evidence oder evidenceNote`);
  }
}

test("verdict-schema: buildVerdictReport normalisiert Pflichtfelder und Evidence-Regeln", () => {
  const report = buildVerdictReport({
    command: "playable-check",
    target: { kind: "url", value: "https://example.test", platform: "web" },
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    verdict: "BELEGBAR SPIELBAR",
    score: 101,
    severity: "none",
    checks: [
      { id: "startet", label: "Startet", ok: true, evidence: ["proof/start.png"] },
      { id: "bedienbar", label: "Bedienbar", ok: false, evidence: [] },
    ],
    findings: [{ severity: "high", category: "demo", message: "Befund ohne eigenes Artefakt", evidence: [] }],
    signals: { navOk: true },
    evidence: [{ path: "proof/start.png", kind: "screenshot", label: "Start" }],
    environment: { driver: "web" },
    exitCode: 0,
  });

  assertVerdictShape(report);
  assert.strictEqual(report.score, 100);
  assert.strictEqual(report.checks[1].evidenceNote, "Für diesen Check liegt kein separates Artefakt vor.");
  assert.strictEqual(report.findings[0].evidenceNote, "Für diesen Befund liegt kein separates Artefakt vor.");
});

test("verdict-schema: writeVerdict schreibt verdict.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-verdict-"));
  const { verdictPath, verdict } = writeVerdict(dir, {
    command: "audio-check",
    target: { kind: "url", value: "https://example.test", platform: "web" },
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    verdict: "NICHT BELEGT",
    score: 0,
    severity: "high",
    checks: [{ id: "audio-hook", label: "Hook vorhanden", ok: false, evidence: [] }],
    findings: [],
    signals: {},
    evidence: [],
    environment: { driver: "web" },
    exitCode: 1,
  });
  assert.strictEqual(path.basename(verdictPath), "verdict.json");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(verdictPath, "utf8")), verdict);
  assertVerdictShape(verdict);
});
