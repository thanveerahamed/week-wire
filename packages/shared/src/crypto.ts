import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM field encryption for sensitive Firestore fields
 * (Google refresh tokens, Telegram bot tokens).
 *
 * Layout: base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)
 * Key:    32 raw bytes, supplied via the `FIELD_ENC_KEY` env var as base64.
 */

const ALG = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard
const KEY_LEN = 32;

function loadKey(): Buffer {
  const raw = process.env.FIELD_ENC_KEY;
  if (!raw) {
    throw new Error('FIELD_ENC_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(`FIELD_ENC_KEY must decode to ${KEY_LEN} bytes (got ${key.length})`);
  }
  return key;
}

export function encryptField(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptField: plaintext must be a non-empty string');
  }
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptField: malformed ciphertext payload');
  }
  const [ivB64, tagB64, ctB64] = parts as [string, string, string];
  const key = loadKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_LEN) {
    throw new Error('decryptField: invalid IV length');
  }
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Convenience for tests: generate a fresh base64 key. */
export function generateFieldKeyBase64(): string {
  return randomBytes(KEY_LEN).toString('base64');
}
