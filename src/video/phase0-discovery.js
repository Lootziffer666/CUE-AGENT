"use strict";

/**
 * Phase 0: Discovery.
 *
 * Im --auto-Modus leitet Discovery den Kontext aus URL, Flow und CLI-Flags ab.
 * Im interaktiven Modus (M4+) werden Fragen gestellt.
 * Gibt context.json zurück.
 */

function runDiscovery({ url, cfg, mode, flow, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("Phase 0: Discovery");

  const context = {
    url,
    mode, // promo | tutorial | showcase
    lang: cfg.lang,
    duration: (cfg.video && cfg.video.durationSec) || 60,
    aspect: (cfg.video && cfg.video.aspect) || "16:9",
    brand: (cfg.video && cfg.video.brand) || "vercel",
    voice: (cfg.audio && cfg.audio.voice) || "matilda",
    audience: "general",
    goal: mode === "promo"
      ? "Produce a compelling promo video highlighting key features"
      : mode === "tutorial"
        ? "Create a step-by-step tutorial walking through the main flow"
        : "Showcase the product with a guided walkthrough",
    flowSteps: flow && Array.isArray(flow.steps) ? flow.steps.length : 1,
  };

  log.ok(`Discovery: mode=${mode}, brand=${context.brand}, ${context.duration}s, ${context.aspect}`);
  return context;
}

module.exports = { runDiscovery };
