import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';

export interface UserPrefs {
  lookaheadDays: number;
  timezone: string;
  enabled: boolean;
}

const DEFAULTS: UserPrefs = {
  lookaheadDays: 7,
  timezone: 'Europe/Amsterdam',
  enabled: true,
};

function userRef(uid: string) {
  return adminDb().collection('users').doc(uid);
}

export async function getUserPrefs(uid: string): Promise<UserPrefs> {
  const snap = await userRef(uid).get();
  const data = snap.data() ?? {};
  return {
    lookaheadDays:
      typeof data.lookaheadDays === 'number' ? data.lookaheadDays : DEFAULTS.lookaheadDays,
    timezone: typeof data.timezone === 'string' ? data.timezone : DEFAULTS.timezone,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULTS.enabled,
  };
}

export async function updateUserPrefs(
  uid: string,
  patch: Partial<UserPrefs>,
): Promise<void> {
  await userRef(uid).set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
