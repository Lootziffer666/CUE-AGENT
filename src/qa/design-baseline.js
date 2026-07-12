"use strict";

/**
 * Design-Baseline — die Ziel-UI als messbare QA-Messlatte.
 *
 * Zwei komplementäre Formen einer Baseline pro Screen:
 *   1. BILD (mockup.png)            → holistischer Vergleich (Pixel-/SSIM-Diff,
 *                                      optional multimodale LLM-Beurteilung).
 *   2. PIXEL-GENAUE JSON (Spec)     → deterministische Element-Assertions:
 *                                      Position, Größe, Text, Farbe je Element,
 *                                      mit Toleranzen. DAS ist der harte,
 *                                      reproduzierbare Vertrag.
 *
 * Dieses Modul implementiert (1) den Spec-Loader und (2) den STRUKTURELLEN
 * Vergleich (JSON-Form) — plattform-agnostisch: die "actual"-Elemente liefert
 * der jeweilige Capture-Adapter (Web: DOM-BBox/Computed-Color; Android:
 * uiautomator-BBox + Farb-Sample). Der reine Bild-Diff ist als optionaler
 * Schritt vorgesehen (benötigt einen PNG-Decoder, separater Baustein).
 *
 * Bezug zur Flow-Verifikation: jeder erwartete Screen eines Flows kann eine
 * Baseline referenzieren — so wird neben "landet der Tap im richtigen Screen?"
 * auch "sieht der Screen aus wie die Vorgabe?" geprüft.
 *
 * Spec-Format (examples/design-baseline.example.json):
 * {
 *   "screen": "Dashboard",
 *   "viewport": { "w": 1280, "h": 720 },
 *   "image": "mockups/dashboard.png",            // optional (für Bild-Diff)
 *   "tolerance": { "pos": 8, "size": 10, "color": 24 },  // Defaults
 *   "elements": [
 *     { "id": "cta", "label": "Primary CTA", "bbox": [40,600,300,60],
 *       "text": "Get Started", "color": "#2563EB",
 *       "tolerance": { "pos": 6, "color": 16 } }   // pro Element überschreibbar
 *   ],
 *   "ignoreRegions": [[0,0,1280,40]]               // z. B. Statusleiste/dynamisch
 * }
 */

const fs = require("fs");

const DEFAULT_TOL = { pos: 8, size: 10, color: 24 };

/**
 * Normalisiert + validiert eine Baseline-Spec (egal ob aus Datei geladen oder
 * inline im Flow-Schritt angegeben). Setzt Default-Toleranzen und Element-IDs.
 * @param {object} spec
 * @returns {object} dieselbe (mutierte) Spec
 */
function normalizeSpec(spec) {
  if (!spec || typeof spec !== "object") throw new Error("Baseline-Spec: Objekt erforderlich.");
  if (!Array.isArray(spec.elements)) throw new Error("Baseline-Spec: 'elements' (Array) erforderlich.");
  spec.tolerance = Object.assign({}, DEFAULT_TOL, spec.tolerance || {});
  spec.elements.forEach((e, i) => {
    if (!Array.isArray(e.bbox) || e.bbox.length !== 4) throw new Error(`Element ${i}: 'bbox' [x,y,w,h] erforderlich.`);
    if (!e.id) e.id = `el-${i + 1}`;
  });
  return spec;
}

function loadBaselineSpec(file) {
  return normalizeSpec(JSON.parse(fs.readFileSync(file, "utf-8")));
}

