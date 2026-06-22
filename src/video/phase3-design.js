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
function generateDesign({ storyboard, context, projectDir, screenshotsDir, videoSource, dims, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("Phase 3: Design");

  const brand = getPreset(context.brand);
  const scenesDir = path.join(projectDir, "scenes");
  ensureDir(scenesDir);

  const sceneDims = dims || { width: 1920, height: 1080 };
  const scenePaths = [];
  const renderScenes = []; // aligned mit scenePaths; enthält ggf. clip-Metadaten

  storyboard.scenes.forEach((scene, i) => {
    const isClip = scene.type === "clip";
    const filename = `${String(i).padStart(2, "0")}-${scene.id}${isClip ? ".overlay" : ""}.html`;
    const filepath = path.join(scenesDir, filename);
    let html = "";
    let clipMeta = null;

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
          dims: sceneDims,
          duration: scene.duration,
        });
        break;

      case "screenshot":
        html = templates.screenshotScene(brand, {
          heading: scene.heading,
          screenshotFile: screenshotSrc,
          caption: scene.caption,
          chapter: scene.chapter,
          highlight: scene.highlight || null,
          dims: sceneDims,
          duration: scene.duration,
        });
        break;

      case "clip":
        // Transparentes Overlay; der echte Video-Clip kommt vom Renderer (ffmpeg)
        html = templates.clipOverlay(brand, {
          heading: scene.heading,
          caption: scene.caption,
          chapter: scene.chapter,
          dims: sceneDims,
        });
        clipMeta = videoSource
          ? { source: videoSource, start: scene.clipStart || 0, duration: scene.clipDuration || 4 }
          : null;
        break;

      case "features":
        html = templates.featureList(brand, {
          heading: scene.heading,
          features: scene.features,
          dims: sceneDims,
          duration: scene.duration,
        });
        break;

      case "cta":
        html = templates.ctaScene(brand, {
          heading: scene.heading,
          url: scene.url,
          dims: sceneDims,
          duration: scene.duration,
        });
        break;

      case "chapter":
        html = templates.chapterCard(brand, {
          number: scene.number,
          goal: scene.goal,
          dims: sceneDims,
          duration: scene.duration,
        });
        break;

      default:
        html = templates.titleCard(brand, { title: scene.id, subtitle: "", dims: sceneDims, duration: scene.duration });
    }

    fs.writeFileSync(filepath, html, "utf-8");
    scenePaths.push(filepath);
    // Wenn Clip aber keine Video-Quelle: auf Screenshot/animiert zurückfallen (clipMeta=null)
    renderScenes.push({ clip: clipMeta });
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
  return { scenePaths, renderScenes, designMdPath };
}

module.exports = { generateDesign };
