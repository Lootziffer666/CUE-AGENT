"use strict";

/**
 * Szenen-Template-Generator.
 *
 * Erzeugt HTML + Inline-GSAP für verschiedene Szenentypen.
 * Jede Funktion gibt einen vollständigen HTML-String zurück, der als
 * eigenständige Datei (scenes/XX-name.html) gespeichert und vom
 * Renderer per Playwright geöffnet wird.
 */

const fs = require("fs");
const path = require("path");
const templates_polish = require("../render/polish");

// GSAP wird lokal gevendort und inline in jede Szene eingebettet — kein CDN.
// Das macht den Render deterministisch und offline-fähig (das Kernversprechen
// des Tools): in gesandboxten Render-Umgebungen kann der Headless-Browser oft
// keine externen HTTPS-Ressourcen laden (z. B. ERR_CERT_AUTHORITY_INVALID),
// wodurch GSAP fehlte und Szenen statisch auf 3s kollabierten.
let _gsapSourceCache = null;
function gsapInlineScript() {
  if (_gsapSourceCache === null) {
    const vendorPath = path.join(__dirname, "..", "render", "vendor", "gsap.min.js");
    try {
      _gsapSourceCache = fs.readFileSync(vendorPath, "utf-8");
    } catch (err) {
      throw new Error(
        `GSAP-Vendor-Datei fehlt (${vendorPath}). ` +
          `Erwartet als Teil des Pakets — Szenen-Animationen brauchen GSAP lokal.`
      );
    }
  }
  // </script> im GSAP-Quelltext würde das umschließende Inline-Script vorzeitig
  // beenden — defensiv neutralisieren (kommt in GSAP nicht vor, aber sicher ist sicher).
  return `<script>${_gsapSourceCache.replace(/<\/script>/gi, "<\\/script>")}</script>`;
}

// HTML-Escaping für dynamische Textfelder (Titel, Captions, Features …),
// damit Sonderzeichen wie < > & " ' das Template nicht zerbrechen.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function wrapScene(brand, { body, gsapTimeline, duration = 3, dims, extraCss = "" }) {
  const p = brand.palette;
  const t = brand.typography;
  const W = (dims && dims.width) || 1920;
  const H = (dims && dims.height) || 1080;
  // Skalierungsfaktor für vertikale/quadratische Formate (Basis: 1080p Höhe)
  const isVertical = H > W;
  const headingScale = isVertical ? 0.75 : 1;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${W},height=${H}">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:${W}px; height:${H}px; overflow:hidden; background:${p.bg}; color:${p.text}; font-family:${t.fontFamily}; line-height:${t.lineHeight}; }
.scene { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${brand.layout.padding}; position:relative; text-align:center; }
.heading { font-size:calc(${t.headingSize} * ${headingScale}); font-weight:${t.headingWeight}; text-align:center; opacity:0; max-width:90%; }
.subheading { font-size:${t.subheadingSize}; font-weight:${t.bodyWeight}; color:${p.textMuted}; text-align:center; margin-top:24px; opacity:0; max-width:80%; }
.accent-bar { width:80px; height:4px; background:${p.gradient}; border-radius:2px; margin-top:32px; opacity:0; }
.screenshot-wrap { margin-top:48px; border-radius:${brand.layout.borderRadius}; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,0.5); border:1px solid ${p.border}; opacity:0; transform:translateY(30px); max-width:${isVertical ? "92%" : "70%"}; }
.screenshot-wrap img { display:block; width:100%; height:auto; }
.caption-bar { position:absolute; bottom:60px; left:0; right:0; text-align:center; font-size:${t.captionSize}; color:${p.textMuted}; opacity:0; }
.chapter-badge { position:absolute; top:60px; left:80px; font-size:${t.captionSize}; color:${p.accent}; font-weight:600; opacity:0; letter-spacing:0.05em; text-transform:uppercase; }
.feature-list { list-style:none; margin-top:48px; opacity:1; }
.feature-item { font-size:${t.bodySize}; margin:16px 0; opacity:0; display:flex; align-items:center; gap:16px; }
.feat-icon { color:${p.accent}; font-weight:700; }
/* Premium fade transition overlay */
#fade-overlay { position:absolute; inset:0; background:${p.bg}; opacity:1; pointer-events:none; z-index:100; }
${extraCss}
</style>
${gsapInlineScript()}
</head>
<body>
<div class="scene">
${body}
</div>
<div id="fade-overlay"></div>
<script>
const tl = gsap.timeline({ paused: true });
// Fade-in vom Hintergrund (Premium-Transition Anfang)
tl.fromTo("#fade-overlay", {opacity:1}, {opacity:0, duration:0.4, ease:"power1.out"}, 0);
${gsapTimeline}
// Fade-out zum Hintergrund (Premium-Transition Ende)
tl.to("#fade-overlay", {opacity:1, duration:0.4, ease:"power1.in"}, ${duration} - 0.4);
// Export for renderer: deterministic seek
window.__timeline = tl;
window.__duration = ${duration};
</script>
</body>
</html>`;
}

/**
 * Title-Card: große Überschrift + Untertitel + Akzentlinie.
 */
function titleCard(brand, { title, subtitle, dims, duration }) {
  const m = brand.motion;
  return wrapScene(brand, {
    dims,
    body: `
  <h1 class="heading">${escapeHtml(title)}</h1>
  ${subtitle ? `<p class="subheading">${escapeHtml(subtitle)}</p>` : ""}
  <div class="accent-bar"></div>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, y:30}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);
