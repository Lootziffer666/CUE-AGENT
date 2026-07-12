"use strict";

/**
 * Audio-Modul Einstieg.
 */

const { generateVoiceover, generateTimedVoiceover } = require("./tts");
const { fetchMusic } = require("./music");
const { mixAudio, mixTimedAudio, muxVideoAudio } = require("./mix");

module.exports = {
  generateVoiceover,
  generateTimedVoiceover,
  fetchMusic,
  mixAudio,
  mixTimedAudio,
  muxVideoAudio,
};
