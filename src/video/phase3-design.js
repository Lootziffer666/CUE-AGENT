"use strict";

/**
 * Phase 3: Design.
 *
 * Generiert aus dem Storyboard + Brand-Preset die HTML-Szenen-Dateien.
 * Schreibt DESIGN.md und scenes/*.html.
 */

const fs = require("fs");
const path = require("path");
const { ensureDir, writeText } = require("../util");
const { getPreset } = require("../design-systems");
const templates = require("../templates/scenes");

/**
 * @param {object} args
 * @param {object} args.storyboard
 * @param {object} args.context
 * @param {string} args.projectDir
 * @param {string} [args.screenshotsDir]   Pfad zu Screenshots (für <img src>)
 * @param {object} [args.logger]
 * @returns {{scenePaths:string[], designMdPath:string}}
 */
function generateDesign({ storyboard, context, projectDir, screenshotsDir, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("Phase 3: Design");

  const brand = getPreset(context.brand);
  const scenesDir = path.join(projectDir, "scenes");
  ensureDir(scenesDir);

  const scenePaths = [];

  storyboard.scenes.forEach((scene, i) => {
    const filename = `${String(i).padStart(2, "0")}-${scene.id}.html`;
    const filepath = path.join(scenesDir, filename);
    let html = "";

    const screenshotSrc = scene.screenshotFile
      ? (screenshotsDir
        ? path.relative(scenesDir, path.join(screenshotsDir, scene.screenshotFile))
        : scene.screenshotFile)
      : "";

    switch (scene.type) {
      case "title":
        html = templates.titleCard(brand, {
          title: scene.title,
          subtitle: scene.subtitle,
        });
        break;

      case "screenshot":
        html = templates.screenshotScene(brand, {
          heading: scene.heading,
          screenshotFile: screenshotSrc,
          caption: scene.caption,
          chapter: scene.chapter,
        });
        break;

      case "features":
        html = templates.featureList(brand, {
          heading: scene.heading,
          features: scene.features,
        });
        break;

      case "cta":
        html = templates.ctaScene(brand, {
          heading: scene.heading,
          url: scene.url,
        });
        break;

      case "chapter":
        html = templates.chapterCard(brand, {
          number: scene.number,
          goal: scene.goal,
        });
        break;

      default:
        html = templates.titleCard(brand, { title: scene.id, subtitle: "" });
    }

    fs.writeFileSync(filepath, html, "utf-8");
    scenePaths.push(filepath);
  });

  // DESIGN.md
  const designMd = `# Design Contract

**Brand:** ${brand.label}
**Palette:** bg=${brand.palette.bg}, accent=${brand.palette.accent}, text=${brand.palette.text}
**Typography:** ${brand.typography.fontFamily}, heading ${brand.typography.headingSize}
**Motion:** ease=${brand.motion.easeOut}, duration=${brand.motion.durationMedium}s, stagger=${brand.motion.stagger}s
**Layout:** max-width=${brand.layout.maxWidth}, padding=${brand.layout.padding}, radius=${brand.layout.borderRadius}

## Scenes (${scenePaths.length})

${storyboard.scenes.map((s, i) => `${i + 1}. [${s.type}] ${s.id} (${s.duration}s)`).join("\n")}
`;
  const designMdPath = path.join(projectDir, "DESIGN.md");
  writeText(designMdPath, designMd);

  log.ok(`${scenePaths.length} Szenen generiert + DESIGN.md`);
  return { scenePaths, designMdPath };
}

module.exports = { generateDesign };
