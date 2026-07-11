"use strict";

/**
 * Zeitliche Konsistenz-Metriken auf rohen RGBA-Frames.
 *
 * assetpilot.md: „CUE-AGENT überprüft anschließend automatisch die zeitliche
 * Konsistenz" — Kamerafahrten, Wetterwechsel, Lichtwechsel, Shader-Übergänge.
 * Diese Datei enthält NUR reine Funktionen (kein Browser, kein I/O), damit die
 * Regeln unit-testbar sind. Der Runner (temporal.js) liefert die Frames.
 *
 * Frame-Format: { phase: string, kind: "idle"|"transition"|"state", data: RGBA-Array }
 * - "idle":       Szene läuft ohne Eingriff → darf nicht statisch wirken (SHADED)
 *                 bzw. darf nicht flackern (generische Apps).
 * - "transition": gradueller Parameter-/Wetter-/Licht-Übergang → keine Sprünge.
 * - "state":      neuer Weltzustand nach einem Parameterwechsel → muss sich
 *                 sichtbar vom vorherigen Phasen-Ende unterscheiden.
 */

const DEFAULT_THRESHOLDS = {
  minMotion: 0.35,     // mittlere Kanaldifferenz, unter der ein Frame-Paar als statisch gilt
  maxJump: 40,         // mittlere Kanaldifferenz, ab der ein Übergangs-Schritt als Sprung gilt
  minResponse: 1.5,    // Zustandswechsel muss mindestens so viel Bild bewegen
  maxStaticRatio: 0.5, // Anteil statischer Paare, ab dem eine Idle-Phase als statisch gilt
  maxIdleFlicker: 25,  // Idle-Sprünge oberhalb davon = Flackern (Instabilität)
};

/** Mittlere absolute Kanaldifferenz (RGB, Alpha ignoriert) zweier RGBA-Puffer. */
function meanAbsDiff(a, b) {
  if (!a || !b || a.length !== b.length) {
    throw new Error("meanAbsDiff: Frame-Puffer fehlen oder haben ungleiche Größe");
  }
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return n ? sum / n : 0;
}

/** Standardabweichung der Helligkeit eines RGBA-Puffers (Blank-Detektor). */
function pixelStdDev(data) {
  if (!data || data.length < 4) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    count++;
  }
  const mean = sum / count;
  let varSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    varSum += (lum - mean) * (lum - mean);
  }
  return Math.sqrt(varSum / count);
}

/**
 * Analysiert eine Frame-Sequenz phasenweise.
 *
 * @param {Array<{phase:string, kind:string, data:ArrayLike<number>}>} frames
 * @param {object} [options]
 * @param {object} [options.thresholds]  Overrides für DEFAULT_THRESHOLDS
 * @param {boolean} [options.expectAlive] true (SHADED): Idle-Statik ist ein Befund;
 *                                        false: Statik ist nur informativ.
 * @returns {{phases:Array, findings:Array, score:number, verdict:string}}
 */
