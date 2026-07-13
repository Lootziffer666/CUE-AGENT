"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const { runPlayableCheck } = require("../src/qa/playable");

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}

function makeSolidPng(r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = [r, g, b, r, g, b];
  const scanlines = Buffer.from([0, ...row, 0, ...row]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeMockDriver() {
  let clicked = false;
  const startFrame = Array.from({ length: 128 * 72 * 4 }, (_, i) => {
    const pixel = Math.floor(i / 4);
    const channel = i % 4;
    if (channel === 3) return 255;
    return (pixel % 2 === 0 ? [20, 80, 140] : [180, 210, 240])[channel];
  });
  const afterFrame = Array.from({ length: 128 * 72 * 4 }, (_, i) => {
    const pixel = Math.floor(i / 4);
    const channel = i % 4;
    if (channel === 3) return 255;
    return (pixel % 2 === 0 ? [220, 80, 80] : [250, 200, 120])[channel];
  });
  return {
    id: "mock-platform",
    capabilities: { uiTree: true, input: true, logs: true, network: false, processHealth: true },
    async launch() {
      return {
        async screenshot() { return clicked ? makeSolidPng(220, 80, 80) : makeSolidPng(20, 80, 80); },
        async frame() { return clicked ? afterFrame : startFrame; },
        async uiTree() { return { nodes: [{ role: "button", name: "Start", id: "start", bbox: [10, 10, 100, 40], clickable: true }] }; },
        async input() { clicked = true; },
        async logs() { return []; },
        async health() { return { running: true, responding: true, crashed: false, crashInfo: null }; },
        meta() { return { mock: true }; },
        async stop() {},
      };
    },
  };
}

test("playable-check: Driver-Session liefert BELEGBAR SPIELBAR und verdict.json", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-playable-driver-"));
  try {
    const result = await runPlayableCheck({
      cfg: {},
      outDir,
      platform: "mock-platform",
      target: "mock-target",
      driver: makeMockDriver(),
      logger: { info() {}, warn() {}, error() {}, ok() {} },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.json.verdict, "BELEGBAR SPIELBAR");
    assert.equal(result.json.platform, "mock-platform");
    assert.ok(fs.existsSync(path.join(outDir, "PLAYABLE-PROOF.md")));
    assert.ok(fs.existsSync(path.join(outDir, "verdict.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
