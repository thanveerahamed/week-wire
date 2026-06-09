import { describe, it, expect, beforeAll } from 'vitest';
import { encryptField, decryptField, generateFieldKeyBase64 } from './crypto.js';

beforeAll(() => {
  process.env.FIELD_ENC_KEY = generateFieldKeyBase64();
});

describe('field crypto', () => {
  it('round-trips arbitrary strings', () => {
    const samples = ['hello', 'πλάγια', '🤖 token: abc-123', 'a'.repeat(2048)];
    for (const s of samples) {
      const ct = encryptField(s);
      expect(ct).not.toContain(s);
      expect(decryptField(ct)).toBe(s);
    }
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encryptField('same plaintext');
    const b = encryptField('same plaintext');
    expect(a).not.toBe(b);
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptField('not-valid')).toThrow();
    expect(() => decryptField('a:b')).toThrow();
  });

  it('detects tampering (GCM auth tag)', () => {
    const ct = encryptField('secret');
    const parts = ct.split(':');
    const [ivB64, tagB64, ctB64] = parts as [string, string, string];
    // Flip one byte of ciphertext.
    const bad = Buffer.from(ctB64, 'base64');
    bad[0] = (bad[0] ?? 0) ^ 0x01;
    const tampered = `${ivB64}:${tagB64}:${bad.toString('base64')}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it('rejects empty plaintext', () => {
    expect(() => encryptField('')).toThrow();
  });
});
