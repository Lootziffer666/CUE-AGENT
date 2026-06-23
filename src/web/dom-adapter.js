"use strict";

/**
 * Web-Adapter für den Design-Iterations-Loop (Playwright).
 *
 * Liefert die plattformspezifischen Bausteine, die iterateToBaseline() braucht:
 *   captureActual(page, spec) → Ist-Elemente [{id,text,bbox,color}]
 *   applyEdits(page, edits, history) → CSS-Overrides injizieren (reversibel)
 *   rollback(page, history) → letzte Edit-Charge zurücknehmen
 *
 * WICHTIG (non-destruktiv): Wir verändern NICHT den Quellcode der Zielseite,
 * sondern injizieren CSS-Overrides via <style id="cue-iter"> in die laufende
 * Seite. Das Ergebnis ist eine fertige CSS-Diff, die der Mensch übernehmen kann.
 * Re-Render = die Injektion wirkt sofort im DOM (kein Reload nötig).
 */

const { chromium } = require("playwright");

/** "rgb(37, 99, 235)" | "rgba(..)" | "#2563eb" → [r,g,b] | null */
function parseColor(s) {
  if (!s) return null;
  const m = String(s).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = String(s).trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(h)) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  if (/^[0-9a-f]{3}$/i.test(h)) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return null;
}

async function launch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  return { browser, page };
}

async function open(page, target) {
  // target: http(s)/file URL oder roher HTML-String
  if (/^(https?|file):/i.test(target)) {
    await page.goto(target, { waitUntil: "networkidle" }).catch(() => page.goto(target));
  } else {
    await page.setContent(target, { waitUntil: "networkidle" }).catch(() => page.setContent(target));
  }
}

/**
 * Misst die Ist-Elemente passend zur Baseline-Spec.
 * Auflösung je Spec-Element: selector → exakter Textknoten.
 * Farbe: colorProp "background" (default) oder "text".
 */
async function captureActual(page, spec) {
  const specEls = (spec.elements || []).map((e) => ({
    id: e.id,
    selector: e.selector || null,
    text: e.text || null,
    colorProp: e.colorProp || "background",
  }));

  const raw = await page.evaluate((els) => {
    const leafByText = (t) => {
      const all = Array.from(document.querySelectorAll("body *"));
      return all.find((e) => (e.textContent || "").trim() === t) || null;
    };
    const measure = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        bbox: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        bg: cs.backgroundColor,
        fg: cs.color,
        text: (el.textContent || "").trim(),
      };
    };
    return els.map((s) => {
      let el = null;
      if (s.selector) el = document.querySelector(s.selector);
      if (!el && s.text) el = leafByText(s.text);
      const m = measure(el);
      return m ? { id: s.id, colorProp: s.colorProp, ...m } : { id: s.id, missing: true };
    });
  }, specEls);

  return raw
    .filter((r) => !r.missing)
    .map((r) => ({
      id: r.id,
      text: r.text,
      bbox: r.bbox,
      color: parseColor(r.colorProp === "text" ? r.fg : r.bg),
    }));
}

/** Baut aus dem History-Stack ein kumuliertes Stylesheet. */
function buildCss(history) {
  return history
    .flat()
    .map((e) => {
      const decls = Object.entries(e.css || {})
        .map(([k, v]) => `${k}: ${v} !important`)
        .join("; ");
      return `${e.selector} { ${decls} }`;
    })
    .join("\n");
}

async function injectCss(page, css) {
  await page.evaluate((cssText) => {
    let s = document.getElementById("cue-iter");
    if (!s) {
      s = document.createElement("style");
      s.id = "cue-iter";
      document.head.appendChild(s);
    }
    s.textContent = cssText;
  }, css);
}

/** Wendet eine Edit-Charge an (Format: [{selector, css:{prop:value}}]). */
async function applyEdits(page, edits, history) {
  history.push(edits);
  await injectCss(page, buildCss(history));
}

/** Nimmt die letzte Edit-Charge zurück (NEVER-WORSE). */
async function rollback(page, history) {
  history.pop();
  await injectCss(page, buildCss(history));
}

module.exports = { launch, open, captureActual, applyEdits, rollback, buildCss, parseColor };