${subtitle ? `tl.fromTo(".subheading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.5);` : ""}
tl.fromTo(".accent-bar", {opacity:0, scaleX:0}, {opacity:1, scaleX:1, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.7);`,
    duration: duration || 3,
  });
}

/**
 * Screenshot-Szene: zeigt einen App-Screenshot mit optionaler Überschrift + Caption.
 */
function screenshotScene(brand, { heading, screenshotFile, caption, chapter, highlight, frame, dims, duration }) {
  const m = brand.motion;
  const p = brand.palette;
  const hl = highlight && highlight.wPct
    ? `<div class="hl-spot" style="left:${highlight.xPct}%;top:${highlight.yPct}%;width:${highlight.wPct}%;height:${highlight.hPct}%;"></div>`
    : "";
  const hlCss = highlight && highlight.wPct
    ? `.screenshot-wrap{position:relative;} .hl-spot{position:absolute;border:3px solid ${p.accent};border-radius:8px;box-shadow:0 0 0 4000px rgba(0,0,0,0.45),0 0 24px ${p.accent};opacity:0;pointer-events:none;}`
    : "";
  // Polish-Phase A: Studio-Frame (optional) + deterministischer Auto-Zoom (rein→halten→raus)
  const frameCss = frame ? templates_polish.framePresentationCss(brand, frame) : "";
  const zoomTween = highlight && highlight.zoom ? templates_polish.autoZoomTimeline(highlight, m) : "";
  // Polish-Phase B: Cursor-Overlay (optional) — fährt zum Highlight + Klick-Puls
  const useCursor = highlight && highlight.wPct && highlight.cursor;
  const cursorCss = useCursor ? templates_polish.cursorOverlayCss(brand) : "";
  const cursorHtml = useCursor ? templates_polish.cursorMarkup() : "";
  const cursorTween = useCursor ? templates_polish.cursorTimeline(highlight, m) : "";
  return wrapScene(brand, {
    dims,
    extraCss: hlCss + frameCss + cursorCss,
    body: `
  ${chapter ? `<div class="chapter-badge">${escapeHtml(chapter)}</div>` : ""}
  ${heading ? `<h2 class="heading" style="font-size:2.5rem">${escapeHtml(heading)}</h2>` : ""}
  <div class="screenshot-wrap"><img src="${screenshotFile}" alt="">${hl}${cursorHtml}</div>
  ${caption ? `<div class="caption-bar">${escapeHtml(caption)}</div>` : ""}`,
    gsapTimeline: `
${chapter ? `tl.fromTo(".chapter-badge", {opacity:0, x:-20}, {opacity:1, x:0, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.1);` : ""}
${heading ? `tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);` : ""}
tl.fromTo(".screenshot-wrap", {opacity:0, y:30}, {opacity:1, y:0, duration:${m.durationSlow}, ease:"${m.easeOut}"}, 0.4);
${hl ? `tl.fromTo(".hl-spot", {opacity:0}, {opacity:1, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 1.0);` : ""}
${cursorTween}
${zoomTween}
${caption ? `tl.fromTo(".caption-bar", {opacity:0}, {opacity:1, duration:${m.durationFast}}, 1.2);` : ""}`,
    duration: duration || 4,
  });
}

/**
 * Feature-List: 3-4 Features mit Stagger-Animation.
 */
function featureList(brand, { heading, features = [], dims, duration }) {
  const m = brand.motion;
  const p = brand.palette;
  const items = features.map(
    (f) => `<li class="feature-item"><span class="feat-icon">\u2713</span> ${escapeHtml(f)}</li>`
  ).join("\n    ");
  return wrapScene(brand, {
    dims,
    body: `
  <h2 class="heading" style="font-size:2.8rem">${escapeHtml(heading || "Features")}</h2>
  <ul class="feature-list">${items}</ul>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);
