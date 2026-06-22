"use strict";

/**
 * Szenen-Template-Generator.
 *
 * Erzeugt HTML + Inline-GSAP für verschiedene Szenentypen.
 * Jede Funktion gibt einen vollständigen HTML-String zurück, der als
 * eigenständige Datei (scenes/XX-name.html) gespeichert und vom
 * Renderer per Playwright geöffnet wird.
 */

function wrapScene(brand, { body, gsapTimeline, duration = 3 }) {
  const p = brand.palette;
  const t = brand.typography;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1920px; height:1080px; overflow:hidden; background:${p.bg}; color:${p.text}; font-family:${t.fontFamily}; line-height:${t.lineHeight}; }
.scene { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${brand.layout.padding}; position:relative; }
.heading { font-size:${t.headingSize}; font-weight:${t.headingWeight}; text-align:center; opacity:0; }
.subheading { font-size:${t.subheadingSize}; font-weight:${t.bodyWeight}; color:${p.textMuted}; text-align:center; margin-top:24px; opacity:0; }
.accent-bar { width:80px; height:4px; background:${p.gradient}; border-radius:2px; margin-top:32px; opacity:0; }
.screenshot-wrap { margin-top:48px; border-radius:${brand.layout.borderRadius}; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,0.5); border:1px solid ${p.border}; opacity:0; transform:translateY(30px); }
.screenshot-wrap img { display:block; width:100%; height:auto; }
.caption-bar { position:absolute; bottom:60px; left:0; right:0; text-align:center; font-size:${t.captionSize}; color:${p.textMuted}; opacity:0; }
.chapter-badge { position:absolute; top:60px; left:80px; font-size:${t.captionSize}; color:${p.accent}; font-weight:600; opacity:0; letter-spacing:0.05em; text-transform:uppercase; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
</head>
<body>
<div class="scene">
${body}
</div>
<script>
const tl = gsap.timeline({ paused: true });
${gsapTimeline}
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
function titleCard(brand, { title, subtitle }) {
  const m = brand.motion;
  return wrapScene(brand, {
    body: `
  <h1 class="heading">${title}</h1>
  ${subtitle ? `<p class="subheading">${subtitle}</p>` : ""}
  <div class="accent-bar"></div>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, y:30}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);
${subtitle ? `tl.fromTo(".subheading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.5);` : ""}
tl.fromTo(".accent-bar", {opacity:0, scaleX:0}, {opacity:1, scaleX:1, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.7);`,
    duration: 3,
  });
}

/**
 * Screenshot-Szene: zeigt einen App-Screenshot mit optionaler Überschrift + Caption.
 */
function screenshotScene(brand, { heading, screenshotFile, caption, chapter }) {
  const m = brand.motion;
  return wrapScene(brand, {
    body: `
  ${chapter ? `<div class="chapter-badge">${chapter}</div>` : ""}
  ${heading ? `<h2 class="heading" style="font-size:2.5rem">${heading}</h2>` : ""}
  <div class="screenshot-wrap"><img src="${screenshotFile}" alt=""></div>
  ${caption ? `<div class="caption-bar">${caption}</div>` : ""}`,
    gsapTimeline: `
${chapter ? `tl.fromTo(".chapter-badge", {opacity:0, x:-20}, {opacity:1, x:0, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.1);` : ""}
${heading ? `tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);` : ""}
tl.fromTo(".screenshot-wrap", {opacity:0, y:30}, {opacity:1, y:0, duration:${m.durationSlow}, ease:"${m.easeOut}"}, 0.4);
${caption ? `tl.fromTo(".caption-bar", {opacity:0}, {opacity:1, duration:${m.durationFast}}, 1.2);` : ""}`,
    duration: 4,
  });
}

/**
 * Feature-List: 3-4 Features mit Stagger-Animation.
 */
function featureList(brand, { heading, features = [] }) {
  const m = brand.motion;
  const p = brand.palette;
  const items = features.map(
    (f) => `<li class="feature-item"><span class="feat-icon">\u2713</span> ${f}</li>`
  ).join("\n    ");
  return wrapScene(brand, {
    body: `
  <h2 class="heading" style="font-size:2.8rem">${heading || "Features"}</h2>
  <ul class="feature-list">${items}</ul>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.2);
tl.fromTo(".feature-item", {opacity:0, x:-30}, {opacity:1, x:0, duration:${m.durationMedium}, ease:"${m.easeOut}", stagger:${m.stagger * 2}}, 0.5);`,
    duration: 4,
  });
}

/**
 * CTA-Szene: Call-to-Action am Ende.
 */
function ctaScene(brand, { heading, url, buttonText }) {
  const m = brand.motion;
  const p = brand.palette;
  return wrapScene(brand, {
    body: `
  <h2 class="heading" style="font-size:3rem">${heading || "Jetzt starten"}</h2>
  <div class="cta-button" style="margin-top:40px;padding:16px 48px;background:${p.accent};color:#fff;font-size:1.25rem;font-weight:600;border-radius:8px;opacity:0;">${buttonText || url || "Los geht's"}</div>`,
    gsapTimeline: `
tl.fromTo(".heading", {opacity:0, scale:0.9}, {opacity:1, scale:1, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.3);
tl.fromTo(".cta-button", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.7);`,
    duration: 3,
  });
}

/**
 * Tutorial-Kapitel-Karte: Nummer + Ziel.
 */
function chapterCard(brand, { number, goal }) {
  const m = brand.motion;
  return wrapScene(brand, {
    body: `
  <div class="chapter-badge" style="position:static;font-size:1.25rem;">Schritt ${number}</div>
  <h2 class="heading" style="font-size:2.8rem;margin-top:24px;">${goal}</h2>
  <div class="accent-bar"></div>`,
    gsapTimeline: `
tl.fromTo(".chapter-badge", {opacity:0, y:-10}, {opacity:1, y:0, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.2);
tl.fromTo(".heading", {opacity:0, y:20}, {opacity:1, y:0, duration:${m.durationMedium}, ease:"${m.easeOut}"}, 0.4);
tl.fromTo(".accent-bar", {opacity:0, scaleX:0}, {opacity:1, scaleX:1, duration:${m.durationFast}, ease:"${m.easeOut}"}, 0.8);`,
    duration: 2.5,
  });
}

module.exports = { titleCard, screenshotScene, featureList, ctaScene, chapterCard, wrapScene };
