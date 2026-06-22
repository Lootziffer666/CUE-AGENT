"use strict";

/**
 * Verschlüsselter Keystore für API-Keys — datensicher.
 *
 * Keys werden im GUI eingetragen und hier verschlüsselt (AES-256-GCM) in
 * ~/.cue/keys.enc abgelegt — NIE im Repo, NIE im Klartext.
 *
 * DATENSICHERHEIT (niemals Keys verlieren):
 *  - Es wird IMMER nur eine in-memory KOPIE des entschlüsselten Stores
 *    bearbeitet und atomar (temp + rename) zurückgeschrieben.
 *  - Vor jedem Schreiben wird ein Backup angelegt (~/.cue/backups/, rotierend).
 *  - Leere Werte überschreiben NIE vorhandene Keys (nur Merge).
 *  - Existiert die Datei, lässt sich aber NICHT entschlüsseln (z. B. falsche
 *    CUE_KEYS_PASSPHRASE), wird das Speichern ABGEBROCHEN — niemals wird ein
 *    nicht lesbarer Store mit Leerwerten überschrieben (das hat früher 40 Keys
 *    gekostet — passiert nicht mehr).
 *
 * Schlüsselableitung:
 *  - CUE_KEYS_PASSPHRASE gesetzt → scrypt(Passphrase, Salt) (sicher).
 *  - sonst → lokaler Zufallsschlüssel ~/.cue/secret.key (chmod 600).
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DIR = path.join(os.homedir(), ".cue");
const ENC_FILE = path.join(DIR, "keys.enc");
const KEY_FILE = path.join(DIR, "secret.key");
const SALT_FILE = path.join(DIR, "salt");
const BACKUP_DIR = path.join(DIR, "backups");
const MAX_BACKUPS = 20;

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

/**
 * Liest den Store und unterscheidet klar zwischen "leer" und "kaputt".
 * @returns {{existed:boolean, ok:boolean, data:object}}
 *   existed=false        → noch kein Store (Neuanlage erlaubt)
 *   existed=true, ok=true → erfolgreich entschlüsselt
 *   existed=true, ok=false→ vorhanden, aber NICHT entschlüsselbar (NICHT überschreiben!)
 */
function readStore() {
  if (!fs.existsSync(ENC_FILE)) return { existed: false, ok: true, data: {} };
  try {
    const data = decrypt(fs.readFileSync(ENC_FILE, "utf8")) || {};
    return { existed: true, ok: true, data };
  } catch (_) {
    return { existed: true, ok: false, data: {} };
  }
}

/** Legt vor dem Schreiben ein rotierendes Backup der aktuellen Datei an. */
function backupCurrent() {
  if (!fs.existsSync(ENC_FILE)) return null;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `keys-${ts}.enc`);
  fs.copyFileSync(ENC_FILE, dest);
  try { fs.chmodSync(dest, 0o600); } catch (_) {}
  // Rotation: nur die jüngsten MAX_BACKUPS behalten
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("keys-") && f.endsWith(".enc")).sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      fs.rmSync(path.join(BACKUP_DIR, old), { force: true });
    }
  } catch (_) {}
  return dest;
}

/** Atomar schreiben: temp-Datei + rename (verhindert kaputte/halbe Dateien). */
function atomicWrite(blob) {
  ensureDir();
  const tmp = ENC_FILE + ".tmp-" + process.pid + "-" + Date.now();
  fs.writeFileSync(tmp, blob, { mode: 0o600 });
  fs.renameSync(tmp, ENC_FILE);
}

/** Liest die gespeicherten Keys (entschlüsselt). Bei Fehler/leer: {}. */
function loadKeys() {
  return readStore().data;
}

/**
 * Speichert (merged) Keys verschlüsselt — datensicher.
 * @throws wenn ein vorhandener Store nicht entschlüsselbar ist (Schutz vor Wipe).
 */
function saveKeys(partial) {
  ensureDir();
  const store = readStore();

  // Schutz: vorhandener, aber unlesbarer Store → NIEMALS überschreiben.
  if (store.existed && !store.ok) {
    const bak = backupCurrent();
    throw new Error(
      "Keystore vorhanden, aber nicht entschlüsselbar (falsche CUE_KEYS_PASSPHRASE oder beschädigt). " +
        "Speichern abgebrochen, um vorhandene Keys NICHT zu überschreiben. " +
        (bak ? `Sicherung: ${bak}` : "")
    );
  }

  // Auf einer KOPIE arbeiten, nie am Live-Objekt.
  const next = Object.assign({}, store.data);
  for (const [k, v] of Object.entries(partial || {})) {
    if (!(k in KEY_MAP)) continue;
    if (v === "" || v === null || v === undefined) continue; // leer überschreibt NICHT
    if (v === "__CLEAR__") { delete next[k]; continue; }      // explizites Löschen
    next[k] = String(v);
  }

  // Vor dem Schreiben sichern, dann atomar schreiben.
  backupCurrent();
  atomicWrite(encrypt(next));
  return status();
}

/** Status (nie Klartext-Geheimnisse): welche Felder gesetzt sind. */
function status() {
  const store = readStore();
  const keys = store.data;
  const out = {};
  for (const field of Object.keys(KEY_MAP)) {
    if (SECRET_FIELDS.has(field)) out[field] = { set: Boolean(keys[field]) };
    else out[field] = { set: Boolean(keys[field]), value: keys[field] || "" };
  }
  out._encrypted = true;
  out._passphrase = Boolean(process.env.CUE_KEYS_PASSPHRASE);
  out._readable = !(store.existed && !store.ok); // false = vorhanden, aber nicht entschlüsselbar
  out._count = Object.keys(keys).length;
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

module.exports = { loadKeys, saveKeys, status, applyToEnv, readStore, KEY_MAP, ENC_FILE, BACKUP_DIR };
