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

module.exports = { framePresentationCss, autoZoomTimeline };
