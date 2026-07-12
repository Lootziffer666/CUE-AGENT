"use strict";

/**
 * Android-Adapter für den Design-Iterations-Loop.
 *
 * Mess-Hälfte (verifizierbar, gerätunabhängig testbar):
 *   captureActualFromXml(xml, spec) → Ist-Elemente [{id,text,bbox,color}]
 *   captureActual(serial, spec)     → wie oben, live via adb uiautomator
 *
 * Edit-Hälfte (läuft im Build-/Emulator-Umfeld, NICHT in dieser Sandbox):
 *   Anders als Web (Live-CSS-Inject) bedeutet ein "Edit" bei nativem Android
 *   einen Source-Patch (Layout-XML/Compose) → rebuild → reinstall → relaunch.
 *   applyEdits([{file,find,replace}]) patcht Quelltext (mit Snapshot je Charge),
 *   rollback() stellt die letzte Charge wieder her (NEVER-WORSE),
 *   makeRerender({buildCmd,installCmd,relaunchCmd,cwd}) baut+installiert neu.
 *
 * Farbe: uiautomator liefert keine Farbwerte → color=null (der Comparator
 * überspringt die Farb-Prüfung dann mit Hinweis statt sie als Fehler zu werten).
 * Echtes Farb-Sampling aus dem Screenshot ist ein separater Baustein (PNG-Decoder).
 */

const fs = require("fs");
const { spawnSync } = require("child_process");
const adb = require("./adb");

/** Pure: ordnet Baseline-Elemente den uiautomator-Knoten zu (id → text → nichts). */
function captureActualFromXml(xml, spec) {
  const all = adb.parseAllNodes(xml);
  return (spec.elements || [])
    .map((el) => {
      let hit = null;
      if (el.id) hit = all.find((n) => n.id && n.id.includes(el.id));
      if (!hit && el.text) {
        const w = el.text.toLowerCase();
        hit = all.find((n) => n.text && n.text.toLowerCase() === w) ||
              all.find((n) => n.text && n.text.toLowerCase().includes(w));
      }
      return hit ? { id: el.id, text: hit.text, bbox: hit.bbox, color: null } : null;
    })
    .filter(Boolean);
}

function captureActual(serial, spec) {
  return captureActualFromXml(adb.uiDumpXml(serial), spec);
}

// ── Edit-Hälfte: Source-Patch mit Snapshot-Stack (reversibel) ───────────────
const _stack = [];

/** edits: [{file, find, replace}] — literale Ersetzung im Quelltext. */
function applyEdits(edits) {
  const snap = {};
  for (const e of edits) {
    if (!(e.file in snap)) snap[e.file] = fs.readFileSync(e.file, "utf-8");
  }
  _stack.push(snap);
  for (const e of edits) {
    const cur = fs.readFileSync(e.file, "utf-8");
    fs.writeFileSync(e.file, cur.split(e.find).join(e.replace));
  }
}

/** Stellt die letzte Edit-Charge wieder her (für NEVER-WORSE-Rollback). */
function rollback() {
  const snap = _stack.pop();
  if (!snap) return;
  for (const [file, orig] of Object.entries(snap)) fs.writeFileSync(file, orig);
}

function _resetStack() { _stack.length = 0; } // für Tests

/**
 * Baut einen rerender()-Adapter, der die App neu baut + installiert + startet.
 * Im Emulator/CI auszuführen (z. B. gradlew assembleDebug + adb install + monkey).
 */
function makeRerender({ buildCmd, installCmd, relaunchCmd, cwd, logger } = {}) {
  return async () => {
    for (const cmd of [buildCmd, installCmd, relaunchCmd].filter(Boolean)) {
      if (logger) logger.info(`rerender: ${cmd}`);
      const r = spawnSync("bash", ["-lc", cmd], { cwd, stdio: "inherit" });
      if (r.status !== 0) throw new Error(`rerender-Schritt fehlgeschlagen: ${cmd}`);
    }
  };
}

module.exports = { captureActualFromXml, captureActual, applyEdits, rollback, makeRerender, _resetStack };
