"use strict";

/**
 * Anthropic-Provider (Claude). Nutzt das offizielle SDK.
 */

const Anthropic = require("@anthropic-ai/sdk");

class AnthropicProvider {
  constructor(cfg) {
    this.cfg = cfg;
    this.apiKey = cfg.secrets.anthropicApiKey;
    this.model = cfg.model;
    this.maxTokens = cfg.maxTokens;
    this._sdk = null;
  }

  get sdk() {
    if (!this._sdk) this._sdk = new Anthropic({ apiKey: this.apiKey });
    return this._sdk;
  }

  _firstText(response) {
    const block =
      response &&
      Array.isArray(response.content) &&
      response.content.find((b) => b && b.type === "text");
    return block && block.text ? block.text : "";
  }

  async analyzeImage({ system, text, imageBase64, mediaType = "image/png" }) {
    const response = await this.sdk.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text },
          ],
        },
      ],
    });
    return this._firstText(response) || "";
  }

  async complete({ system, text }) {
    const response = await this.sdk.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [{ role: "user", content: [{ type: "text", text }] }],
    });
    return this._firstText(response) || "";
  }
}

module.exports = { AnthropicProvider };
