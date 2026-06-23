"use strict";

/**
 * Design-Iterations-Loop — der autonome QA→Fix→Re-QA-Kreislauf gegen eine
 * Design-Baseline (Mockup-Messlatte).
 *
 * Statt nur Optionen aufzuzählen, SETZT der Loop um: er misst die Abweichung
 * zwischen Ist-UI und Ziel-Baseline, lässt konkrete Code-Änderungen vorschlagen,
 * WENDET sie an, rendert/erfasst neu und misst wieder — bis die Messlatte
 * erreicht ist (oder maxIterations).
 *
 * ── Sicherheits-Leitplanken (verbindlich) ───────────────────────────────────
 *  • MESSBARE Konvergenz: Fortschritt = der deterministische Baseline-Score,
 *    nicht „Bauchgefühl".
 *  • NEVER-WORSE: Eine Iteration, die den Score verschlechtert, wird automatisch
 *    zurückgerollt und verworfen — keine Regressionen.
 *  • KEEP-BEST: Es wird stets der beste erreichte Stand behalten.
 *  • Begrenzt: harte Obergrenze maxIterations; Stop, wenn kein Vorschlag mehr kommt.
 *  • Nachvollziehbar: jede Iteration (Score, Severity, angewandte Edits, Annahme/
 *    Ablehnung) wird protokolliert — gedacht für Anwendung auf einem Branch/Kopie
 *    mit menschlichem Review der finalen Diffs.
 *
 * Die plattformspezifischen Teile sind als Adapter injiziert (Web/Android):
 *   captureActual()  → aktuelle Ist-Elemente [{id,text,bbox,color}]
 *   proposeEdits()   → konkrete Änderungsvorschläge (LLM)
 *   applyEdits()     → Vorschläge anwenden (reversibel)
 *   rollback()       → letzte Anwendung rückgängig (für NEVER-WORSE)
 *   rerender()       → optional: neu bauen/rendern vor dem Messen
 */

const { makeLogger } = require("../util");
const { compareToBaseline } = require("./design-baseline");

function collectDeviations(result) {
  return (result.results || [])
    .filter((r) => !r.pass)
    .map((r) => ({ id: r.id, label: r.label, missing: !!r.missing, deviations: r.deviations || [] }));
}

/**
 * @param {object} a
 * @param {object}   a.spec            geladene Baseline-Spec
 * @param {Function} a.captureActual   async () => Array<actualElement>
 * @param {Function} a.proposeEdits    async ({deviations,results,iteration}) => edits[]|null
 * @param {Function} a.applyEdits      async (edits) => void
 * @param {Function} [a.rollback]      async () => void   (für NEVER-WORSE)
 * @param {Function} [a.rerender]      async () => void
 * @param {number}   [a.targetScore=95]
 * @param {number}   [a.maxIterations=5]
 * @param {object}   [a.logger]
 * @returns {Promise<{converged,iterations,bestScore,bestIteration,finalSeverity}>}
 */
async function iterateToBaseline({
  spec,
  captureActual,
  proposeEdits,
  applyEdits,
  rollback,
  rerender,
  targetScore = 95,
  maxIterations = 5,
  logger,
}) {
  const log = logger || makeLogger("DESIGN-ITER");
  if (typeof captureActual !== "function") throw new Error("captureActual-Adapter erforderlich.");
  if (typeof proposeEdits !== "function") throw new Error("proposeEdits-Adapter erforderlich.");
  if (typeof applyEdits !== "function") throw new Error("applyEdits-Adapter erforderlich.");

  const iterations = [];

  async function measure() {
    if (typeof rerender === "function") await rerender();
    const actual = await captureActual();
    return compareToBaseline({ spec, actual });
  }

  let cur = await measure();
  iterations.push({ n: 0, score: cur.score, severity: cur.severity, applied: null, accepted: true, deviations: collectDeviations(cur) });
  log.info(`Start-Score: ${cur.score} (severity ${cur.severity})`);

  let best = cur;
  let bestN = 0;

  const finish = () => ({
    converged: best.score >= targetScore,
    iterations,
    bestScore: best.score,
    bestIteration: bestN,
    finalSeverity: best.severity,
  });

  if (cur.score >= targetScore) {
    log.ok(`Messlatte bereits erreicht (Score ${cur.score} ≥ ${targetScore}).`);
    return finish();
  }

  for (let n = 1; n <= maxIterations; n++) {
    const deviations = collectDeviations(cur);
    const edits = await proposeEdits({ deviations, results: cur.results, iteration: n });
    if (!edits || edits.length === 0) {
      log.info(`Iteration ${n}: kein Vorschlag mehr — Stop.`);
      break;
    }

    await applyEdits(edits);
    const next = await measure();

    if (next.score < best.score) {
      // NEVER-WORSE: Regression → zurückrollen, verwerfen.
      if (typeof rollback === "function") await rollback();
      iterations.push({ n, score: next.score, severity: next.severity, applied: edits, accepted: false, note: "Regression → rollback" });
      log.warn(`Iteration ${n}: Score ${next.score} < bestes ${best.score} → verworfen (rollback).`);
      continue;
    }

    iterations.push({ n, score: next.score, severity: next.severity, applied: edits, accepted: true, deviations: collectDeviations(next) });
    best = next;
    bestN = n;
    cur = next;
    log.ok(`Iteration ${n}: Score ${next.score} (severity ${next.severity}).`);

    if (next.score >= targetScore) {
      log.ok(`Messlatte erreicht nach Iteration ${n}.`);
      return finish();
    }
  }

  log.warn(`Nicht konvergiert. Bester Score: ${best.score} (Iteration ${bestN}).`);
  return finish();
}

module.exports = { iterateToBaseline, collectDeviations };
