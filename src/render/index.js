"use strict";

/**
 * Renderer-Abstraktion.
 * Default: eingebauter Renderer (builtin). Später: hyperframes als Plugin.
 */

const { renderBuiltin } = require("./builtin");

async function render(args) {
  const renderer = (args.cfg && args.cfg.video && args.cfg.video.renderer) || "builtin";
  switch (renderer) {
    case "builtin":
      return renderBuiltin(args);
    case "hyperframes":
      throw new Error("hyperframes-Renderer ist als Plugin geplant (M5). Nutze 'builtin'.");
    default:
      throw new Error(`Unbekannter Renderer: ${renderer}`);
  }
}

module.exports = { render };
