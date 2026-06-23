"use strict";

/**
 * ADB-Wrapper für das Android-QA-Capture-Backend.
 *
 * Dünne, synchrone Hüllen um die `adb`-CLI (kein Appium-Server nötig).
 * Liefert genau die Primitive, die die Explorations-Schleife braucht:
 * App starten, Screenshot, UI-Hierarchie (uiautomator), Gesten, Logcat +
 * Crash-/ANR-Erkennung.
 *
 * Alle Funktionen sind defensiv: fehlt `adb` oder ein Gerät, werfen sie eine
 * klare Fehlermeldung statt undefiniert zu scheitern.
 */

const { spawnSync } = require("child_process");

const ADB = process.env.ADB_PATH || "adb";

function run(args, { buffer = false, input = null, timeout = 30_000 } = {}) {
  const res = spawnSync(ADB, args, {
    encoding: buffer ? "buffer" : "utf-8",
    input,
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    if (res.error.code === "ENOENT") {
      throw new Error(`adb nicht gefunden (ADB_PATH=${ADB}). Android platform-tools installieren.`);
    }
    throw res.error;
  }
  return res;
}

function withSerial(serial, args) {
  return serial ? ["-s", serial, ...args] : args;
}

function isAdbAvailable() {
  try {
    const r = spawnSync(ADB, ["version"], { encoding: "utf-8" });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

/** @returns {string[]} Serials verbundener, online Geräte/Emulatoren */
function listDevices() {
  const r = run(["devices"]);
  return String(r.stdout || "")
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l && l.endsWith("\tdevice"))
    .map((l) => l.split("\t")[0]);
}

function installApk(apkPath, serial) {
  const r = run(withSerial(serial, ["install", "-r", "-g", apkPath]), { timeout: 180_000 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (!/Success/i.test(out)) throw new Error(`APK-Installation fehlgeschlagen: ${out.trim().slice(0, 300)}`);
  return true;
}

/** Versucht, den Package-Namen aus einer APK zu lesen (aapt/aapt2, falls vorhanden). */
function packageFromApk(apkPath) {
  for (const tool of ["aapt", "aapt2"]) {
    const r = spawnSync(tool, ["dump", "badging", apkPath], { encoding: "utf-8" });
    if (!r.error && r.stdout) {
      const m = r.stdout.match(/package:\s*name='([^']+)'/);
      if (m) return m[1];
    }
  }
  return null;
}

function launchPackage(pkg, serial) {
  // Monkey mit LAUNCHER-Kategorie startet die Default-Activity zuverlässig.
  run(withSerial(serial, ["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"]));
}

function stopPackage(pkg, serial) {
  run(withSerial(serial, ["shell", "am", "force-stop", pkg]));
}

/** Screenshot als PNG-Buffer (binary-safe via exec-out). */
function screencapPng(serial) {
  const r = run(withSerial(serial, ["exec-out", "screencap", "-p"]), { buffer: true });
  return r.stdout; // Buffer
}

/** UI-Hierarchie als XML-String (uiautomator dump → cat). */
function uiDumpXml(serial) {
  run(withSerial(serial, ["shell", "uiautomator", "dump", "/sdcard/cue_ui.xml"]));
  const r = run(withSerial(serial, ["shell", "cat", "/sdcard/cue_ui.xml"]));
  return String(r.stdout || "");
}

/**
 * Extrahiert klickbare Elemente aus dem uiautomator-XML.
 * @returns {Array<{text:string,id:string,cls:string,cx:number,cy:number}>}
 */
function parseClickables(xml) {
  const nodes = [];
  const re = /<node[^>]*\bclickable="true"[^>]*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const bounds = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    const [x1, y1, x2, y2] = bounds.slice(1).map(Number);
    nodes.push({
      text: (tag.match(/text="([^"]*)"/) || [, ""])[1],
      id: (tag.match(/resource-id="([^"]*)"/) || [, ""])[1],
      cls: (tag.match(/class="([^"]*)"/) || [, ""])[1],
      cx: Math.round((x1 + x2) / 2),
      cy: Math.round((y1 + y2) / 2),
    });
  }
  return nodes;
}

/**
 * Extrahiert ALLE Knoten mit Bounds (nicht nur klickbare) — für Baseline-Matching.
 * @returns {Array<{id:string,text:string,cls:string,bbox:[number,number,number,number]}>}
 */
function parseAllNodes(xml) {
  const nodes = [];
  const re = /<node\b[^>]*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const b = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nodes.push({
      id: (tag.match(/resource-id="([^"]*)"/) || [, ""])[1],
      text: (tag.match(/text="([^"]*)"/) || [, ""])[1],
      cls: (tag.match(/class="([^"]*)"/) || [, ""])[1],
      bbox: [x1, y1, x2 - x1, y2 - y1],
    });
  }
  return nodes;
}

function tap(x, y, serial) {
  run(withSerial(serial, ["shell", "input", "tap", String(x), String(y)]));
}
function swipe(x1, y1, x2, y2, ms, serial) {
  run(withSerial(serial, ["shell", "input", "swipe", `${x1}`, `${y1}`, `${x2}`, `${y2}`, String(ms || 300)]));
}
function inputText(text, serial) {
  run(withSerial(serial, ["shell", "input", "text", String(text).replace(/ /g, "%s")]));
}
function back(serial) {
  run(withSerial(serial, ["shell", "input", "keyevent", "4"]));
}

/** Aktuell fokussiertes Package (zur Foreground-/Crash-Erkennung). */
function currentPackage(serial) {
  const r = run(withSerial(serial, ["shell", "dumpsys", "window"]));
  const m = String(r.stdout || "").match(/mCurrentFocus=.*\s([a-zA-Z0-9_.]+)\/[a-zA-Z0-9_.]+/);
  return m ? m[1] : null;
}

/** Aktuell fokussierte Activity-Komponente "package/Activity" (Screen-Identität). */
function currentActivity(serial) {
  const r = run(withSerial(serial, ["shell", "dumpsys", "window"]));
  const out = String(r.stdout || "");
  const m =
    out.match(/mCurrentFocus=.*\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.$]+)/) ||
    out.match(/mResumedActivity[^\n]*\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.$]+)/);
  return m ? m[1] : null;
}

