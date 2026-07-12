"use strict";

/**
 * Phase 1: Storytelling.
 *
 * Baut ein Storyboard aus dem Context + Flow. Im Auto-Modus deterministisch
 * (kein LLM nötig); im interaktiven Modus (M4+) wird Claude für Script genutzt.
 *
 * Narrativ-Strukturen:
 *   Promo:    Hook → Pain → Solution → Features → CTA
 *   Tutorial: Cold-Open (Payoff) → Kapitel 1..N → Recap
 *   Showcase: Intro → Walkthrough → Highlights → Closer
 */

/**
 * @param {object} args
 * @param {object} args.context   Discovery-Ergebnis
 * @param {object} args.flow      Flow-Definition
 * @param {object} [args.bundle]  CaptureBundle (für Screenshots)
 * @param {object} [args.logger]
 * @returns {object} storyboard
 */
function buildStoryboard({ context, flow, bundle, logger }) {
  const log = logger || { info() {}, ok() {} };
  log.info("Phase 1: Storytelling");

  const mode = context.mode;
  const scenes = [];
  const hasVideo = Boolean(bundle && bundle.video);

  // Berechnet ein Clip-Fenster (Start/Dauer) aus den videoStart-Zeitstempeln.
  function clipWindow(bundleStep) {
    if (!bundle || !bundle.flow) return null;
    const idx = bundle.flow.indexOf(bundleStep);
    const start = Math.max(0, bundleStep.videoStart || 0);
    const next = bundle.flow[idx + 1];
    let dur = next ? (next.videoStart - start) : 4;
    // Pacing: zwischen 2.5s und 6s
    dur = Math.min(6, Math.max(2.5, dur || 4));
    return { start, duration: dur };
  }

  // Liefert eine Clip-Szene (echtes Video) wenn möglich, sonst Screenshot
  // (mit Highlight-Spotlight + Zoom auf das geklickte Element, falls bbox vorhanden).
  function walkthroughScene(bundleStep, { heading, caption, chapter }) {
    const win = hasVideo ? clipWindow(bundleStep) : null;
    if (win) {
      return {
        type: "clip",
        id: `clip-${bundleStep.step}`,
        heading, caption, chapter,
        clipStart: win.start,
        clipDuration: win.duration,
        duration: win.duration,
      };
    }
    // Highlight aus Bounding-Box (relativ zum Capture-Viewport)
    let highlight = null;
    const vp = bundle && bundle.viewport;
    if (bundleStep.bbox && vp && vp.width && vp.height) {
      const b = bundleStep.bbox;
      highlight = {
        xPct: Math.max(0, (b.x / vp.width) * 100),
        yPct: Math.max(0, (b.y / vp.height) * 100),
        wPct: Math.min(100, (b.width / vp.width) * 100),
        hPct: Math.min(100, (b.height / vp.height) * 100),
        zoom: Boolean(bundleStep.focus),
      };
    }
    return {
      type: "screenshot",
      id: `shot-${bundleStep.step}`,
      heading, caption, chapter,
      screenshotFile: bundleStep.screenshot,
      highlight,
      duration: 4,
    };
  }

  if (mode === "promo") {
    // Hook (Title)
    scenes.push({
      type: "title",
      id: "hook",
      title: context.url.replace(/^https?:\/\//, ""),
      subtitle: context.goal,
      duration: 3,
    });

    // Feature scenes from flow steps
    const stepsWithGoal = ((flow && flow.steps) || []).filter((s) => s.goal);
    if (stepsWithGoal.length > 0) {
      scenes.push({
        type: "features",
        id: "features",
        heading: "Features",
        features: stepsWithGoal.map((s) => s.goal),
        duration: 4,
      });
    }

    // Screenshot scenes from bundle
    if (bundle && bundle.flow) {
      bundle.flow.forEach((s, i) => {
        if (s.screenshot && i < 4) {
          scenes.push({
            type: "screenshot",
            id: `shot-${s.step}`,
            heading: s.goal || s.step,
            screenshotFile: s.screenshot,
            caption: s.caption || null,
            duration: 4,
          });
        }
      });
    }

    // CTA
    scenes.push({
      type: "cta",
      id: "cta",
      heading: context.lang === "de" ? "Jetzt entdecken" : "Get started",
      url: context.url,
      duration: 3,
    });

  } else if (mode === "tutorial") {
    // Cold-Open: Payoff zuerst
    scenes.push({
      type: "title",
      id: "cold-open",
      title: context.lang === "de" ? "Das Ergebnis" : "The Result",
      subtitle: context.goal,
      duration: 3,
    });

    // Kapitel aus Flow-Schritten mit goal
    let chapterNum = 0;
    ((flow && flow.steps) || []).forEach((step) => {
      if (step.goal) {
        chapterNum++;
        // Kapitel-Karte
        scenes.push({
          type: "chapter",
          id: `chapter-${chapterNum}`,
          number: chapterNum,
          goal: step.goal,
          duration: 2.5,
        });
        // Clip (echtes Video) oder Screenshot-Fallback
        const bundleStep = bundle && bundle.flow
          ? bundle.flow.find((b) => b.step === step.id)
          : null;
        if (bundleStep && (bundleStep.screenshot || hasVideo)) {
          scenes.push(walkthroughScene(bundleStep, {
            heading: step.goal,
            caption: step.caption || null,
            chapter: `Schritt ${chapterNum}`,
          }));
        }
      }
    });

    // Recap
    scenes.push({
      type: "title",
      id: "recap",
      title: context.lang === "de" ? "Geschafft!" : "Done!",
      subtitle: context.lang === "de"
        ? `${chapterNum} Schritte abgeschlossen`
        : `${chapterNum} steps completed`,
      duration: 3,
    });

  } else {
    // Showcase
    scenes.push({
      type: "title",
      id: "intro",
      title: context.url.replace(/^https?:\/\//, ""),
      subtitle: context.lang === "de" ? "Produktvorstellung" : "Product Showcase",
      duration: 3,
    });

    if (bundle && bundle.flow) {
      bundle.flow.forEach((s) => {
        if (s.screenshot || hasVideo) {
          scenes.push(walkthroughScene(s, {
            heading: s.goal || s.step,
            caption: s.caption || null,
            chapter: null,
          }));
        }
      });
    }

    scenes.push({
      type: "cta",
      id: "closer",
      heading: context.lang === "de" ? "Mehr erfahren" : "Learn more",
      url: context.url,
      duration: 3,
    });
  }

  const storyboard = {
    mode,
    totalScenes: scenes.length,
    estimatedDuration: scenes.reduce((sum, s) => sum + (s.duration || 3), 0),
    scenes,
  };

  log.ok(`Storyboard: ${storyboard.totalScenes} Szenen, ~${storyboard.estimatedDuration}s`);
  return storyboard;
}

module.exports = { buildStoryboard };
