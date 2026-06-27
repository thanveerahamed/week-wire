import 'server-only';
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from './firebase-admin';
import { serverEnv } from './env';
import { FieldValue } from 'firebase-admin/firestore';

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}

/**
 * Verify a Firebase ID token and mint a server session cookie. Also ensures
 * the `users/{uid}` profile document exists.
 */
export async function createSession(idToken: string): Promise<void> {
  const env = serverEnv();
  const auth = adminAuth();

  // Verify the ID token. checkRevoked=true catches sign-outs from other devices.
  const decoded = await auth.verifyIdToken(idToken, true);

  // Mint a long-lived session cookie (httpOnly, set on the response).
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: FIVE_DAYS_MS,
  });

  const jar = await cookies();
  jar.set(env.SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: FIVE_DAYS_MS / 1000,
  });

  // First-login bootstrap: create the user profile if missing.
  const db = adminDb();
  const userRef = db.collection('users').doc(decoded.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    await userRef.set({
      displayName: decoded.name ?? null,
      email: decoded.email ?? null,
      photoURL: decoded.picture ?? null,
      lookaheadDays: 7,
      timezone: 'Europe/Amsterdam',
      enabled: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/** Read the current session, or `null` if absent / invalid. */
export async function getSession(): Promise<SessionUser | null> {
  const env = serverEnv();
  const jar = await cookies();
  const cookie = jar.get(env.SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      displayName: (decoded.name as string | undefined) ?? null,
      photoURL: (decoded.picture as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

/** Clear the session cookie. */
export async function destroySession(): Promise<void> {
  const env = serverEnv();
  const jar = await cookies();
  jar.delete(env.SESSION_COOKIE_NAME);
}