tl.fromTo(".feature-item", {opacity:0, x:-30}, {opacity:1, x:0, duration:${m.durationMedium}, ease:"${m.easeOut}", stagger:${m.stagger * 2}}, 0.5);`,
    duration: duration || 4,
  });
}

/**
 * CTA-Szene: Call-to-Action am Ende.
 */
function ctaScene(brand, { heading, url, buttonText, dims, duration }) {
  const m = brand.motion;
  const p = brand.palette;
  return wrapScene(brand, {
    dims,
    body: `
  <h2 class="heading" style="font-size:3rem">${escapeHtml(heading || "Jetzt starten")}</h2>
  <div class="cta-button" style="margin-top:40px;padding:16px 48px;background:${p.accent};color:#fff;font-size:1.25rem;font-weight:600;border-radius:8px;opacity:0;">${escapeHtml(buttonText || url || "Los geht's")}</div>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, scale:0.9}, {opacity:1, scale:1, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.3);
tl.fromTo(".cta-button", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.7);`,
    duration: duration || 3,
  });
}

/**
 * Tutorial-Kapitel-Karte: Nummer + Ziel.
 */
function chapterCard(brand, { number, goal, dims, duration }) {
  const m = brand.motion;
  return wrapScene(brand, {
    dims,
    body: `
  <div class="chapter-badge" style="position:static;font-size:1.25rem;">Schritt ${escapeHtml(number)}</div>
  <h2 class="heading" style="font-size:2.8rem;margin-top:24px;">${escapeHtml(goal)}</h2>
  <div class="accent-bar"></div>`,
    gsapTimeline: `
tl.fromTo(".chapter-badge", {opacity:0, y:-10}, {opacity:1, y:0, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.2);
tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.4);
tl.fromTo(".accent-bar", {opacity:0, scaleX:0}, {opacity:1, scaleX:1, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.8);`,
    duration: duration || 2.5,
  });
}

/**
 * Clip-Overlay: transparenter Hintergrund mit Brand-Caption (Lower-Third),
 * optionalem Chapter-Badge und Heading. Wird EINMAL als PNG gerendert und
 * vom Renderer über den echten Video-Clip gelegt.
 */
function clipOverlay(brand, { heading, caption, chapter, dims }) {
  const p = brand.palette;
  const t = brand.typography;
  const W = (dims && dims.width) || 1920;
  const H = (dims && dims.height) || 1080;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:${W}px; height:${H}px; background:transparent; overflow:hidden; font-family:${t.fontFamily}; }
.layer { position:absolute; inset:0; }
.chapter-badge { position:absolute; top:56px; left:64px; font-size:${t.captionSize}; color:#fff; background:${p.accent}; padding:8px 18px; border-radius:999px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; box-shadow:0 6px 20px rgba(0,0,0,0.35); }
.heading { position:absolute; top:48px; left:0; right:0; text-align:center; font-size:1.9rem; font-weight:${t.headingWeight}; color:#fff; text-shadow:0 2px 16px rgba(0,0,0,0.6); padding:0 120px; }
.caption-wrap { position:absolute; left:0; right:0; bottom:0; height:34%; background:linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.0) 100%); display:flex; align-items:flex-end; justify-content:center; padding:0 80px 64px; }
.caption { color:#fff; font-size:1.7rem; font-weight:600; text-align:center; text-shadow:0 2px 12px rgba(0,0,0,0.7); }
.caption .bar { display:inline-block; width:40px; height:4px; background:${p.gradient}; border-radius:2px; margin-bottom:18px; }
</style>
</head>
<body>
<div class="layer">
  ${chapter ? `<div class="chapter-badge">${escapeHtml(chapter)}</div>` : ""}
  ${heading ? `<div class="heading">${escapeHtml(heading)}</div>` : ""}
  ${caption ? `<div class="caption-wrap"><div class="caption"><span class="bar"></span><br>${escapeHtml(caption)}</div></div>` : ""}
</div>
</body>
</html>`;
}

module.exports = { titleCard, screenshotScene, featureList, ctaScene, chapterCard, clipOverlay, wrapScene };
