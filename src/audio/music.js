"use strict";

/**
 * Musik: Freesound API (CC-lizenziert) oder user-provided.
 *
 * Sucht passende Hintergrundmusik nach Stimmung/Genre,
 * filtert auf CC0/CC-BY, schreibt CREDITS.md.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { ensureDir } = require("../util");

/**
 * Sucht auf Freesound nach passender Musik.
 * @param {object} args
 * @param {string} args.apiKey       Freesound API Key
 * @param {string} [args.query]      Suchbegriff (z. B. "ambient background")
 * @param {number} [args.minDuration] Mindestdauer in Sekunden
 * @param {number} [args.maxDuration] Maximaldauer in Sekunden
 * @returns {Promise<object|null>}   Bester Treffer oder null
 */
function searchFreesound({ apiKey, query = "ambient background music", minDuration = 30, maxDuration = 120 }) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      query,
      filter: `duration:[${minDuration} TO ${maxDuration}] license:"Creative Commons 0" OR license:"Attribution"`,
      fields: "id,name,url,previews,license,duration,username",
      sort: "rating_desc",
      page_size: "5",
      token: apiKey,
    });

    const url = `https://freesound.org/apiv2/search/text/?${params.toString()}`;

    https.get(url, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results.length > 0) {
            resolve(json.results[0]);
          } else {
            resolve(null);
          }
        } catch (err) {
          reject(new Error(`Freesound JSON-Parse-Fehler: ${err.message}`));
        }
      });
    }).on("error", reject);
  });
}

/**
 * Lädt eine MP3-Preview von Freesound herunter.
 */
function downloadPreview(previewUrl, outPath) {
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(outPath));
    const file = fs.createWriteStream(outPath);

    https.get(previewUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        https.get(res.headers.location, (res2) => {
          res2.pipe(file);
          file.on("finish", () => { file.close(); resolve(outPath); });
        }).on("error", reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(outPath); });
      file.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Sucht und lädt Hintergrundmusik.
 *
 * @param {object} args
 * @param {object} args.cfg
 * @param {string} args.outDir
 * @param {number} [args.targetDuration]  gewünschte Dauer (Sekunden)
 * @param {object} [args.logger]
 * @returns {Promise<{musicPath:string|null, credits:string|null, skipped:boolean}>}
 */
async function fetchMusic({ cfg, outDir, targetDuration = 60, logger }) {
  const log = logger || { info() {}, warn() {}, ok() {} };

  const apiKey = cfg.secrets && cfg.secrets.freesoundApiKey;
  if (!apiKey) {
    log.warn("FREESOUND_API_KEY nicht gesetzt — keine Hintergrundmusik.");
    return { musicPath: null, credits: null, skipped: true };
  }

  log.info("Freesound: Suche Hintergrundmusik ...");
  try {
    const result = await searchFreesound({
      apiKey,
      query: "ambient background soft music",
      minDuration: Math.max(10, targetDuration - 20),
      maxDuration: targetDuration + 60,
    });

    if (!result) {
      log.warn("Freesound: Kein passender Track gefunden.");
      return { musicPath: null, credits: null, skipped: true };
    }

    const previewUrl = result.previews && (result.previews["preview-hq-mp3"] || result.previews["preview-lq-mp3"]);
    if (!previewUrl) {
      log.warn("Freesound: Kein Preview-URL im Ergebnis.");
      return { musicPath: null, credits: null, skipped: true };
    }

    const musicPath = path.join(outDir, "audio", "music.mp3");
    await downloadPreview(previewUrl, musicPath);

    const credits = `## Music Credits\n\n- **${result.name}** by ${result.username}\n  - License: ${result.license}\n  - Source: ${result.url}\n  - Duration: ${Math.round(result.duration)}s\n`;

    // CREDITS.md schreiben
    const creditsPath = path.join(outDir, "CREDITS.md");
    fs.writeFileSync(creditsPath, credits, "utf-8");

    log.ok(`Musik: ${result.name} (${Math.round(result.duration)}s, ${result.license})`);
    return { musicPath, credits, skipped: false };
  } catch (err) {
    log.warn(`Freesound fehlgeschlagen: ${err.message}. Keine Musik.`);
    return { musicPath: null, credits: null, skipped: true };
  }
}

module.exports = { fetchMusic, searchFreesound };
