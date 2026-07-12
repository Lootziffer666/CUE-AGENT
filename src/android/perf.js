"use strict";

function number(value) {
  const n = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseAmStartW(text) {
  const out = String(text || "");
  const thisTime = (out.match(/ThisTime:\s*(\d+)/i) || [])[1];
  const totalTime = (out.match(/TotalTime:\s*(\d+)/i) || [])[1];
  const waitTime = (out.match(/WaitTime:\s*(\d+)/i) || [])[1];
  if (!thisTime && !totalTime && !waitTime) return null;
  return { thisTimeMs: number(thisTime), totalTimeMs: number(totalTime), waitTimeMs: number(waitTime) };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function parseFramestats(text) {
  const out = String(text || "");
  const aggregate = out.match(/Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/i);
  if (aggregate) {
    return { frames: null, jankyFrames: number(aggregate[1]), jankyPct: number(aggregate[2]), p50: null, p90: null, p99: null, frozenFrames: null, source: "aggregate" };
  }

  const frameDurations = [];
  for (const rawLine of out.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^Flags,/.test(line) || !/^\d+,/.test(line)) continue;
    const cols = line.split(",").map(number);
    if (cols.length < 14 || cols.some((v) => v == null)) continue;
    const intendedVsync = cols[1];
    const frameCompleted = cols[13];
    if (frameCompleted > intendedVsync) frameDurations.push((frameCompleted - intendedVsync) / 1_000_000);
  }
  if (!frameDurations.length) return null;
  const jankyFrames = frameDurations.filter((ms) => ms > 16.67).length;
  const frozenFrames = frameDurations.filter((ms) => ms > 700).length;
  return {
    frames: frameDurations.length,
    jankyFrames,
    jankyPct: Number(((jankyFrames / frameDurations.length) * 100).toFixed(2)),
    p50: percentile(frameDurations, 50),
    p90: percentile(frameDurations, 90),
    p99: percentile(frameDurations, 99),
    frozenFrames,
    source: "framestats",
  };
}

function parseMeminfo(text) {
  const out = String(text || "");
  const total = out.match(/TOTAL\s+(\d+)/i);
  const java = out.match(/Java Heap:\s+(\d+)/i);
  const nativeHeap = out.match(/Native Heap:\s+(\d+)/i);
  const graphics = out.match(/Graphics:\s+(\d+)/i);
  if (!total && !java && !nativeHeap && !graphics) return null;
  return {
    totalPssKb: number(total && total[1]),
    javaHeapKb: number(java && java[1]),
    nativeHeapKb: number(nativeHeap && nativeHeap[1]),
    graphicsKb: number(graphics && graphics[1]),
  };
}

function median(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : Math.round((clean[mid - 1] + clean[mid]) / 2);
}

function evaluatePerf(perf, thresholds = {}) {
  const t = { maxColdStartMs: 5000, maxJankyPctMedium: 25, maxJankyPctHigh: 50, maxTotalPssKb: 1024 * 1024, ...thresholds };
  const findings = [];
  if (perf?.coldStartMs != null && perf.coldStartMs > t.maxColdStartMs) findings.push({ severity: "medium", category: "android-perf", message: `Kaltstart ${perf.coldStartMs}ms > ${t.maxColdStartMs}ms` });
  const jankyPct = perf?.jank?.jankyPct;
  if (jankyPct != null && jankyPct > t.maxJankyPctHigh) findings.push({ severity: "high", category: "android-perf", message: `Jank ${jankyPct}% > ${t.maxJankyPctHigh}%` });
  else if (jankyPct != null && jankyPct > t.maxJankyPctMedium) findings.push({ severity: "medium", category: "android-perf", message: `Jank ${jankyPct}% > ${t.maxJankyPctMedium}%` });
  const pss = perf?.memory?.totalPssKb;
  if (pss != null && pss > t.maxTotalPssKb) findings.push({ severity: "medium", category: "android-perf", message: `PSS ${pss}KB > ${t.maxTotalPssKb}KB` });
  return findings;
}

module.exports = { parseAmStartW, parseFramestats, parseMeminfo, median, evaluatePerf };
