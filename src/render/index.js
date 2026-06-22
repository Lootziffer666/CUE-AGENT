"use strict";

/**
 * Renderer-Abstraktion.
 * Default: eingebauter Renderer (builtin). Später: hyperframes als Plugin.
 */

const { renderBuiltin } = require("./builtin");
const { renderHyperframes } = require("./hyperframes");

async function render(args) {
  const renderer = (args.cfg && args.cfg.video && args.cfg.video.renderer) || "builtin";
  switch (renderer) {
    case "builtin":
      return renderBuiltin(args);
    case "hyperframes":
      return renderHyperframes(args);
    default:
      throw new Error(`Unbekannter Renderer: ${renderer}`);
  }
}

module.exports = { render };
