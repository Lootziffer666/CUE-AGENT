"use strict";

const crypto = require("crypto");

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : "";
}

function normalizeUiStructure(xml) {
  const nodes = [];
  const re = /<node\b[^>]*>/g;
  let m;
  while ((m = re.exec(String(xml || ""))) !== null) {
    const tag = m[0];
    const bounds = attr(tag, "bounds");
    nodes.push([
      attr(tag, "class"),
      attr(tag, "resource-id"),
      attr(tag, "clickable"),
      attr(tag, "scrollable"),
      bounds.replace(/\d+/g, "#"),
    ].join("|"));
  }
  return nodes.join("\n");
}

function screenSignature(xml, activity = "") {
  const normalized = `${activity || ""}\n${normalizeUiStructure(xml)}`;
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
}

function elementKey(node) {
  return [node.id || "", node.text || "", node.cls || "", node.cx ?? "", node.cy ?? ""].join("|");
}

function buildCoverageSnapshot({ screens = new Map(), edges = [] } = {}) {
  return {
    screens: Array.from(screens.entries()).map(([id, value]) => ({ id, ...value })),
    edges: edges.slice(),
  };
}

function updateCoverage(coverage, { screenId, activity, clickables = [], step, from = null, action = null }) {
  if (!coverage.screens.has(screenId)) {
    coverage.screens.set(screenId, { activity: activity || null, firstSeenStep: step, elementsTotal: clickables.length, elementsTried: 0, tried: [] });
  }
  const screen = coverage.screens.get(screenId);
  screen.elementsTotal = Math.max(screen.elementsTotal, clickables.length);
  if (from && from !== screenId) coverage.edges.push({ from, to: screenId, action: action || "unknown" });
  return screen;
}

function markTried(screen, node) {
  const key = typeof node === "string" ? node : elementKey(node);
  if (!screen.tried.includes(key)) screen.tried.push(key);
  screen.elementsTried = screen.tried.length;
}


function findDialogButton(clickables, dialog) {
  const haystack = Array.isArray(clickables) ? clickables : [];
  if (dialog.type === "permission") {
    return haystack.find((c) => /zulassen|allow|while using|während/i.test(`${c.text} ${c.id}`));
  }
  if (dialog.type === "anr") {
    return haystack.find((c) => /warten|wait/i.test(`${c.text} ${c.id}`));
  }
  return null;
}

function classifySystemDialog(xml, foregroundPackage) {
  const fg = String(foregroundPackage || "");
  const text = String(xml || "");
  const isSystem = fg === "android" || fg.includes("permissioncontroller") || fg.includes("packageinstaller");
  if (!isSystem) return { type: "none", action: null, reason: "Foreground-Package gehört zur App." };
  if (/permission|berechtigung|zulassen|allow|while using|während der nutzung/i.test(text)) {
    return { type: "permission", action: "allow", reason: "Permission-Dialog erkannt; Default ist zulassen." };
  }
  if (/reagiert nicht|isn.?t responding|app isn.?t responding|ANR/i.test(text)) {
    return { type: "anr", action: "wait", reason: "ANR-Dialog erkannt; Warten antippen und als Befund werten." };
  }
  return { type: "system", action: "back", reason: "Unbekannter Systemdialog; defensiv zurück." };
}

module.exports = { normalizeUiStructure, screenSignature, elementKey, updateCoverage, markTried, buildCoverageSnapshot, classifySystemDialog, findDialogButton };
