"use strict";

const REGISTRY = {
  web: () => require("./web"),
  android: () => require("./android"),
};

function getDriver(id) {
  const key = String(id || "web").toLowerCase();
  const load = REGISTRY[key];
  if (!load) {
    throw new Error(`Unbekannter CUE-Treiber "${id}". Verfügbar: ${Object.keys(REGISTRY).join(", ")}.`);
  }
  return load();
}

module.exports = { getDriver };
