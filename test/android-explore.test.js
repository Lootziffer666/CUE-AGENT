"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const { screenSignature, classifySystemDialog, findDialogButton, updateCoverage, markTried, markScrolled, scrollableRegions, chooseNextAction, coverageToMermaid, buildCoverageSnapshot } = require("../src/android/explore");

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


test("android explore: Aktionsstrategie tappt, scrollt, geht zurück und stoppt", () => {
  const coverage = { screens: new Map(), edges: [] };
  const clickables = [{ text: "Details", id: "com.example:id/details", cls: "android.widget.Button", cx: 540, cy: 330 }];
  const screen = updateCoverage(coverage, { screenId: "root", activity: "Main", clickables, step: 1 });
  assert.equal(chooseNextAction({ screen, clickables, xml: fixture("scrollable.xml"), isRoot: true }).type, "tap");
  markTried(screen, clickables[0]);
  const scroll = chooseNextAction({ screen, clickables, xml: fixture("scrollable.xml"), isRoot: true });
  assert.equal(scroll.type, "scroll");
  assert.ok(scroll.target.y1 > scroll.target.y2);
  markScrolled(screen);
  assert.equal(chooseNextAction({ screen, clickables, xml: fixture("scrollable.xml"), isRoot: true }).type, "done");
  assert.equal(chooseNextAction({ screen, clickables: [], xml: fixture("normal.xml"), isRoot: false }).type, "back");
});

test("android explore: scrollableRegions und Mermaid-Coverage sind stabil", () => {
  const regions = scrollableRegions(fixture("scrollable.xml"));
  assert.equal(regions.length, 1);
  assert.equal(regions[0].cx, 540);
  const graph = coverageToMermaid({
    screens: [{ id: "a", activity: "Main", elementsTried: 1, elementsTotal: 2 }, { id: "b", activity: "Details", elementsTried: 0, elementsTotal: 1 }],
    edges: [{ from: "a", to: "b", action: "tap details" }],
  });
  assert.match(graph, /graph TD/);
  assert.match(graph, /a -->\|tap details\| b/);
});
