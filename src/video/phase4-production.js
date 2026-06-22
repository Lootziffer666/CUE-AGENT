"use strict";

/**
 * Phase 4: Production.
 *
 * Anti-Slop-Lint + Renderer-Aufruf. Erzeugt das stumme MP4.
 */

const { render } = require("../render");

/**
 * Anti-Slop-Lint: prüft HTML-Szenen auf verbotene Patterns.
 * Gibt Warnungen zurück (blockiert nicht, aber meldet).
 */
function lintScenes(scenePaths, logger) {
  const fs = require("fs");
  const warnings = [];
  const FORBIDDEN = [
    { pattern: /clipPath/i, msg: "clipPath-Transition gefunden (Anti-Slop: verwende crossfade statt clipPath)" },
    { pattern: /tl\.from\s*\(/, msg: "tl.from() gefunden (Anti-Slop: verwende tl.fromTo() für Opacity-Stagger)" },
    { pattern: /\.play\(\)/, msg: ".play() gefunden (Anti-Slop: deterministic seek statt play)" },
    { pattern: /animate\s*\(\s*{[^}]*(?:display|visibility)\s*:/i, msg: "display/visibility-Animation (Anti-Slop: verwende opacity + pointer-events)" },
    { pattern: /transform3d|rotateX|rotateY|rotateZ/i, msg: "3D-Transform in Transition (Anti-Slop: bleibe bei 2D)" },
  ];

  for (const sp of scenePaths) {
    const html = fs.readFileSync(sp, "utf-8");
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(html)) {
        warnings.push({ file: sp, msg: rule.msg });
      }
    }
  }

  if (warnings.length > 0 && logger) {
    logger.warn(`Anti-Slop-Lint: ${warnings.length} Warnung(en):`);
    warnings.forEach((w) => logger.warn(`  ${w.file}: ${w.msg}`));
  }

  return warnings;
}

/**
 * @param {object} args
 * @param {string[]} args.scenePaths
 * @param {object} args.cfg
 * @param {string} args.projectDir
 * @param {object} [args.logger]
 * @returns {Promise<{mp4Path:string, frames:number, durationSec:number, lintWarnings:Array}>}
 */
async function runProduction({ scenePaths, scenes, cfg, projectDir, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {}, error() {} };
  log.info("Phase 4: Production");

  // Anti-Slop-Lint
  const lintWarnings = lintScenes(scenePaths, log);

  // Render (scenes enthält ggf. clip-Metadaten pro Szene)
  const result = await render({
    scenePaths,
    scenes,
    cfg,
    outDir: projectDir,
    logger: log,
  });

  return { ...result, lintWarnings };
}

module.exports = { runProduction, lintScenes };
