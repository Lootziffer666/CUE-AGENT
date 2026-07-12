"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "fixtures");

const requiredDirs = [
  "web",
  "android/dumpsys",
  "android/uidump",
  "android/logcat",
  "android/apk",
  "windows/sidecar",
  "windows/wer",
  "windows/eventlog",
  "game/unity-logs",
  "game/unreal-logs",
  "game/layouts",
  "blender/probe-json",
  "blender/blends",
  "frames",
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test("WP-Q1 Fixture-Baum und README-Dateien existieren", () => {
  for (const dir of ["", ...requiredDirs]) {
    const abs = path.join(root, dir);
    assert.ok(fs.statSync(abs).isDirectory(), `${dir || "."} fehlt`);
    assert.ok(fs.existsSync(path.join(abs, "README.md")), `${dir || "."}/README.md fehlt`);
  }
});

test("WP-Q1 Remote-Fixture-Lockfile ist parsebar", () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, "remote-fixtures.json"), "utf8"));
  assert.strictEqual(lock.schema, "cue.remote-fixtures/1");
  assert.ok(Array.isArray(lock.fixtures));
});

test("WP-Q1 Binär-Fixture-Politik: keine Dateien über 200 KB im Fixture-Baum", () => {
  const maxBytes = 200 * 1024;
  const offenders = walk(root)
    .filter((file) => path.basename(file) !== "remote-fixtures.json")
    .filter((file) => fs.statSync(file).size > maxBytes)
    .map((file) => path.relative(root, file));
  assert.deepStrictEqual(offenders, []);
});

test("WP-Q1 Erzeuger-/Smoke-Skripte sind vorhanden", () => {
  const fakeGame = fs.readFileSync(path.join(root, "game", "fake-game.ps1"), "utf8");
  assert.match(fakeGame, /ValidateSet\('healthy', 'frozen', 'crash'\)/);
  assert.match(fakeGame, /Space toggles color/);

  const blendScript = fs.readFileSync(path.join(__dirname, "..", "scripts", "make-blend-fixtures.py"), "utf8");
  assert.match(blendScript, /save_as_mainfile/);
  assert.match(blendScript, /healthy-cube\.blend/);
});