function clearLogcat(serial) {
  run(withSerial(serial, ["logcat", "-c"]));
}
function logcatDump(serial) {
  const r = run(withSerial(serial, ["logcat", "-d", "-v", "brief"]));
  return String(r.stdout || "");
}

/**
 * Erkennt Abstürze/ANRs im Logcat.
 * @returns {{crashed:boolean, anr:boolean, lines:string[]}}
 */
function detectCrashes(logcat, pkg) {
  const lines = logcat.split("\n");
  const hits = [];
  let crashed = false;
  let anr = false;
  for (const l of lines) {
    if (/FATAL EXCEPTION|AndroidRuntime.*(FATAL|Exception)|has died|crash/i.test(l)) {
      if (!pkg || l.includes(pkg) || /FATAL EXCEPTION/i.test(l)) { crashed = true; hits.push(l.trim()); }
    }
    if (/ANR in|Application Not Responding/i.test(l)) {
      if (!pkg || l.includes(pkg)) { anr = true; hits.push(l.trim()); }
    }
  }
  return { crashed, anr, lines: hits.slice(0, 40) };
}

/** Logcat-Zeilen → Konsolen-Log-Form ({type,text}) für severity.assess(). */
function logcatToConsole(logcat, limit = 60) {
  const out = [];
  for (const l of logcat.split("\n")) {
    const t = l.trim();
    if (!t) continue;
    if (/^E\//.test(t) || /\bE\s/.test(t.slice(0, 3))) out.push({ type: "error", text: t.slice(0, 300) });
    else if (/^W\//.test(t)) out.push({ type: "warning", text: t.slice(0, 300) });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  isAdbAvailable,
  listDevices,
  installApk,
  packageFromApk,
  launchPackage,
  stopPackage,
  screencapPng,
  uiDumpXml,
  parseClickables,
  parseAllNodes,
  tap,
  swipe,
  inputText,
  back,
  currentPackage,
  currentActivity,
  clearLogcat,
  logcatDump,
  detectCrashes,
  logcatToConsole,
};
