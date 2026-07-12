"use strict";

const adb = require("../android/adb");
const { pngToRgbaFrame } = require("../util/png");

function requireTarget(target) {
  if (!target || typeof target !== "object") throw new Error("Android-Treiber braucht ein Zielobjekt { apk?, pkg, serial? }.");
  const pkg = target.pkg || (target.apk ? adb.packageFromApk(target.apk) : null);
  if (!pkg) throw new Error("Android-Treiber braucht einen Package-Namen oder eine APK, aus der der Package-Name lesbar ist.");
  return { pkg, serial: target.serial || null, apk: target.apk || null };
}

function toUiTree(xml) {
  return {
    nodes: adb.parseAllNodes(xml).map((node) => ({
      role: node.cls,
      name: node.text,
      id: node.id,
      bbox: node.bbox,
      clickable: false,
    })),
  };
}

async function launch(target) {
  const { pkg, serial, apk } = requireTarget(target);
  if (!adb.isAdbAvailable()) throw new Error("adb nicht gefunden. Android platform-tools installieren oder ADB_PATH setzen.");
  if (apk) adb.installApk(apk, serial);
  adb.clearLogcat(serial);
  adb.launchPackage(pkg, serial);

  let stopped = false;
  return {
    async screenshot() {
      return adb.screencapPng(serial);
    },
    async frame() {
      return pngToRgbaFrame(await this.screenshot());
    },
    async uiTree() {
      return toUiTree(adb.uiDumpXml(serial));
    },
    async input(action) {
      if (!action || !action.type) throw new Error("Android-Treiber-Eingabe braucht ein action.type-Feld.");
      if (action.type === "tap" || action.type === "click") adb.tap(action.x, action.y, serial);
      else if (action.type === "swipe" || action.type === "scroll") adb.swipe(action.x1 || action.x || 500, action.y1 || action.y || 900, action.x2 || action.x || 500, action.y2 || ((action.y || 900) - (action.dy || 500)), action.ms || 300, serial);
      else if (action.type === "text") adb.inputText(action.text || "", serial);
      else if (action.type === "key" && action.key === "Back") adb.back(serial);
      else throw new Error(`Android-Treiber unterstützt Eingabe "${action.type}" noch nicht.`);
    },
    async logs() {
      return adb.logcatToConsole(adb.logcatDump(serial)).map((entry) => ({ ...entry, source: "logcat" }));
    },
    async health() {
      const logcat = adb.logcatDump(serial);
      const crash = adb.detectCrashes(logcat, pkg);
      const foreground = adb.currentPackage(serial);
      return { running: foreground === pkg, responding: !crash.anr, crashed: crash.crashed, crashInfo: crash.lines.join("\n") || null };
    },
    meta() {
      return { package: pkg, activity: adb.currentActivity(serial), device: serial };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      try { adb.stopPackage(pkg, serial); } catch { /* idempotentes Cleanup */ }
    },
  };
}

module.exports = {
  id: "android",
  capabilities: { uiTree: true, input: true, logs: true, network: false, processHealth: true },
  launch,
};
