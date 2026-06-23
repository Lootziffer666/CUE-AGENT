"use strict";

/**
 * Polish-Layer (Phase A) — Studio-Frame + deterministischer Auto-Zoom.
 *
 * Eigenständige Reimplementierung der Politur-Ideen (Recordly-Niveau, aber
 * unser Code): ein gestylter Frame um die App-Aufnahme und ein Auto-Zoom, der
 * — anders als heuristische Cursor-Zooms — auf die BEKANNTE Highlight-BBox
 * (das tatsächlich interaktive Element) zoomt.
 *
 * Anti-Slop-konform: alle Transforms laufen am Wrapper (.screenshot-wrap),
 * nie am <img>/<video>; alles ist via GSAP-Timeline deterministisch seekbar.
 *
 * Reine String-Helfer (kein DOM/Render) → einfach testbar.
 */

/**
 * CSS für den Studio-Frame: Gradient-/Wallpaper-Backdrop hinter der Aufnahme,
 * weicher Schatten, Radius, optionaler Blur. Überschreibt gezielt .scene/.screenshot-wrap.
 * @param {object} brand   Brand-Preset (palette/...)
 * @param {object} [frame] { wallpaper?, background?, gradient?, radius?, shadow?, maxWidth?, blur? }
 * @returns {string} CSS
 */
function framePresentationCss(brand, frame = {}) {
  const p = brand.palette || {};
  const backdrop = frame.wallpaper
    ? `url("${frame.wallpaper}") center / cover no-repeat`
    : frame.background || frame.gradient || p.gradient || p.bg || "#0d0d0d";
  const radius = frame.radius || "18px";
  const shadow = frame.shadow || "0 40px 120px rgba(0,0,0,0.55)";
  const maxWidth = frame.maxWidth || "78%";
  const blur = frame.blur ? `backdrop-filter: blur(${frame.blur}); -webkit-backdrop-filter: blur(${frame.blur});` : "";
  return `
/* Polish: Studio-Frame */
.scene { background: ${backdrop} !important; }
.screenshot-wrap {
  margin-top: 0 !important;
  border-radius: ${radius} !important;
  box-shadow: ${shadow} !important;
  max-width: ${maxWidth} !important;
  ${blur}
}`;
}

/**
 * Deterministischer Auto-Zoom auf die Highlight-BBox: rein → halten → raus.
 * @param {object} highlight { xPct,yPct,wPct,hPct, zoomScale? }
 * @param {object} motion    brand.motion (durationSlow/easeInOut)
 * @param {number} [startAt=1.2] Startzeitpunkt (s)
 * @returns {string} GSAP-Timeline-Code (an `tl` angehängt) oder ""
 */
function autoZoomTimeline(highlight, motion, startAt = 1.2) {
  if (!highlight || !highlight.wPct) return "";
  const ox = (highlight.xPct + highlight.wPct / 2).toFixed(1);
  const oy = (highlight.yPct + highlight.hPct / 2).toFixed(1);
  const scale = highlight.zoomScale || 1.18;
  const dur = motion.durationSlow;
  const ease = motion.easeInOut;
  return `
gsap.set(".screenshot-wrap", { transformOrigin: "${ox}% ${oy}%" });
tl.to(".screenshot-wrap", { scale: ${scale}, duration: ${dur}, ease: "${ease}" }, ${startAt});
tl.to(".screenshot-wrap", { scale: 1, duration: ${dur}, ease: "${ease}" }, "+=0.5");`;
}

module.exports = { framePresentationCss, autoZoomTimeline, cursorOverlayCss, cursorMarkup, cursorTimeline };

// ── Polish-Phase B: Cursor-Overlay ──────────────────────────────────────────
// Ein deterministisch animierter Maus-Cursor, der auf die Highlight-BBox fährt
// und dort einen "Klick" (Skalier-Puls + auslaufender Ring) ausführt. Cursor &
// Ring liegen IM .screenshot-wrap, damit ihre %-Koordinaten exakt dem Highlight
// entsprechen. Anti-Slop-konform: nur opacity/left/top/scale via GSAP, seekbar.

/** SVG-Cursor + Klick-Ring als Markup (in .screenshot-wrap einzusetzen). */
function cursorMarkup() {
  return `<div class="cue-click-ring"></div>
  <div class="cue-cursor"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2 L3 20 L8 15 L11.5 22 L14.5 20.7 L11 14 L18 14 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg></div>`;
}

/** CSS für Cursor + Klick-Ring. */
function cursorOverlayCss(brand) {
  const accent = (brand.palette || {}).accent || "#ffffff";
  return `
/* Polish-B: Cursor-Overlay */
.screenshot-wrap { position: relative; }
.cue-cursor { position:absolute; top:0; left:0; width:30px; height:30px; z-index:60; pointer-events:none; opacity:0; transform-origin:0% 0%; will-change:left,top,transform; }
.cue-cursor svg { display:block; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.55)); }
.cue-click-ring { position:absolute; top:0; left:0; width:54px; height:54px; margin:-27px 0 0 -27px; border-radius:50%; border:3px solid ${accent}; z-index:59; pointer-events:none; opacity:0; }`;
}

/**
 * GSAP-Timeline: Cursor erscheint, fährt zum Highlight-Zentrum, Klick-Puls + Ring.
 * @param {object} highlight { xPct,yPct,wPct,hPct }
 * @param {object} motion    brand.motion
 * @param {number} [startAt=0.6]
 * @returns {string} GSAP-Code (an `tl` angehängt) oder ""
 */
function cursorTimeline(highlight, motion, startAt = 0.6) {
  if (!highlight || !highlight.wPct) return "";
  const cx = (highlight.xPct + highlight.wPct / 2).toFixed(1);
  const cy = (highlight.yPct + highlight.hPct / 2).toFixed(1);
  const startX = Math.max(0, highlight.xPct - 16).toFixed(1);
  const startY = Math.min(100, highlight.yPct + highlight.hPct + 18).toFixed(1);
  const move = motion.durationSlow;
  const ease = motion.easeInOut;
  return `
gsap.set(".cue-cursor", { left: "${startX}%", top: "${startY}%", opacity: 0, scale: 1 });
gsap.set(".cue-click-ring", { left: "${cx}%", top: "${cy}%", opacity: 0, scale: 0.2 });
tl.to(".cue-cursor", { opacity: 1, duration: ${motion.durationFast}, ease: "${motion.easeOut}" }, ${startAt});
tl.to(".cue-cursor", { left: "${cx}%", top: "${cy}%", duration: ${move}, ease: "${ease}" }, ${startAt});
tl.to(".cue-cursor", { scale: 0.82, duration: 0.12, ease: "power2.in" }, ">-0.05");
tl.to(".cue-cursor", { scale: 1, duration: 0.18, ease: "power2.out" });
tl.fromTo(".cue-click-ring", { opacity: 0.9, scale: 0.2 }, { opacity: 0, scale: 1.45, duration: 0.5, ease: "power2.out" }, "<");`;
}
