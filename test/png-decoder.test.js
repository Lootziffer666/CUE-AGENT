"use strict";

const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");

const { decodePngToRgba, pngToRgbaFrame } = require("../src/util/png");

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
}

function makeRgbPng2x2() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const scanlines = Buffer.from([
    0, 255, 0, 0, 0, 255, 0, // row 0: red, green
    0, 0, 0, 255, 255, 255, 255, // row 1: blue, white
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("pngToRgbaFrame: dekodiert 8-bit RGB-PNG und skaliert auf 128x72", () => {
  const image = decodePngToRgba(makeRgbPng2x2());
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.deepEqual(Array.from(image.data.slice(0, 8)), [255, 0, 0, 255, 0, 255, 0, 255]);

  const frame = pngToRgbaFrame(makeRgbPng2x2());
  assert.equal(frame.length, 128 * 72 * 4);
  assert.deepEqual(frame.slice(0, 4), [255, 0, 0, 255]);
});

test("pngToRgbaFrame: ungültige PNGs werfen verständliche Fehler", () => {
  assert.throws(() => pngToRgbaFrame(Buffer.from("kein png")), /PNG-Signatur/);
});
