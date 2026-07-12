"use strict";

/**
 * Polish-Phase B: Speed-Ramping für Clip-Segmente (deterministisch, via ffmpeg
 * `setpts`). Reine String-/Mathe-Funktion → ohne ffmpeg testbar.
 *
 * Zwei Modi (nur für Video-Clips, nicht für Bilder):
 *
 *  a) clip.speed (Skalar): ganzer Clip mit konstantem Faktor.
 *     0.5 = halbe Geschwindigkeit (Slow-Mo, doppelt so lang),
 *     2.0 = doppelte Geschwindigkeit (halbe Länge).
 *
 *  b) clip.speedRegions: [{start,end,speed}] — zeitliche Regionen (relativ zum
 *     bereits getrimmten Clip, 0..duration). Lücken werden mit 1× aufgefüllt,
 *     damit der gesamte Clip lückenlos abgedeckt ist (z. B. normal → Slow-Mo
 *     auf den Klick → normal).
 *
 * Rückgabe: { chain, out, duration } — eine Filterkette, die `[0:v]` zu `[spd]`
 * transformiert, plus die effektive (neue) Clip-Dauer. Oder `null`, wenn keine
 * Speed-Konfiguration vorliegt.
 */

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * @param {object} clip { kind, duration, speed?, speedRegions? }
 * @returns {{chain:string, out:string, duration:number}|null}
 */
function buildSpeedStage(clip) {
  if (!clip || clip.kind === "image") return null;
  const dur = clip.duration;
  if (!(dur > 0)) return null;

  // a) Skalar
  if (typeof clip.speed === "number" && clip.speed > 0 && clip.speed !== 1) {
    const factor = round3(clip.speed);
    return {
      chain: `[0:v]setpts=PTS/${factor}[spd]`,
      out: "spd",
      duration: round3(dur / factor),
    };
  }

  // b) Regionen
  if (Array.isArray(clip.speedRegions) && clip.speedRegions.length) {
    const regs = clip.speedRegions
      .map((r) => ({
        start: Math.max(0, Number(r.start)),
        end: Math.min(dur, Number(r.end)),
        speed: Number(r.speed) > 0 ? Number(r.speed) : 1,
      }))
      .filter((r) => r.end > r.start)
      .sort((a, b) => a.start - b.start);
    if (!regs.length) return null;

    // Lücken mit 1× auffüllen (lückenlose Abdeckung von [0, dur]).
    const filled = [];
    let cur = 0;
    for (const r of regs) {
      if (r.start > cur + 1e-6) filled.push({ start: cur, end: r.start, speed: 1 });
      filled.push(r);
      cur = r.end;
    }
    if (cur < dur - 1e-6) filled.push({ start: cur, end: dur, speed: 1 });

    const parts = [];
    const labels = [];
    let total = 0;
    filled.forEach((r, i) => {
      const lbl = `spd${i}`;
      parts.push(
        `[0:v]trim=${round3(r.start)}:${round3(r.end)},setpts=(PTS-STARTPTS)/${round3(r.speed)}[${lbl}]`
      );
      labels.push(`[${lbl}]`);
      total += (r.end - r.start) / r.speed;
    });
    const chain = `${parts.join(";")};${labels.join("")}concat=n=${labels.length}:v=1:a=0[spd]`;
    return { chain, out: "spd", duration: round3(total) };
  }

  return null;
}

module.exports = { buildSpeedStage, round3 };
