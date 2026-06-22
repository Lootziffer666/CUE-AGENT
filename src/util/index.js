"use strict";

/**
 * Gemeinsame Helfer: Logging, Dateisystem, Zeitstempel, Slugs.
 */

const fs = require("fs");
const path = require("path");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "site";
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  return file;
}

function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, "utf-8");
  return file;
}

// einfacher, präfixierter Logger
function makeLogger(prefix = "CUE") {
  const tag = `[${prefix}]`;
  return {
    info: (...a) => console.log(tag, ...a),
    warn: (...a) => console.warn(tag, ...a),
    error: (...a) => console.error(tag, ...a),
    ok: (...a) => console.log(`${tag} \u2713`, ...a),
  };
}

module.exports = { timestamp, ensureDir, slugify, writeJson, writeText, makeLogger };
