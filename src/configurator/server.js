"use strict";

/**
 * Configurator-Server: serviert das Web-GUI und bietet zwei API-Endpunkte.
 *
 *   GET  /                → web/configurator.html
 *   GET  /api/presets     → Brand-Presets (Label + Farben) für die Vorschau
 *   POST /api/generate    → { script, url } → schreibt Script + rendert Video
 *
 * Reines Node (kein Framework). Nutzt die eigenen Keys aus der Umgebung.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { listPresets, getPreset } = require("../design-systems");
const { writeJson, slugify, timestamp, makeLogger } = require("../util");

function presetsPayload() {
  const out = {};
  for (const name of listPresets()) {
    const p = getPreset(name);
    out[name] = { label: p.label, bg: p.palette.bg, accent: p.palette.accent };
  }
  return out;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 5e6) {
        req.destroy();
        reject(new Error("Body zu groß"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Startet den Configurator-Server.
 * @param {object} args
 * @param {object} args.cfg
 * @param {number} [args.port]
 * @param {object} [args.logger]
 * @returns {Promise<{port:number, url:string, close:Function}>}
 */
function startConfigurator({ cfg, port = 4477, logger }) {
  const log = logger || makeLogger("CONFIG");
  const htmlPath = path.resolve(__dirname, "..", "..", "web", "configurator.html");

  const server = http.createServer(async (req, res) => {
    try {
      const url = req.url.split("?")[0];

      if (req.method === "GET" && (url === "/" || url === "/index.html")) {
        const html = fs.readFileSync(htmlPath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      }

      if (req.method === "GET" && url === "/api/presets") {
        return sendJson(res, 200, presetsPayload());
      }

      // Medien-Bibliothek: auflisten
      if (req.method === "GET" && url === "/api/media") {
        const mediaDir = path.join(cfg.root, "media");
        let files = [];
        try {
          files = fs.readdirSync(mediaDir).filter((f) => !f.startsWith("."));
        } catch (_) {}
        return sendJson(res, 200, { dir: mediaDir, files });
      }

      // Medien-Upload: { name, dataBase64 }
      if (req.method === "POST" && url === "/api/media") {
        const body = JSON.parse(await readBody(req));
        if (!body.name || !body.dataBase64) {
          return sendJson(res, 400, { ok: false, error: "name und dataBase64 erforderlich" });
        }
        const mediaDir = path.join(cfg.root, "media");
        fs.mkdirSync(mediaDir, { recursive: true });
        const safe = String(body.name).replace(/[^a-zA-Z0-9._-]/g, "_");
        // data:...;base64,XXXX oder reines base64
        const b64 = String(body.dataBase64).replace(/^data:[^;]+;base64,/, "");
        fs.writeFileSync(path.join(mediaDir, safe), Buffer.from(b64, "base64"));
        return sendJson(res, 200, { ok: true, file: safe });
      }

      if (req.method === "POST" && url === "/api/generate") {
        const body = JSON.parse(await readBody(req));
        const script = body.script;
        const targetUrl = body.url || "";
        if (!script || !Array.isArray(script.scenes) || script.scenes.length === 0) {
          return sendJson(res, 400, { ok: false, error: "Kein gültiges Script (scenes fehlen)." });
        }

        // Script in ein Configurator-Ausgabeverzeichnis schreiben
        const baseDir = path.join(cfg.root, "configurator-output");
        const slug = slugify((script.meta && script.meta.title) || "video");
        const ts = timestamp();
        const projectDir = path.join(baseDir, `${slug}-${ts}`);
        fs.mkdirSync(projectDir, { recursive: true });
        const scriptPath = path.join(projectDir, "video.script.json");
        writeJson(scriptPath, script);

        // Log einsammeln
        const lines = [];
        const capLog = {
          info: (...a) => lines.push(a.join(" ")),
          warn: (...a) => lines.push("WARN " + a.join(" ")),
          ok: (...a) => lines.push("✓ " + a.join(" ")),
          error: (...a) => lines.push("ERR " + a.join(" ")),
        };

        try {
          const { runVideo } = require("../video");
          const mode = (script.meta && script.meta.mode) || "promo";

          // Settings aus dem GUI auf die Config anwenden
          const s = body.settings || {};
          const effCfg = { ...cfg, audio: { ...cfg.audio }, image: { ...cfg.image } };
          if (s.audio) {
            if (typeof s.audio.voiceover === "boolean") effCfg.audio.voiceover = s.audio.voiceover;
            if (typeof s.audio.music === "boolean") effCfg.audio.music = s.audio.music;
            if (typeof s.audio.sfx === "boolean") effCfg.audio.sfx = s.audio.sfx;
            if (s.audio.engine) effCfg.audio.engine = s.audio.engine;
            if (s.audio.musicFile) effCfg.audio.musicFile = path.join(cfg.root, "media", path.basename(s.audio.musicFile));
            if (s.audio.sfxFile) effCfg.audio.sfxFile = path.join(cfg.root, "media", path.basename(s.audio.sfxFile));
          }
          if (s.image) {
            if (s.image.mode) effCfg.image.mode = s.image.mode;
            if (s.image.theme) effCfg.image.theme = s.image.theme;
          }
          effCfg.mediaDir = path.join(cfg.root, "media");

          const result = await runVideo({
            url: targetUrl || null,
            mode,
            cfg: effCfg,
            scriptFile: scriptPath,
            outDir: projectDir,
            recordVideo: Boolean(targetUrl),
            skipGate: true, // Configurator-Vorschau: Gate nicht erzwingen
            logger: capLog,
          });
          return sendJson(res, 200, { ok: true, mp4: result.mp4Path, projectDir, log: lines.join("\n") });
        } catch (err) {
          return sendJson(res, 200, { ok: false, error: err.message, log: lines.join("\n") });
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => {
      const actualPort = server.address().port;
      const url = `http://localhost:${actualPort}`;
      log.ok(`Configurator läuft: ${url}`);
      log.info("Im Browser öffnen, einstellen, exportieren oder direkt erzeugen.");
      log.info("Beenden mit Strg+C.");
      resolve({ port: actualPort, url, close: () => server.close() });
    });
  });
}

module.exports = { startConfigurator, presetsPayload };
