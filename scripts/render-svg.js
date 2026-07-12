#!/usr/bin/env node
// Rendert eine SVG-Datei deterministisch via headless Chromium zu PNG.
// Nutzung: node scripts/render-svg.js <input.svg> <output.png> [width] [height]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  const [, , inFile, outFile, wArg, hArg] = process.argv;
  if (!inFile || !outFile) {
    console.error('Nutzung: node scripts/render-svg.js <input.svg> <output.png> [width] [height]');
    process.exit(1);
  }
  const svg = fs.readFileSync(path.resolve(inFile), 'utf8');

  // viewBox auslesen fuer Default-Groesse
  const vb = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  const vbW = vb ? Math.round(parseFloat(vb[1])) : 1024;
  const vbH = vb ? Math.round(parseFloat(vb[2])) : 1024;
  const width = wArg ? parseInt(wArg, 10) : vbW;
  const height = hArg ? parseInt(hArg, 10) : vbH;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const html = `<!doctype html><html><head><style>
    *{margin:0;padding:0}html,body{width:${width}px;height:${height}px;overflow:hidden}
    svg{display:block;width:${width}px;height:${height}px}
  </style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.resolve(outFile), clip: { x: 0, y: 0, width, height } });
  await browser.close();
  console.log(`gerendert: ${outFile} (${width}x${height})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
