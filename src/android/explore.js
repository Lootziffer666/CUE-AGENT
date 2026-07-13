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

function parseBounds(tag) {
  const m = String(tag || "").match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  return { x1, y1, x2, y2, cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2) };
}

function scrollableRegions(xml) {
  const regions = [];
  const re = /<node\b[^>]*scrollable="true"[^>]*>/g;
  let m;
  while ((m = re.exec(String(xml || ""))) !== null) {
    const bounds = parseBounds(m[0]);
    if (bounds) regions.push(bounds);
  }
  return regions;
}

function markScrolled(screen) {
  screen.scrolled = true;
}

function chooseNextAction({ screen, clickables = [], xml = "", isRoot = false } = {}) {
  const tried = new Set((screen && screen.tried) || []);
  const next = clickables.find((e) => !tried.has(elementKey(e)));
  if (next) return { type: "tap", target: next, reason: "untried-element" };
  const scrollable = scrollableRegions(xml)[0];
  if (scrollable && !screen?.scrolled) {
    return {
      type: "scroll",
      target: {
        x1: scrollable.cx,
        y1: Math.max(scrollable.y1 + 20, scrollable.y2 - 80),
        x2: scrollable.cx,
        y2: Math.min(scrollable.y2 - 20, scrollable.y1 + 80),
        ms: 450,
      },
      reason: "scrollable-region",
    };
  }
  if (!isRoot) return { type: "back", reason: "screen-exhausted" };
  return { type: "done", reason: "root-exhausted" };
}

function coverageToMermaid(snapshot) {
  const screens = Array.isArray(snapshot?.screens) ? snapshot.screens : [];
  const edges = Array.isArray(snapshot?.edges) ? snapshot.edges : [];
  const label = (s) => `${s.id}(${String(s.activity || s.id).replace(/[^a-zA-Z0-9_./:-]/g, "_")}\n${s.elementsTried || 0}/${s.elementsTotal || 0})`;
  const lines = ["graph TD"];
  for (const s of screens) lines.push(`  ${label(s)}`);
  for (const e of edges) lines.push(`  ${e.from} -->|${String(e.action || "action").replace(/[|]/g, "/").slice(0, 40)}| ${e.to}`);
  return lines.join("\n");
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

module.exports = { normalizeUiStructure, screenSignature, elementKey, updateCoverage, markTried, parseBounds, scrollableRegions, markScrolled, chooseNextAction, coverageToMermaid, buildCoverageSnapshot, classifySystemDialog, findDialogButton };
