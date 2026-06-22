"use strict";

/**
 * AI-Fixer: schlägt anhand der QA-Befunde konkrete Code-Änderungen vor und
 * wendet sie (nur mit --apply) auf ein lokales Repository an.
 *
 * Sicherheit:
 *  - Nur Dateien INNERHALB des Repos werden geschrieben (Pfad-Validierung).
 *  - Standard ist Dry-Run (Vorschläge), Anwenden nur explizit.
 *  - Kontext wird beschränkt (Dateiliste + Inhalte einer begrenzten Auswahl).
 */

const fs = require("fs");
const path = require("path");
const { LlmClient } = require("../llm/client");
const { ensureDir, writeJson } = require("../util");

const CODE_EXT = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".css", ".scss",
  ".html", ".json", ".md", ".py", ".go", ".rb", ".php",
]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "coverage", ".cache"]);

function listSourceFiles(root, maxFiles = 400) {
  const out = [];
  (function walk(dir) {
    if (out.length >= maxFiles) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) break;
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith(".")) walk(path.join(dir, e.name));
      } else if (CODE_EXT.has(path.extname(e.name))) {
        out.push(path.join(dir, e.name));
      }
    }
  })(root);
  return out;
}

function pickCandidates(files, findings, root, maxFiles = 6, maxBytes = 12000) {
  // Dateien, deren Name/Pfad in den Findings (location/description) vorkommt
  const scored = files.map((f) => {
    const rel = path.relative(root, f);
    const base = path.basename(f).toLowerCase();
    let score = 0;
    for (const fi of findings) {
      const hay = `${fi.location || ""} ${fi.description || ""} ${fi.title || ""}`.toLowerCase();
      if (fi.location && hay.includes(rel.toLowerCase())) score += 5;
      if (hay.includes(base)) score += 2;
    }
    return { f, rel, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored.filter((s) => s.score > 0).slice(0, maxFiles);
  const result = [];
  for (const c of chosen) {
    try {
      const content = fs.readFileSync(c.f, "utf-8");
      if (content.length <= maxBytes) result.push({ rel: c.rel, content });
    } catch (_) {}
  }
  return result;
}

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Erzeugt Fix-Vorschläge (und wendet sie optional an).
 * @returns {{proposed:Array, applied:Array}}
 */
async function proposeFixes({ findings, repoPath, cfg, outDir, apply = false, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };
  const root = path.resolve(repoPath);
  if (!fs.existsSync(root)) throw new Error(`Repo-Pfad nicht gefunden: ${root}`);

  const files = listSourceFiles(root);
  const candidates = pickCandidates(files, findings, root);
  const fileTree = files.map((f) => path.relative(root, f)).slice(0, 200);

  const system =
    cfg.lang === "en"
      ? "You are a senior engineer fixing QA findings. Respond ONLY with valid JSON: {\"files\":[{\"path\":\"<repo-relative>\",\"content\":\"<full new file content>\",\"rationale\":\"why\"}]}. Only modify existing files from the provided tree. Keep changes minimal and safe."
      : "Du bist Senior-Engineer und behebst QA-Befunde. Antworte AUSSCHLIESSLICH mit gültigem JSON: {\"files\":[{\"path\":\"<repo-relativ>\",\"content\":\"<kompletter neuer Dateiinhalt>\",\"rationale\":\"Begründung\"}]}. Ändere nur existierende Dateien aus dem Baum. Halte Änderungen minimal und sicher.";

  const userText = [
    cfg.lang === "en" ? "## Findings" : "## Befunde",
    JSON.stringify(findings, null, 2),
    "",
    cfg.lang === "en" ? "## Repo files" : "## Repo-Dateien",
    fileTree.join("\n"),
    "",
    cfg.lang === "en" ? "## Candidate file contents" : "## Inhalte relevanter Dateien",
    candidates.map((c) => `### ${c.rel}\n\`\`\`\n${c.content}\n\`\`\``).join("\n\n") || "(none)",
  ].join("\n");

  const client = new LlmClient(cfg);
  let raw = "";
  try {
    raw = await client.complete({ system, text: userText });
  } catch (err) {
    log.warn(`Fixer-LLM fehlgeschlagen: ${err.message}`);
    return { proposed: [], applied: [] };
  }

  // JSON extrahieren (robuster Helfer aus findings.js — toleriert ```json-Blöcke etc.)
  const { extractJson } = require("./findings");
  const parsed = extractJson(raw);
  const files2 = parsed && Array.isArray(parsed.files) ? parsed.files : [];

  const proposed = [];
  const applied = [];
  const proposalsDir = path.join(outDir, "proposed-fixes");
  ensureDir(proposalsDir);

  for (const f of files2) {
    if (!f || !f.path || typeof f.content !== "string") continue;
    const target = path.resolve(root, f.path);
    if (!inside(root, target)) {
      log.warn(`Fix-Vorschlag außerhalb des Repos ignoriert: ${f.path}`);
      continue;
    }
    if (!fs.existsSync(target)) {
      log.warn(`Fix-Vorschlag für nicht-existierende Datei ignoriert: ${f.path}`);
      continue;
    }
    // Vorschlag immer speichern (Dokumentation/Review)
    const safeName = f.path.replace(/[\/\\]/g, "__");
    fs.writeFileSync(path.join(proposalsDir, safeName), f.content, "utf-8");
    proposed.push({ file: f.path, rationale: f.rationale || "" });

    if (apply) {
      fs.writeFileSync(target, f.content, "utf-8");
      applied.push({ file: f.path });
      log.ok(`Fix angewendet: ${f.path}`);
    }
  }

  writeJson(path.join(proposalsDir, "_summary.json"), { proposed, applied });
  if (!apply && proposed.length) {
    log.info(`${proposed.length} Fix-Vorschlag/-Vorschläge gespeichert in ${proposalsDir} (Dry-Run; --apply zum Anwenden).`);
  }
  return { proposed, applied };
}

module.exports = { proposeFixes, listSourceFiles };
