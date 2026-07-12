"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { screenSignature, classifySystemDialog, findDialogButton, updateCoverage, markTried, buildCoverageSnapshot } = require("../src/android/explore");

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", "android", "uidump", name), "utf8");
}

test("android explore: screenSignature ignoriert Text, behält Struktur", () => {
  const a = fixture("normal.xml");
  const b = a.replace("Hallo", "Bonjour").replace("Weiter", "Next");
  assert.equal(screenSignature(a, "com.example/.MainActivity"), screenSignature(b, "com.example/.MainActivity"));
  assert.notEqual(screenSignature(a, "com.example/.MainActivity"), screenSignature(a, "com.example/.OtherActivity"));
});

test("android explore: classifySystemDialog erkennt Permission und ANR", () => {
  assert.deepEqual(classifySystemDialog(fixture("permission-dialog.xml"), "com.google.android.permissioncontroller").type, "permission");
  assert.equal(classifySystemDialog(fixture("permission-dialog.xml"), "com.google.android.permissioncontroller").action, "allow");
  assert.equal(classifySystemDialog(fixture("anr-dialog.xml"), "android").type, "anr");
  assert.equal(classifySystemDialog(fixture("normal.xml"), "com.example").type, "none");
  const allow = findDialogButton([{ text: "While using the app", id: "permission_allow", cx: 1, cy: 2 }], { type: "permission" });
  assert.equal(allow.id, "permission_allow");
  const wait = findDialogButton([{ text: "Wait", id: "android:id/aerr_wait", cx: 1, cy: 2 }], { type: "anr" });
  assert.equal(wait.id, "android:id/aerr_wait");
});

test("android explore: Coverage zählt Screens, Kanten und versuchte Elemente", () => {
  const coverage = { screens: new Map(), edges: [] };
  const screen = updateCoverage(coverage, { screenId: "a", activity: "A", clickables: [{ id: "one" }], step: 1 });
  markTried(screen, "one");
  updateCoverage(coverage, { screenId: "b", activity: "B", clickables: [], step: 2, from: "a", action: "tap one" });
  const snap = buildCoverageSnapshot(coverage);
  assert.equal(snap.screens.length, 2);
  assert.equal(snap.screens[0].elementsTried, 1);
  assert.deepEqual(snap.edges, [{ from: "a", to: "b", action: "tap one" }]);
});
