"use strict";

/**
 * Verschlüsselter Keystore für API-Keys.
 *
 * Keys können im GUI eingetragen und hier verschlüsselt (AES-256-GCM) in
 * ~/.cue/keys.enc abgelegt werden — NIE im Repo, NIE im Klartext.
 *
 * Schlüsselableitung:
 *  - Wenn CUE_KEYS_PASSPHRASE gesetzt ist → scrypt(Passphrase, Salt)  (sicher:
 *    ohne Passphrase ist die Datei nicht entschlüsselbar).
 *  - Sonst → lokaler Zufallsschlüssel ~/.cue/secret.key (chmod 600). Bequem,
 *    schützt vor versehentlichem Auslesen; für höhere Sicherheit Passphrase nutzen.
 *
 * Niemals werden Klartext-Keys an das GUI zurückgegeben (nur "gesetzt: ja/nein").
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".cue");
const ENC_FILE = path.join(DIR, "keys.enc");
const KEY_FILE = path.join(DIR, "secret.key");
const SALT_FILE = path.join(DIR, "salt");

// GUI-Feld → Umgebungsvariable
const KEY_MAP = {
  anthropic: "ANTHROPIC_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  freesound: "FREESOUND_API_KEY",
  llmApiKey: "CUE_LLM_API_KEY",
  llmBaseUrl: "CUE_LLM_BASE_URL",
  llmModel: "CUE_LLM_MODEL",
  llmProvider: "CUE_LLM_PROVIDER",
  imageApiKey: "CUE_IMAGE_API_KEY",
};
// Welche Felder sind echte Geheimnisse (werden maskiert)
const SECRET_FIELDS = new Set(["anthropic", "elevenlabs", "freesound", "llmApiKey", "imageApiKey"]);

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function getCipherKey() {
  ensureDir();
  if (process.env.CUE_KEYS_PASSPHRASE) {
    let salt;
    if (fs.existsSync(SALT_FILE)) salt = fs.readFileSync(SALT_FILE);
    else { salt = crypto.randomBytes(16); fs.writeFileSync(SALT_FILE, salt, { mode: 0o600 }); }
    return crypto.scryptSync(process.env.CUE_KEYS_PASSPHRASE, salt, 32);
  }
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  return key;
}

function encrypt(obj) {
  const key = getCipherKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

function decrypt(blob) {
  const [ivB, tagB, encB] = String(blob).split(":");
  const key = getCipherKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]);
  return JSON.parse(dec.toString("utf8"));
}

/** Liest die gespeicherten Keys (entschlüsselt). Bei Fehler: {}. */
function loadKeys() {
  try {
    if (!fs.existsSync(ENC_FILE)) return {};
    return decrypt(fs.readFileSync(ENC_FILE, "utf8")) || {};
  } catch (_) {
    return {}; // falsche Passphrase / beschädigt
  }
}

/** Speichert (merged) Keys verschlüsselt. Leere Werte überschreiben nicht. */
function saveKeys(partial) {
  ensureDir();
  const current = loadKeys();
  for (const [k, v] of Object.entries(partial || {})) {
    if (!(k in KEY_MAP)) continue;
    if (v === "" || v === null || v === undefined) continue; // leer ignorieren
    if (v === "__CLEAR__") { delete current[k]; continue; } // explizites Löschen
    current[k] = String(v);
  }
  fs.writeFileSync(ENC_FILE, encrypt(current), { mode: 0o600 });
  return status();
}

/** Status (nie Klartext): welche Felder gesetzt sind. */
function status() {
  const keys = loadKeys();
  const out = {};
  for (const field of Object.keys(KEY_MAP)) {
    if (SECRET_FIELDS.has(field)) {
      out[field] = { set: Boolean(keys[field]) }; // Geheimnis → nur gesetzt-ja/nein
    } else {
      out[field] = { set: Boolean(keys[field]), value: keys[field] || "" }; // nicht-geheim → Wert ok
    }
  }
  out._encrypted = true;
  out._passphrase = Boolean(process.env.CUE_KEYS_PASSPHRASE);
  return out;
}

/** Setzt gespeicherte Keys als Umgebungsvariablen — nur falls nicht schon gesetzt. */
function applyToEnv() {
  const keys = loadKeys();
  for (const [field, envName] of Object.entries(KEY_MAP)) {
    if (keys[field] && !process.env[envName]) {
      process.env[envName] = keys[field];
    }
  }
}

module.exports = { loadKeys, saveKeys, status, applyToEnv, KEY_MAP, ENC_FILE };
