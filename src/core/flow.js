"use strict";

/**
 * Flow-Definition: deklarative Schritte, die der Capture-Engine sagen,
 * was sie im Browser tun soll.
 *
 * Unterstützte Aktionen:
 *   goto     - URL navigieren
 *   click    - Element klicken
 *   type     - Text in ein Feld tippen
 *   scroll   - Seite/Element scrollen
 *   wait     - n ms warten
 *   hover    - über ein Element hovern
 *   select   - Option in einem <select> wählen
 *
 * Flows können aus einer JSON-Datei geladen oder programmatisch erstellt
 * werden. Ein „Default-Flow" besteht nur aus { goto <url> } (Verhalten wie M0).
 */

const fs = require("fs");
const path = require("path");

const VALID_ACTIONS = ["goto", "click", "type", "scroll", "wait", "hover", "select"];

/**
 * @typedef {object} FlowStep
 * @property {string} id       eindeutige Schritt-ID
 * @property {string} action   eine der VALID_ACTIONS
 * @property {string} [url]    für goto
 * @property {string} [selector] CSS-Selektor (click/type/hover/scroll/select)
 * @property {string} [text]   Eingabetext (type) oder Optionswert (select)
 * @property {number} [ms]     Wartezeit (wait) oder Scroll-Dauer
 * @property {number} [scrollY] Pixel scrollen (scroll)
 * @property {string} [goal]   menschliche Beschreibung (Tutorial-Kapitel)
 * @property {string} [narration] Voiceover-Text für Tutorial
 * @property {string} [caption]  Caption-Label (für Highlight-Overlays)
 * @property {boolean} [focus]  Zoom-on-click Flag (Tutorial)
 */

function validateStep(step, index) {
  if (!step || typeof step !== "object") {
    throw new Error(`Flow-Schritt #${index}: muss ein Objekt sein.`);
  }
  if (!step.id) {
    throw new Error(`Flow-Schritt #${index}: 'id' fehlt.`);
  }
  if (!VALID_ACTIONS.includes(step.action)) {
    throw new Error(
      `Flow-Schritt "${step.id}": ungültige Aktion "${step.action}". Erlaubt: ${VALID_ACTIONS.join(", ")}`
    );
  }
  if (step.action === "goto" && !step.url) {
    throw new Error(`Flow-Schritt "${step.id}": 'goto' benötigt 'url'.`);
  }
  if (["click", "type", "hover", "select"].includes(step.action) && !step.selector) {
    throw new Error(`Flow-Schritt "${step.id}": '${step.action}' benötigt 'selector'.`);
  }
  if (["type", "select"].includes(step.action) && step.text === undefined) {
    throw new Error(`Flow-Schritt "${step.id}": '${step.action}' benötigt 'text'.`);
  }
}

/**
 * Lädt und validiert einen Flow aus einer JSON-Datei.
 * @param {string} filePath absoluter Pfad zur flow.json
 * @returns {{steps: FlowStep[], meta: object}}
 */
function loadFlow(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Flow-Datei nicht gefunden: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, "utf-8"));
  if (!raw || typeof raw !== "object") {
    throw new Error(`Ungültiges JSON in Flow-Datei: ${abs}`);
  }
  const steps = raw.steps || raw;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`Flow-Datei enthält keine Schritte: ${abs}`);
  }
  steps.forEach((s, i) => validateStep(s, i));
  return { steps, meta: raw.meta || {} };
}

/**
 * Erzeugt einen minimalen Default-Flow (nur goto), kompatibel mit M0.
 * @param {string} url
 * @returns {{steps: FlowStep[], meta: object}}
 */
function defaultFlow(url) {
  return {
    steps: [{ id: "initial", action: "goto", url }],
    meta: { generated: true },
  };
}

module.exports = { loadFlow, defaultFlow, validateStep, VALID_ACTIONS };
