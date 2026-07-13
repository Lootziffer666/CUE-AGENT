"use strict";

const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parsePng(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("PNG-Dekoder erwartet einen Buffer.");
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Ungültige PNG-Signatur.");

  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString("ascii"); offset += 4;
    const data = buffer.subarray(offset, offset + length); offset += length;
    offset += 4; // CRC wird für lokale, selbst erzeugte Fixtures nicht benötigt.
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!header) throw new Error("PNG ohne IHDR-Chunk.");
  if (!idat.length) throw new Error("PNG ohne IDAT-Chunk.");
  if (header.bitDepth !== 8) throw new Error(`PNG-Bit-Tiefe ${header.bitDepth} wird nicht unterstützt (nur 8-bit).`);
  if (header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) throw new Error("PNG-Kompression/Filter/Interlace wird nicht unterstützt.");
  if (![2, 6].includes(header.colorType)) throw new Error(`PNG-Farbtyp ${header.colorType} wird nicht unterstützt (nur RGB/RGBA).`);
  return { ...header, data: zlib.inflateSync(Buffer.concat(idat)) };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePngToRgba(buffer) {
  const png = parsePng(buffer);
  const channels = png.colorType === 6 ? 4 : 3;
  const bpp = channels;
  const stride = png.width * channels;
  const raw = png.data;
  const rgba = new Uint8ClampedArray(png.width * png.height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < png.height; y++) {
    const filter = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prev[x] || 0;
      const upLeft = x >= bpp ? prev[x - bpp] || 0 : 0;
      if (filter === 1) row[x] = (row[x] + left) & 0xff;
      else if (filter === 2) row[x] = (row[x] + up) & 0xff;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`PNG-Filter ${filter} wird nicht unterstützt.`);
    }
    for (let x = 0; x < png.width; x++) {
      const si = x * channels;
      const di = (y * png.width + x) * 4;
      rgba[di] = row[si];
      rgba[di + 1] = row[si + 1];
      rgba[di + 2] = row[si + 2];
      rgba[di + 3] = channels === 4 ? row[si + 3] : 255;
    }
    prev = row;
  }
  return { width: png.width, height: png.height, data: rgba };
}

function resizeRgbaNearest(image, width = 128, height = 72) {
  const out = new Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const si = (sy * image.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = image.data[si];
      out[di + 1] = image.data[si + 1];
      out[di + 2] = image.data[si + 2];
      out[di + 3] = image.data[si + 3];
    }
  }
  return out;
}

function pngToRgbaFrame(buffer, width = 128, height = 72) {
  return resizeRgbaNearest(decodePngToRgba(buffer), width, height);
}

module.exports = { decodePngToRgba, resizeRgbaNearest, pngToRgbaFrame };