function hexToRgb(hex) {
  if (!hex) return null;
  const m = String(hex).trim().replace(/^#/, "");
  const h = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Euklidischer RGB-Abstand (0..~441). Einfach, robust, ausreichend für Toleranzen. */
function colorDistance(a, b) {
  const c1 = Array.isArray(a) ? a : hexToRgb(a);
  const c2 = Array.isArray(b) ? b : hexToRgb(b);
  if (!c1 || !c2) return Infinity;
  return Math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2);
}

const center = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function normText(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function textMatches(expected, actual) {
  if (expected == null || expected === "") return true;
  const e = normText(expected);
  const a = normText(actual);
  return a === e || a.includes(e);
}

/**
 * Findet das am besten passende Ist-Element zu einem Soll-Element.
 * Priorität: gleiche id → gleicher Text → nächste BBox-Mitte.
 * @returns {{actual,by:'id'|'text'|'nearest',d:number}|null}
 */
function findActual(specEl, actualEls) {
  if (specEl.id) {
    const byId = actualEls.find((a) => a.id && a.id === specEl.id);
    if (byId) return { actual: byId, by: "id", d: 0 };
  }
  if (specEl.text) {
    const byText = actualEls.find((a) => textMatches(specEl.text, a.text));
    if (byText) return { actual: byText, by: "text", d: 0 };
  }
  const c = center(specEl.bbox);
  let best = null;
  let bestD = Infinity;
  for (const a of actualEls) {
    if (!Array.isArray(a.bbox)) continue;
    const d = dist(c, center(a.bbox));
    if (d < bestD) { bestD = d; best = a; }
  }
  return best ? { actual: best, by: "nearest", d: bestD } : null;
}

/**
 * Vergleicht eine Baseline-Spec gegen die tatsächlichen Elemente.
 * @param {object} a
 * @param {object} a.spec     geladene Baseline-Spec
 * @param {Array}  a.actual   Ist-Elemente: [{id?, text?, bbox:[x,y,w,h], color?}]
 * @returns {{screen,results,passed,failed,missing,score,severity}}
 */
function compareToBaseline({ spec, actual }) {
  const results = [];
  let passed = 0;
  let missing = 0;
  let hardFail = false; // fehlend / Position weit daneben → high

  for (const el of spec.elements) {
    const tol = Object.assign({}, spec.tolerance, el.tolerance || {});
    const m = findActual(el, actual || []);
    const deviations = [];

    // Nearest-Fallback nur akzeptieren, wenn plausibel nah — sonst gilt das
    // Soll-Element als FEHLEND (statt es einem weit entfernten zuzuordnen).
    const matchRadius = Math.max(150, tol.pos * 6);
    const noMatch = !m || (m.by === "nearest" && m.d > matchRadius);
    if (noMatch) {
      missing++;
      hardFail = true;
      results.push({ id: el.id, label: el.label || el.id, pass: false, missing: true, deviations: ["Element nicht gefunden"] });
      continue;
    }
    const act = m.actual;

    // Position (BBox-Mitte)
    const posD = dist(center(el.bbox), center(act.bbox));
    const posOk = posD <= tol.pos;
    if (!posOk) {
      deviations.push(`Position ${posD.toFixed(0)}px daneben (Toleranz ${tol.pos})`);
      if (posD > tol.pos * 4) hardFail = true; // grob verrutscht
    }
    // Größe
    const dw = Math.abs(el.bbox[2] - act.bbox[2]);
    const dh = Math.abs(el.bbox[3] - act.bbox[3]);
    const sizeOk = dw <= tol.size && dh <= tol.size;
    if (!sizeOk) deviations.push(`Größe Δw=${dw} Δh=${dh} (Toleranz ${tol.size})`);
    // Text
    const textOk = textMatches(el.text, act.text);
    if (!textOk) deviations.push(`Text erwartet "${el.text}", tatsächlich "${act.text || "—"}"`);
    // Farbe (nur prüfen, wenn der Adapter eine Farbe liefert; sonst Hinweis)
    let colorOk = true;
    if (el.color) {
      if (act.color == null) {
        deviations.push("Farbe nicht gemessen (Adapter ohne Farbwert)");
      } else {
        const cd = colorDistance(el.color, act.color);
        colorOk = cd <= tol.color;
        if (!colorOk) deviations.push(`Farbe Abstand ${cd === Infinity ? "n/a" : cd.toFixed(0)} (Toleranz ${tol.color})`);
      }
    }

    const pass = posOk && sizeOk && textOk && colorOk;
    if (pass) passed++;
    results.push({ id: el.id, label: el.label || el.id, pass, missing: false, posPx: Math.round(posD), deviations });
  }

  const total = spec.elements.length;
  const failed = total - passed;
  const score = total === 0 ? 100 : Math.round((passed / total) * 100);
  // Severity: alles fehlend/grob daneben → high; sonst Abweichungen → medium.
  const severity = failed === 0 ? "none" : hardFail ? "high" : "medium";

  return { screen: spec.screen || null, results, passed, failed, missing, score, severity };
}

module.exports = {
  loadBaselineSpec,
  normalizeSpec,
  compareToBaseline,
  // Helfer exportiert für Tests/Adapter:
  hexToRgb,
  colorDistance,
  textMatches,
  findActual,
  DEFAULT_TOL,
};
