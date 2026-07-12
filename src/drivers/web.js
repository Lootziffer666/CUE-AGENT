"use strict";

const { chromium } = require("playwright");
const { resolveChromiumExecutable } = require("../util");

const SAMPLE_W = 128;
const SAMPLE_H = 72;

async function decodeFrame(probePage, buffer) {
  return probePage.evaluate(
    async ({ shot, w, h }) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error("PNG-Dekodierung fehlgeschlagen"));
        img.src = "data:image/png;base64," + shot;
      });
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    },
    { shot: buffer.toString("base64"), w: SAMPLE_W, h: SAMPLE_H }
  );
}

async function launch(target, opts = {}) {
  if (!target) throw new Error("Web-Treiber braucht eine URL als Ziel.");
  const consoleLogs = [];
  const network = [];
  const pageErrors = [];
  let stopped = false;

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(chromium),
    args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: opts.viewport || { width: 1280, height: 720 } });
  const probe = await browser.newPage({ viewport: { width: 200, height: 200 } });

  page.on("console", (msg) => {
    consoleLogs.push({ type: msg.type() === "error" ? "error" : msg.type() === "warning" ? "warning" : "info", text: msg.text(), source: "console" });
  });
  page.on("pageerror", (err) => pageErrors.push({ type: "error", text: err.message, source: "pageerror" }));
  page.on("response", (response) => {
    if (response.status() >= 400) network.push({ type: response.status() >= 500 ? "error" : "warning", text: `${response.status()} ${response.url()}`, source: "network" });
  });

  await page.goto(target, { waitUntil: "load", timeout: opts.timeoutMs || 45000 });

  return {
    async screenshot() {
      return page.screenshot({ type: "png" });
    },
    async frame() {
      return decodeFrame(probe, await this.screenshot());
    },
    async uiTree() {
      const nodes = await page.evaluate(() => {
        const selector = 'button, a[href], input, select, textarea, canvas, [role="button"], [onclick]';
        return Array.from(document.querySelectorAll(selector)).map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            role: el.getAttribute("role") || el.tagName.toLowerCase(),
            name: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 120) || el.getAttribute("name") || "",
            id: el.id || el.getAttribute("name") || "",
            bbox: [rect.x, rect.y, rect.width, rect.height],
            clickable: true,
          };
        }).filter((node) => node.bbox[2] > 0 && node.bbox[3] > 0);
      });
      return { nodes };
    },
    async input(action) {
      if (!action || !action.type) throw new Error("Web-Treiber-Eingabe braucht ein action.type-Feld.");
      if (action.type === "click" || action.type === "tap") await page.mouse.click(action.x, action.y);
      else if (action.type === "key") await page.keyboard.press(action.key);
      else if (action.type === "text") await page.keyboard.type(String(action.text || ""));
      else if (action.type === "scroll" || action.type === "swipe") await page.mouse.wheel(action.dx || 0, action.dy || action.scrollY || 600);
      else throw new Error(`Web-Treiber unterstützt Eingabe "${action.type}" noch nicht.`);
    },
    async logs() {
      return [...consoleLogs, ...pageErrors, ...network];
    },
    async health() {
      return { running: !page.isClosed() && !stopped, responding: !page.isClosed() && !stopped, crashed: false, crashInfo: null };
    },
    meta() {
      return { url: page.url() };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await browser.close().catch(() => {});
    },
  };
}

module.exports = {
  id: "web",
  capabilities: { uiTree: true, input: true, logs: true, network: true, processHealth: true },
  launch,
};
