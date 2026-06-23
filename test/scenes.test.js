"use strict";

/**
 * Regressions-Schutz für den GSAP-Bug: Szenen müssen GSAP **inline** einbetten
 * (offline-fähig) und dürfen **nicht** vom CDN laden. Sonst kollabieren alle
 * Szenen im Headless-Render still auf die Default-Dauer (3s, keine Animation).
 */

const test = require("node:test");
const assert = require("node:assert");
const { titleCard, featureList } = require("../src/templates/scenes");
const { getPreset } = require("../src/design-systems");

const brand = getPreset("linear");
const dims = { width: 1920, height: 1080 };

test("Szene bettet GSAP inline ein (kein CDN)", () => {
  const html = titleCard(brand, { title: "Hallo", subtitle: "Welt", dims, duration: 6 });
  assert.ok(!/cdnjs\.cloudflare\.com|unpkg|jsdelivr/.test(html), "darf keine CDN-Referenz enthalten");
  assert.ok(/GreenSock/.test(html), "muss den gevendorten GSAP-Quelltext inline enthalten");
  assert.ok(!/<script src=/.test(html), "darf kein externes <script src> laden");
});

test("Szene exportiert Timeline + Dauer für den deterministischen Renderer", () => {
  const html = featureList(brand, {
    heading: "Features",
    features: ["a", "b"],
    dims,
    duration: 8,
  });
  assert.ok(/window\.__timeline/.test(html), "muss window.__timeline setzen");
  assert.ok(/window\.__duration\s*=\s*8/.test(html), "muss die gesetzte Dauer exportieren");
  assert.ok(/gsap\.timeline\(/.test(html), "muss eine GSAP-Timeline aufbauen");
});
