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
      if (data.length > 5e6) reject(new Error("Body zu groß"));
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
          const result = await runVideo({
            url: targetUrl || null,
            mode,
            cfg,
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
