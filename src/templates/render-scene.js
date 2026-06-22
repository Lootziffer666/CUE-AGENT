"use strict";

/**
 * Rendert eine einzelne Szene zu HTML — gemeinsam genutzt von Phase 3
 * (Datei-Erzeugung) und dem Configurator-Server (Live-Vorschau im Player).
 *
 * Für die Vorschau brauchen wir kein echtes Asset: Screenshot-/Clip-/Bild-
 * Szenen fallen auf ein Platzhalter-Overlay bzw. eine Title-Card zurück.
 */

const templates = require("./scenes");

/**
 * @param {object} args
 * @param {object} args.scene   Szenen-Objekt aus dem Storyboard/Script
 * @param {object} args.brand   Brand-Preset (palette/typography/motion/layout)
 * @param {object} args.dims    { width, height }
 * @param {object} [args.opts]  { screenshotSrc } optionaler Bild-/Screenshot-Pfad
 * @returns {string} vollständiges HTML
 */
function renderSceneHtml({ scene, brand, dims, opts = {} }) {
  const duration = scene.duration;
  switch (scene.type) {
    case "title":
      return templates.titleCard(brand, { title: scene.title, subtitle: scene.subtitle, dims, duration });

    case "features":
      return templates.featureList(brand, { heading: scene.heading, features: scene.features, dims, duration });

    case "cta":
      return templates.ctaScene(brand, { heading: scene.heading, url: scene.url, dims, duration });

    case "chapter":
      return templates.chapterCard(brand, { number: scene.number, goal: scene.goal, dims, duration });

    case "screenshot":
      if (opts.screenshotSrc) {
        return templates.screenshotScene(brand, {
          heading: scene.heading, screenshotFile: opts.screenshotSrc,
          caption: scene.caption, chapter: scene.chapter, highlight: scene.highlight, dims, duration,
        });
      }
      // Vorschau ohne Bild → Overlay/Platzhalter
      return templates.clipOverlay(brand, { heading: scene.heading || scene.id, caption: scene.caption, chapter: scene.chapter, dims });

    case "clip":
    case "image":
      // Vorschau: nur das Brand-Overlay (der echte Clip/das Bild kommt beim Render)
      return templates.clipOverlay(brand, { heading: scene.heading || scene.id, caption: scene.caption, chapter: scene.chapter, dims });

    default:
      return templates.titleCard(brand, { title: scene.title || scene.id || "Szene", subtitle: scene.subtitle || "", dims, duration });
  }
}

module.exports = { renderSceneHtml };
