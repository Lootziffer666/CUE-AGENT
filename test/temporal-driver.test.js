"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const { runTemporalCheck } = require("../src/qa/temporal");

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}

function makePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from([0, 10, 20, 30]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeFrame(step) {
  return Array.from({ length: 128 * 72 * 4 }, (_, i) => {
    const channel = i % 4;
    if (channel === 3) return 255;
    return channel === 0 ? 80 + step : channel === 1 ? 120 : 160;
  });
}

function makeMockDriver() {
  let frame = 0;
  return {
    id: "mock-temporal",
    capabilities: { uiTree: false, input: false, logs: true, network: false, processHealth: true },
    async launch() {
      return {
        async screenshot() { return makePng(); },
        async frame() { return makeFrame(frame++ % 5); },
        async uiTree() { return null; },
        async input() {},
        async logs() { return []; },
        async health() { return { running: true, responding: true, crashed: false, crashInfo: null }; },
        meta() { return { mock: true }; },
        async stop() {},
      };
    },
  };
}

test("temporal-check: Driver-Session liefert KONSISTENT und verdict.json", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cue-temporal-driver-"));
  try {
    const result = await runTemporalCheck({
      cfg: {},
      outDir,
      platform: "mock-temporal",
      target: "mock-target",
      driver: makeMockDriver(),
      logger: { info() {}, warn() {}, error() {}, ok() {} },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.json.verdict, "KONSISTENT");
    assert.equal(result.json.mode, "driver:mock-temporal");
    assert.ok(fs.existsSync(path.join(outDir, "TEMPORAL-CONSISTENCY.md")));
    assert.ok(fs.existsSync(path.join(outDir, "verdict.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
