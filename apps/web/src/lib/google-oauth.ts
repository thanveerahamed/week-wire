import 'server-only';
import { google, type calendar_v3 } from 'googleapis';
import { createHmac, randomBytes } from 'node:crypto';
import { serverEnv } from './env';

/** Scopes we request per-account for calendar sync. */
export const GOOGLE_CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

export function oauthClient(redirectUri?: string) {
  const env = serverEnv();
  const resolvedRedirect =
    redirectUri ??
    env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${(env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/u, '')}/api/google/oauth/callback`;
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    resolvedRedirect,
  );
}

export function oauthRedirectUriFromOrigin(origin: string): string {
  return `${origin.replace(/\/+$/u, '')}/api/google/oauth/callback`;
}

/**
 * Sign a short-lived state payload binding the OAuth flow to the current uid.
 * Format: `${base64url(json)}.${hex(hmac)}`.
 */
export function signState(payload: { uid: string; nonce: string; createdAt: number }): string {
  const env = serverEnv();
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
  return `${body}.${mac}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000):
  | { uid: string; nonce: string; createdAt: number }
  | null {
  const env = serverEnv();
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts as [string, string];
  const expected = createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex');
  if (expected.length !== mac.length) return null;
  // Constant-time-ish compare.
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const json = Buffer.from(body, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { uid?: unknown; nonce?: unknown; createdAt?: unknown };
    if (
      typeof parsed.uid !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > maxAgeMs) return null;
    return { uid: parsed.uid, nonce: parsed.nonce, createdAt: parsed.createdAt };
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

/** Type-only re-export so callers don't pull googleapis at the type layer. */
export type CalendarListEntry = calendar_v3.Schema$CalendarListEntry;
