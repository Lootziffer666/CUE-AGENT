"use strict";

/**
 * LLM-Client (Provider-Dispatcher).
 *
 * Wählt anhand von cfg.llm.provider den konkreten Provider:
 *   - "anthropic" (Default) — Claude via SDK
 *   - "openai"              — jeder OpenAI-kompatible Endpoint (OpenAI,
 *                             LiteLLM/ANVIL-BELLOWS, Ollama, …) via BYOK
 *
 * Einheitliche Schnittstelle: analyzeImage(), complete().
 */

const { AnthropicProvider } = require("./providers/anthropic");
const { OpenAiProvider } = require("./providers/openai");

function createProvider(cfg) {
  const provider = (cfg.llm && cfg.llm.provider) || "anthropic";
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(cfg);
    case "openai":
    case "openai-compatible":
    case "litellm":
      return new OpenAiProvider(cfg);
    default:
      throw new Error(`Unbekannter LLM-Provider: ${provider} (erlaubt: anthropic, openai)`);
  }
}

class LlmClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.provider = createProvider(cfg);
  }
  analyzeImage(args) {
    return this.provider.analyzeImage(args);
  }
  complete(args) {
    return this.provider.complete(args);
  }
}

module.exports = { LlmClient, createProvider };
