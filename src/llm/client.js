"use strict";

/**
 * Gekapselter Anthropic-Client.
 *
 * Hält die SDK-Details an einer Stelle, damit QA- und Video-Pipeline
 * denselben Zugang nutzen. Vision-Analyse (Bild + Text) ist hier gebündelt.
 */

const Anthropic = require("@anthropic-ai/sdk");

class LlmClient {
  /**
   * @param {object} cfg aufgelöste Config aus src/config
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.apiKey = cfg.secrets.anthropicApiKey;
    this.model = cfg.model;
    this.maxTokens = cfg.maxTokens;
    this._sdk = null;
  }

  get sdk() {
    if (!this._sdk) {
      this._sdk = new Anthropic({ apiKey: this.apiKey });
    }
    return this._sdk;
  }

  _firstText(response) {
    const block =
      response && response.content && response.content.find((b) => b.type === "text");
    return block && block.text ? block.text : "";
  }

  /**
   * Analysiert ein PNG-Bild mit begleitendem Text.
   * @param {object} args
   * @param {string} args.system System-Prompt
   * @param {string} args.text Nutzer-Text
   * @param {Buffer|string} args.imageBase64 Base64-PNG (ohne data:-Präfix)
   * @param {string} [args.mediaType] Standard image/png
   * @returns {Promise<string>} reiner Analysetext
   */
  async analyzeImage({ system, text, imageBase64, mediaType = "image/png" }) {
    const response = await this.sdk.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text },
          ],
        },
      ],
    });
    return this._firstText(response) || "";
  }

  /**
   * Reine Textanfrage (für spätere Video-Phasen: Script, Storyboard, Design).
   */
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

module.exports = { LlmClient };
