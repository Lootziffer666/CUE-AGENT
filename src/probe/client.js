"use strict";

const http = require("http");

const DEFAULT_PORT = 7477;
const DEFAULT_TIMEOUT_MS = 500;

async function detectWebProbe(page) {
  const info = await page.evaluate(() => {
    if (window.CUE_PROBE && typeof window.CUE_PROBE.isReady === "function" && typeof window.CUE_PROBE.getState === "function") {
      return { found: true, kind: "cue-probe" };
    }
    if (window.SHADED && typeof window.SHADED.isReady === "function" && typeof window.SHADED.setParams === "function") {
      return { found: true, kind: "shaded-shim" };
    }
    if (window.ANVIL_AUDIO && typeof window.ANVIL_AUDIO.getDebugState === "function" && typeof window.ANVIL_AUDIO.getEventLog === "function") {
      return { found: true, kind: "anvil-audio-shim" };
    }
    return { found: false, kind: null };
  });
  if (!info.found) return null;
  return createWebProbe(page, info.kind);
}

function createWebProbe(page, kind = "cue-probe") {
  return {
    transport: "web",
    kind,
    async ready() {
      if (kind === "cue-probe") return page.evaluate(() => Boolean(window.CUE_PROBE.isReady()));
      if (kind === "shaded-shim") return page.evaluate(() => Boolean(window.SHADED.isReady()));
      return true;
    },
    async state() {
      if (kind === "cue-probe") return page.evaluate(() => window.CUE_PROBE.getState());
      if (kind === "shaded-shim") {
        return page.evaluate(() => ({ scene: "SHADED", fps: null, frame: null, custom: { params: typeof window.SHADED.getParams === "function" ? window.SHADED.getParams() : {} } }));
      }
      return page.evaluate(() => ({ scene: "ANVIL_AUDIO", fps: null, frame: null, custom: { audio: window.ANVIL_AUDIO.getDebugState(), events: window.ANVIL_AUDIO.getEventLog() } }));
    },
    async setParams(params) {
      if (kind === "cue-probe") {
        return page.evaluate((value) => (typeof window.CUE_PROBE.setParams === "function" ? window.CUE_PROBE.setParams(value) : null), params);
      }
      if (kind === "shaded-shim") {
        return page.evaluate((value) => {
          const current = typeof window.SHADED.getParams === "function" ? window.SHADED.getParams() : {};
          return window.SHADED.setParams({ ...current, ...value });
        }, params);
      }
      throw new Error("CUE-PROBE Web-Shim unterstützt setParams() für diesen Vertrag nicht.");
    },
    async input(action) {
      if (kind === "cue-probe") {
        return page.evaluate((value) => (typeof window.CUE_PROBE.input === "function" ? window.CUE_PROBE.input(value) : null), action);
      }
      throw new Error("CUE-PROBE Web-Transport nutzt echte Browser-Eingaben; input() ist hier nicht verfügbar.");
    },
    async events() {
      if (kind === "cue-probe") {
        return page.evaluate(() => (typeof window.CUE_PROBE.drainEvents === "function" ? window.CUE_PROBE.drainEvents() : []));
      }
      if (kind === "anvil-audio-shim") return page.evaluate(() => window.ANVIL_AUDIO.getEventLog().map((type, t) => ({ t, type, data: null })));
      return [];
    },
    async screenshot() {
      return null;
    },
  };
}

function httpRequest({ method = "GET", port = DEFAULT_PORT, path = "/", body = null, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, timeout: timeoutMs, headers: body ? { "content-type": "application/json" } : {} }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(new Error(`CUE-PROBE HTTP ${res.statusCode} ${path}`));
        resolve({ statusCode: res.statusCode, headers: res.headers, buffer });
      });
    });
    req.on("timeout", () => req.destroy(new Error(`CUE-PROBE HTTP Timeout nach ${timeoutMs}ms (${path})`)));
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function parseJsonResponse(response) {
  if (!response.buffer.length) return {};
  return JSON.parse(response.buffer.toString("utf8"));
}

function createHttpProbe({ port = DEFAULT_PORT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    transport: "http",
    kind: "cue-probe",
    async ready() {
      return Boolean(parseJsonResponse(await httpRequest({ port, timeoutMs, path: "/cue/ready" })).ready);
    },
    async state() {
      return parseJsonResponse(await httpRequest({ port, timeoutMs, path: "/cue/state" }));
    },
    async setParams(params) {
      return parseJsonResponse(await httpRequest({ method: "POST", port, timeoutMs, path: "/cue/params", body: params }));
    },
    async input(action) {
      return parseJsonResponse(await httpRequest({ method: "POST", port, timeoutMs, path: "/cue/input", body: action }));
    },
    async events(since) {
      const suffix = since == null ? "" : `?since=${encodeURIComponent(String(since))}`;
      return parseJsonResponse(await httpRequest({ port, timeoutMs, path: `/cue/events${suffix}` }));
    },
    async screenshot() {
      return (await httpRequest({ port, timeoutMs, path: "/cue/screenshot" })).buffer;
    },
  };
}

async function detectHttpProbe(options = {}) {
  const probe = createHttpProbe(options);
  try {
    return (await probe.ready()) ? probe : null;
  } catch {
    return null;
  }
}

async function detectProbe({ page = null, port = process.env.CUE_PROBE_PORT || DEFAULT_PORT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (page) {
    const webProbe = await detectWebProbe(page);
    if (webProbe) return webProbe;
  }
  return detectHttpProbe({ port: Number(port), timeoutMs });
}

module.exports = { DEFAULT_PORT, createWebProbe, createHttpProbe, detectWebProbe, detectHttpProbe, detectProbe };
