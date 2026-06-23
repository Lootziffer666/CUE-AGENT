"use strict";

/**
 * Kokoro ist auf Englisch beschränkt (englisch-zentriertes Modell). Für nicht-
 * englische Sprachen darf Kokoro nicht in der Engine-Kette landen.
 */

const test = require("node:test");
const assert = require("node:assert");
const { resolveEngineChain, effectiveEngineChain } = require("../src/audio/tts");

function cfg(lang, engine, elevenKey) {
  return { lang, audio: { engine }, secrets: { elevenLabsApiKey: elevenKey || "" } };
}

test("Auto + Englisch, kein Key → Kokoro bleibt", () => {
  assert.deepEqual(effectiveEngineChain(cfg("en", "auto", "")), ["kokoro"]);
});

test("Auto + Deutsch, kein Key → keine Engine (Kokoro entfernt)", () => {
  assert.deepEqual(resolveEngineChain(cfg("de", "auto", "")), ["kokoro"]);
  assert.deepEqual(effectiveEngineChain(cfg("de", "auto", "")), []);
});

test("Deutsch + ElevenLabs-Key → ElevenLabs bleibt, Kokoro fällt weg", () => {
  assert.deepEqual(effectiveEngineChain(cfg("de", "auto", "key")), ["elevenlabs"]);
});

test("Explizit --tts kokoro + Deutsch → leer (Kokoro nur Englisch)", () => {
  assert.deepEqual(effectiveEngineChain(cfg("de", "kokoro", "")), []);
});

test("Explizit --tts kokoro + Englisch → Kokoro", () => {
  assert.deepEqual(effectiveEngineChain(cfg("en", "kokoro", "")), ["kokoro"]);
});

test("OpenAI-Engine ist sprachunabhängig (bleibt auch auf Deutsch)", () => {
  assert.deepEqual(effectiveEngineChain(cfg("de", "openai", "")), ["openai"]);
});