function analyzeSequence(frames, options = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const expectAlive = options.expectAlive !== false;
  const findings = [];
  const phases = [];

  // Frames in Phasen-Reihenfolge gruppieren (aufeinanderfolgende gleiche phase)
  const groups = [];
  for (const f of frames) {
    const last = groups[groups.length - 1];
    if (last && last.phase === f.phase) last.frames.push(f);
    else groups.push({ phase: f.phase, kind: f.kind || "idle", frames: [f] });
  }

  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const diffs = [];
    for (let i = 1; i < grp.frames.length; i++) {
      diffs.push(meanAbsDiff(grp.frames[i - 1].data, grp.frames[i].data));
    }
    const maxDiff = diffs.length ? Math.max(...diffs) : 0;
    const meanDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const staticPairs = diffs.filter((d) => d < t.minMotion).length;
    const staticRatio = diffs.length ? staticPairs / diffs.length : 0;

    const stat = {
      phase: grp.phase,
      kind: grp.kind,
      frameCount: grp.frames.length,
      meanDiff: Number(meanDiff.toFixed(3)),
      maxDiff: Number(maxDiff.toFixed(3)),
      staticRatio: Number(staticRatio.toFixed(3)),
    };
    phases.push(stat);

    if (grp.kind === "idle") {
      if (expectAlive && diffs.length && staticRatio > t.maxStaticRatio) {
        findings.push({
          severity: "high",
          category: "temporal-static",
          phase: grp.phase,
          message: `Szene wirkt statisch in Phase "${grp.phase}" (${Math.round(staticRatio * 100)} % der Frame-Paare ohne Bewegung) — lebendige Szenen dürfen nie stillstehen.`,
        });
      }
      if (maxDiff > t.maxIdleFlicker) {
        findings.push({
          severity: "medium",
          category: "temporal-flicker",
          phase: grp.phase,
          message: `Instabilität/Flackern in Idle-Phase "${grp.phase}" (max. Frame-Differenz ${maxDiff.toFixed(1)} > ${t.maxIdleFlicker}).`,
        });
      }
    }

    if (grp.kind === "transition") {
      const jumps = diffs.filter((d) => d > t.maxJump);
      if (jumps.length) {
        findings.push({
          severity: "high",
          category: "temporal-jump",
          phase: grp.phase,
          message: `Sprung im Übergang "${grp.phase}": ${jumps.length} Schritt(e) mit Frame-Differenz > ${t.maxJump} (max. ${maxDiff.toFixed(1)}) — Übergänge müssen kontinuierlich sein.`,
        });
      }
    }

    // Zustandswechsel: erster Frame der Phase gegen letzten Frame der Vorphase
    if (grp.kind === "state" && g > 0) {
      const prev = groups[g - 1];
      const before = prev.frames[prev.frames.length - 1].data;
      const after = grp.frames[0].data;
      const response = meanAbsDiff(before, after);
      stat.responseDiff = Number(response.toFixed(3));
      if (response < t.minResponse) {
        findings.push({
          severity: "high",
          category: "temporal-unresponsive",
          phase: grp.phase,
          message: `Zustandswechsel "${prev.phase}" → "${grp.phase}" ohne sichtbare Wirkung (Frame-Differenz ${response.toFixed(2)} < ${t.minResponse}).`,
        });
      }
    }
  }

  const penalty = findings.reduce(
    (sum, f) => sum + (f.severity === "high" ? 30 : f.severity === "medium" ? 15 : 5),
    0
  );
  const score = Math.max(0, 100 - penalty);
  const verdict = findings.some((f) => f.severity === "high")
    ? "AUFFAELLIG"
    : "KONSISTENT";

  return { phases, findings, score, verdict };
}

/**
 * Spielbarkeits-Urteil aus deterministischen Signalen (assetpilot.md:
 * „CUE-AGENT sagt nicht: Das ist gut. Sondern: Das ist belegbar spielbar.").
 * Reine Funktion — der Runner (playable.js) sammelt die Signale.
 */
function evaluatePlayability(signals) {
  const checks = [
    {
      id: "startet",
      label: "App startet (Navigation ok, Bild nicht leer)",
      ok: Boolean(signals.navOk) && !signals.blank,
    },
    {
      id: "fehlerfrei",
      label: "Keine Konsolen-/Seiten-/Serverfehler",
      ok: (signals.consoleErrors || 0) === 0 && (signals.pageErrors || 0) === 0 && (signals.serverErrors || 0) === 0,
    },
    {
      id: "bedienbar",
      label: "Interaktive Elemente vorhanden",
      ok: (signals.interactiveCount || 0) > 0,
    },
    {
      id: "reagiert",
      label: "Interaktion erzeugt sichtbare Reaktion",
      ok: Boolean(signals.responded),
    },
    {
      id: "beweise",
      label: "Screenshot-Beweise gesichert",
      ok: (signals.proofCount || 0) >= 2,
    },
  ];
  const failed = checks.filter((c) => !c.ok);
  return {
    checks,
    verdict: failed.length === 0 ? "BELEGBAR SPIELBAR" : "NICHT BELEGT",
    failed: failed.map((c) => c.id),
  };
}

module.exports = {
  DEFAULT_THRESHOLDS,
  meanAbsDiff,
  pixelStdDev,
  analyzeSequence,
  evaluatePlayability,
};
