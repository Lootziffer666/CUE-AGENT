"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { parseAmStartW, parseFramestats, parseMeminfo, median, evaluatePerf } = require("../src/android/perf");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", "android", "dumpsys", name), "utf8");
}

test("android perf: parseAmStartW extrahiert Startzeiten und wirft bei unbekanntem Format nicht", () => {
  assert.deepEqual(parseAmStartW(fixture("am-start-W.txt")), { thisTimeMs: 412, totalTimeMs: 731, waitTimeMs: 755 });
  assert.equal(parseAmStartW("garbage"), null);
});

test("android perf: parseFramestats berechnet Jank aus FrameCompleted", () => {
  const parsed = parseFramestats(fixture("gfxinfo-framestats-api33.txt"));
  assert.equal(parsed.frames, 2);
  assert.equal(parsed.jankyFrames, 1);
  assert.equal(parsed.jankyPct, 50);
  assert.equal(parsed.source, "framestats");
});

test("android perf: parseFramestats fällt auf aggregierte Janky-Frames zurück", () => {
  const parsed = parseFramestats(fixture("gfxinfo-aggregate.txt"));
  assert.equal(parsed.jankyFrames, 30);
  assert.equal(parsed.jankyPct, 25);
  assert.equal(parsed.source, "aggregate");
});

test("android perf: parseMeminfo extrahiert PSS-Heaps", () => {
  const parsed = parseMeminfo(fixture("meminfo-api30.txt"));
  assert.equal(parsed.totalPssKb, 180000);
  assert.equal(parsed.javaHeapKb, 12345);
  assert.equal(parsed.nativeHeapKb, 45678);
  assert.equal(parsed.graphicsKb, 98765);
  assert.equal(parseMeminfo("unknown"), null);
});

test("android perf: median und evaluatePerf liefern deterministische Findings", () => {
  assert.equal(median([900, 700, 800]), 800);
  const findings = evaluatePerf({ coldStartMs: 6000, jank: { jankyPct: 55 }, memory: { totalPssKb: 2 * 1024 * 1024 } });
  assert.deepEqual(findings.map((f) => f.severity), ["medium", "high", "medium"]);
});
