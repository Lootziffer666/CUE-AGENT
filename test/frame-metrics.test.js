"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  meanAbsDiff,
  pixelStdDev,
  analyzeSequence,
  evaluatePlayability,
} = require("../src/qa/frame-metrics");

// Hilfsfunktion: uniformer RGBA-Frame (n Pixel) mit Grauwert v
function frame(v, pixels = 64) {
  const d = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}

test("meanAbsDiff: identische Frames → 0, bekannte Differenz exakt", () => {
  assert.strictEqual(meanAbsDiff(frame(100), frame(100)), 0);
  assert.strictEqual(meanAbsDiff(frame(100), frame(110)), 10);
});

test("meanAbsDiff: ungleiche Puffergrößen werfen", () => {
  assert.throws(() => meanAbsDiff(frame(0, 4), frame(0, 8)));
});

test("pixelStdDev: uniform → 0, kontrastreich → hoch", () => {
  assert.strictEqual(pixelStdDev(frame(128)), 0);
  const d = frame(0, 64);
  for (let i = 0; i < d.length / 2; i += 4) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
  assert.ok(pixelStdDev(d) > 50);
});

test("analyzeSequence: statische Idle-Phase wird beanstandet (expectAlive)", () => {
  const frames = Array.from({ length: 6 }, () => ({ phase: "idle", kind: "idle", data: frame(80) }));
  const r = analyzeSequence(frames, { expectAlive: true });
  assert.strictEqual(r.verdict, "AUFFAELLIG");
  assert.ok(r.findings.some((f) => f.category === "temporal-static"));
});

test("analyzeSequence: statische Idle-Phase ist ok, wenn expectAlive=false", () => {
  const frames = Array.from({ length: 6 }, () => ({ phase: "idle", kind: "idle", data: frame(80) }));
  const r = analyzeSequence(frames, { expectAlive: false });
  assert.strictEqual(r.verdict, "KONSISTENT");
});

test("analyzeSequence: lebendige Idle-Phase besteht", () => {
  const frames = Array.from({ length: 6 }, (_, i) => ({ phase: "idle", kind: "idle", data: frame(80 + i * 2) }));
  const r = analyzeSequence(frames, { expectAlive: true });
  assert.ok(!r.findings.some((f) => f.category === "temporal-static"));
});

test("analyzeSequence: Sprung in Übergangsphase wird erkannt", () => {
  const frames = [
    { phase: "ramp", kind: "transition", data: frame(50) },
    { phase: "ramp", kind: "transition", data: frame(55) },
    { phase: "ramp", kind: "transition", data: frame(150) }, // Sprung um 95
  ];
  const r = analyzeSequence(frames);
  assert.strictEqual(r.verdict, "AUFFAELLIG");
  assert.ok(r.findings.some((f) => f.category === "temporal-jump"));
});

test("analyzeSequence: gradueller Übergang besteht", () => {
  const frames = Array.from({ length: 11 }, (_, i) => ({ phase: "ramp", kind: "transition", data: frame(50 + i * 10) }));
  const r = analyzeSequence(frames);
  assert.ok(!r.findings.some((f) => f.category === "temporal-jump"));
});

test("analyzeSequence: wirkungsloser Zustandswechsel wird erkannt", () => {
  const frames = [
    { phase: "tag", kind: "idle", data: frame(80) },
    { phase: "tag", kind: "idle", data: frame(81) },
    { phase: "nacht", kind: "state", data: frame(81) }, // keine sichtbare Wirkung
  ];
  const r = analyzeSequence(frames, { expectAlive: false });
  assert.ok(r.findings.some((f) => f.category === "temporal-unresponsive"));
});

test("analyzeSequence: sichtbarer Zustandswechsel besteht und liefert responseDiff", () => {
  const frames = [
    { phase: "tag", kind: "idle", data: frame(120) },
    { phase: "tag", kind: "idle", data: frame(121) },
    { phase: "nacht", kind: "state", data: frame(40) },
  ];
  const r = analyzeSequence(frames, { expectAlive: false });
  assert.ok(!r.findings.some((f) => f.category === "temporal-unresponsive"));
  const nacht = r.phases.find((p) => p.phase === "nacht");
  assert.ok(nacht.responseDiff > 50);
});

test("analyzeSequence: Flackern in Idle-Phase wird als medium gemeldet", () => {
  const frames = [
    { phase: "idle", kind: "idle", data: frame(20) },
    { phase: "idle", kind: "idle", data: frame(220) },
    { phase: "idle", kind: "idle", data: frame(20) },
  ];
  const r = analyzeSequence(frames, { expectAlive: false });
  assert.ok(r.findings.some((f) => f.category === "temporal-flicker" && f.severity === "medium"));
});

test("evaluatePlayability: alle Signale grün → BELEGBAR SPIELBAR", () => {
  const r = evaluatePlayability({
    navOk: true, blank: false, consoleErrors: 0, pageErrors: 0, serverErrors: 0,
    interactiveCount: 5, responded: true, proofCount: 2,
  });
  assert.strictEqual(r.verdict, "BELEGBAR SPIELBAR");
  assert.deepStrictEqual(r.failed, []);
});

test("evaluatePlayability: Konsolenfehler → NICHT BELEGT mit benanntem Check", () => {
  const r = evaluatePlayability({
    navOk: true, blank: false, consoleErrors: 3, pageErrors: 0, serverErrors: 0,
    interactiveCount: 5, responded: true, proofCount: 2,
  });
  assert.strictEqual(r.verdict, "NICHT BELEGT");
  assert.ok(r.failed.includes("fehlerfrei"));
});

test("evaluatePlayability: leere Seite (blank) → startet schlägt fehl", () => {
  const r = evaluatePlayability({
    navOk: true, blank: true, consoleErrors: 0, pageErrors: 0, serverErrors: 0,
    interactiveCount: 1, responded: true, proofCount: 2,
  });
  assert.ok(r.failed.includes("startet"));
});
