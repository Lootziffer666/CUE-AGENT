"use strict";

/**
 * OpenAI-kompatibler Provider (reines fetch, keine Dependency).
 *
 * Funktioniert mit:
 *  - OpenAI selbst (https://api.openai.com)
 *  - jedem OpenAI-kompatiblen Proxy (LiteLLM, ANVIL-BELLOWS, Ollama, …)
 *
 * Vision: Bilder werden als data-URL im `image_url`-Content übergeben.
 * Ob das Backend Bilder versteht, hängt vom dahinterliegenden Modell ab
 * (z. B. gpt-4o / Gemini 1.5 Pro: ja).
 */

class OpenAiProvider {
  constructor(cfg) {
    this.cfg = cfg;
    const o = (cfg.llm && cfg.llm.openai) || {};
    this.baseUrl = (o.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
    this.model = o.model || cfg.model || "gpt-4o";
    this.apiKey = cfg.secrets.llmApiKey || "";
    this.maxTokens = cfg.maxTokens;
    this.timeoutMs = (cfg.llm && cfg.llm.openai && cfg.llm.openai.timeoutMs) || 60000;
  }

  get endpoint() {
    // Base-URL darf mit oder ohne /v1 angegeben sein
    return this.baseUrl.endsWith("/v1")
      ? `${this.baseUrl}/chat/completions`
      : `${this.baseUrl}/v1/chat/completions`;
  }

  async _post(messages) {
    const headers = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    let res;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(
        `LLM-Proxy nicht erreichbar (${this.endpoint}): ${err.message}. Läuft der Proxy?`
      );
    }

    if (res.status === 429) {
      throw new Error(`LLM-Proxy: Budget/Rate-Limit erreicht (429). Später erneut versuchen.`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM-Proxy ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const choice = data.choices && data.choices[0];
    return (choice && choice.message && choice.message.content) || "";
  }

  async analyzeImage({ system, text, imageBase64, mediaType = "image/png" }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({
      role: "user",
      content: [
        { type: "text", text },
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
      ],
    });
    return (await this._post(messages)) || "";
  }

  async complete({ system, text }) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: text });
    return (await this._post(messages)) || "";
  }
}

module.exports = { OpenAiProvider };
