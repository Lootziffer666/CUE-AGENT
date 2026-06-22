"use strict";

/**
 * Audio-Modul Einstieg.
 */

const { generateVoiceover } = require("./tts");
const { fetchMusic } = require("./music");
const { mixAudio, muxVideoAudio } = require("./mix");

module.exports = { generateVoiceover, fetchMusic, mixAudio, muxVideoAudio };
