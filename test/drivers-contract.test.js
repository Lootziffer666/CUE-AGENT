"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const { getDriver } = require("../src/drivers");

function createMockDriver() {
  return {
    id: "mock",
    capabilities: { uiTree: true, input: true, logs: true, network: false, processHealth: true },
    async launch(target) {
      let stopped = false;
      const actions = [];
      return {
        async screenshot() { return Buffer.from("png"); },
        async frame() { return new Array(128 * 72 * 4).fill(0); },
        async uiTree() { return { nodes: [{ role: "button", name: "Start", id: "start", bbox: [1, 2, 3, 4], clickable: true }] }; },
        async input(action) { actions.push(action); },
        async logs() { return [{ type: "info", text: `target=${target}`, source: "mock" }]; },
        async health() { return { running: !stopped, responding: !stopped, crashed: false, crashInfo: null }; },
        meta() { return { target, actions: actions.length }; },
        async stop() { stopped = true; },
      };
    },
  };
}

async function assertDriverContract(driver, target) {
  assert.strictEqual(typeof driver.id, "string");
  assert.strictEqual(typeof driver.launch, "function");
  assert.strictEqual(typeof driver.capabilities, "object");
  const session = await driver.launch(target, {});
  try {
    assert.ok(Buffer.isBuffer(await session.screenshot()));
    const frame = await session.frame();
    assert.strictEqual(frame.length, 128 * 72 * 4);
    const tree = await session.uiTree();
    assert.ok(tree === null || Array.isArray(tree.nodes));
    await session.input({ type: "click", x: 1, y: 1 });
    assert.ok(Array.isArray(await session.logs()));
    const health = await session.health();
    assert.strictEqual(typeof health.running, "boolean");
    assert.strictEqual(typeof health.responding, "boolean");
    assert.strictEqual(typeof health.crashed, "boolean");
    assert.ok(Object.prototype.hasOwnProperty.call(health, "crashInfo"));
    assert.strictEqual(typeof session.meta(), "object");
    await session.stop();
    await session.stop();
    assert.strictEqual((await session.health()).running, false);
  } finally {
    await session.stop();
  }
}

function chromiumAvailable() {
  const { chromium } = require("playwright");
  const { resolveChromiumExecutable } = require("../src/util");
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return true;
  } catch {
    // Fallback prüfen
  }
  return Boolean(resolveChromiumExecutable(chromium));
}

function servePage() {
  const html = '<!doctype html><meta charset="utf-8"><button id="b" onclick="this.textContent=\'OK\'">Start</button>';
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

test("drivers: Registry lädt bekannte Treiber lazy und lehnt unbekannte ab", () => {
  assert.strictEqual(getDriver("web").id, "web");
  assert.strictEqual(getDriver("android").id, "android");
  assert.throws(() => getDriver("does-not-exist"), /Unbekannter CUE-Treiber/);
});

test("drivers: Vertrags-Testsuite besteht mit Mock-Treiber", async () => {
  await assertDriverContract(createMockDriver(), "mock-target");
});

test(
  "drivers: Web-Treiber liefert Frame, UI-Baum, Logs und Health",
  { timeout: 60000, skip: !chromiumAvailable() && "Chromium fehlt" },
  async () => {
    const { server, url } = await servePage();
    try {
      const driver = getDriver("web");
      const session = await driver.launch(url, { viewport: { width: 640, height: 360 } });
      try {
        const frame = await session.frame();
        assert.strictEqual(frame.length, 128 * 72 * 4);
        const tree = await session.uiTree();
        assert.ok(tree.nodes.some((node) => node.id === "b"));
        assert.strictEqual((await session.health()).running, true);
      } finally {
        await session.stop();
      }
    } finally {
      server.close();
    }
  }
);

module.exports = { assertDriverContract };
