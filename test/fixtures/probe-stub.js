"use strict";

const http = require("http");

function startProbeStub({ ready = true } = {}) {
  const events = [{ t: 1, type: "boot", data: null }];
  let state = { scene: "stub", fps: 60, frame: 1, entities: [], custom: {} };
  let params = {};
  const server = http.createServer((req, res) => {
    const sendJson = (obj) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "GET" && req.url === "/cue/ready") return sendJson({ ready });
    if (req.method === "GET" && req.url === "/cue/state") return sendJson(state);
    if (req.method === "GET" && req.url.startsWith("/cue/events")) return sendJson(events);
    if (req.method === "GET" && req.url === "/cue/screenshot") {
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(Buffer.from("89504e470d0a1a0a", "hex"));
    }
    if (req.method === "POST" && (req.url === "/cue/params" || req.url === "/cue/input")) {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        if (req.url === "/cue/params") params = { ...params, ...body };
        state = { ...state, frame: state.frame + 1, custom: { params, lastInput: req.url === "/cue/input" ? body : state.custom.lastInput } };
        sendJson({ ok: true });
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { startProbeStub };
