"use strict";

/**
 * Flow-Spec: gewollter Userflow als überprüfbare Soll-Ist-Schritte.
 *
 * ── PLATTFORM-AGNOSTISCH ────────────────────────────────────────────────────
 * Der Vertrag „ACTION → EXPECT → assert → Abweichung dokumentieren" gilt für
 * JEDE Plattform (Web, Android, Windows/Wine, …). Nur die Capture-/Assert-
 * Adapter sind plattformspezifisch:
 *   • screen / hasText           → neutral (überall gültig)
 *   • activity / hasId           → Android (dieser Adapter)
 *   • url / title / selector     → Web (src/core/flow.js, analoge Semantik)
 *   • window-title / control-id  → Windows (künftiger Adapter)
 * Eine Flow-Spec trägt optional `platform` ("android" | "web" | "windows");
 * der jeweilige Runner interpretiert die passenden expect-Schlüssel.
 *
 * Jeder Schritt beschreibt eine ACTION (was der Nutzer tut) und ein EXPECT
 * (wo er landen soll). Der Runner führt die Action aus und verifiziert, ob die
 * App tatsächlich im erwarteten Screen landet — sonst wird die Abweichung
 * dokumentiert (genau die Frage: „Tap auf X → Screen X? oder Y? oder nirgends?").
 *
 * Beispiel (Android):
 * {
 *   "package": "com.example.app",
 *   "name": "Onboarding-Happy-Path",
 *   "steps": [
 *     { "id": "open-login",
 *       "action": { "type": "tap", "text": "Login" },
 *       "expect": { "activity": "LoginActivity", "hasId": "com.example.app:id/password" } }
 *   ]
 * }
 *
 * action.type: tap | back | text | swipe
 *   tap:   { text } | { id } | { x, y }          (text/id werden im UI-Baum aufgelöst)
 *   text:  { value }                              (Texteingabe ins fokussierte Feld)
 *   swipe: { x1, y1, x2, y2, ms? }
 * expect (alle optional, alle gesetzten müssen zutreffen):
 *   activity : Teilstring der erwarteten Activity-Komponente
 *   hasText  : Text, der im Ziel-Screen sichtbar sein muss
 *   hasId    : resource-id, die im Ziel-Screen vorhanden sein muss
 *   screen   : reines Label für den Report (keine Assertion)
 */

const fs = require("fs");

function loadAndroidFlow(file) {
  const raw = fs.readFileSync(file, "utf-8");
  const spec = JSON.parse(raw);
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) {
    throw new Error("Flow-Spec ungültig: 'steps' (nicht leer) erforderlich.");
  }
  spec.steps.forEach((s, i) => {
    if (!s.action || !s.action.type) throw new Error(`Schritt ${i}: 'action.type' fehlt.`);
    if (!s.id) s.id = `step-${i + 1}`;
  });
  return spec;
}

/**
 * Löst das Tap-Ziel eines Schritts gegen die aktuellen klickbaren Elemente auf.
 * @returns {{x:number,y:number,matched:string}|null}
 */
function resolveTarget(action, clickables) {
  if (Number.isFinite(action.x) && Number.isFinite(action.y)) {
    return { x: action.x, y: action.y, matched: `(${action.x},${action.y})` };
  }
  if (action.id) {
    const hit = clickables.find((e) => e.id && e.id.includes(action.id));
    if (hit) return { x: hit.cx, y: hit.cy, matched: `id:${hit.id}` };
  }
  if (action.text) {
    const want = String(action.text).toLowerCase();
    const hit =
      clickables.find((e) => e.text && e.text.toLowerCase() === want) ||
      clickables.find((e) => e.text && e.text.toLowerCase().includes(want));
    if (hit) return { x: hit.cx, y: hit.cy, matched: `text:${hit.text}` };
  }
  return null;
}

function xmlHasText(xml, text) {
  if (!text) return true;
  return xml.toLowerCase().includes(String(text).toLowerCase());
}
function xmlHasId(xml, id) {
  if (!id) return true;
  return xml.includes(`resource-id="${id}"`);
}

/**
 * Prüft das EXPECT eines Schritts gegen den tatsächlichen Zustand.
 * @returns {{pass:boolean, reasons:string[], landedNowhere:boolean}}
 */
function assertExpectation(expect, { activity, xml, prevActivity }) {
  const reasons = [];
  if (!expect) return { pass: true, reasons, landedNowhere: false };

  if (expect.activity) {
    const ok = activity && activity.toLowerCase().includes(String(expect.activity).toLowerCase());
    if (!ok) reasons.push(`Activity erwartet "${expect.activity}", tatsächlich "${activity || "—"}"`);
  }
  if (expect.hasText && !xmlHasText(xml, expect.hasText)) {
    reasons.push(`Text "${expect.hasText}" im Ziel-Screen nicht gefunden`);
  }
  if (expect.hasId && !xmlHasId(xml, expect.hasId)) {
    reasons.push(`Element-ID "${expect.hasId}" im Ziel-Screen nicht gefunden`);
  }

  // "Nirgends gelandet": es wurde eine Navigation erwartet, aber der Screen
  // hat sich nicht verändert (gleiche Activity wie vor der Aktion).
  const expectedNav = Boolean(expect.activity);
  const landedNowhere = expectedNav && !!activity && activity === prevActivity && reasons.length > 0;

  return { pass: reasons.length === 0, reasons, landedNowhere };
}

module.exports = { loadAndroidFlow, resolveTarget, assertExpectation };
