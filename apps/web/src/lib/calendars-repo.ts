import 'server-only';
import { google } from 'googleapis';
import { FieldValue } from 'firebase-admin/firestore';
import { decryptField, encryptField } from '@week-wire/shared';
import { adminDb } from './firebase-admin';
import { oauthClient } from './google-oauth';
import type { CalendarListEntry } from './google-oauth';

export interface StoredCalendarAccount {
  accountEmail: string;
  scopes: string[];
  needsReauth: boolean;
  connectedAt: number;
}

export interface StoredSubCalendar {
  calendarId: string;
  summary: string;
  primary: boolean;
  enabled: boolean;
  colorId: string | null;
}

function accountsCol(uid: string) {
  return adminDb().collection('users').doc(uid).collection('calendarAccounts');
}

function calendarsCol(uid: string, accountEmail: string) {
  return accountsCol(uid).doc(accountEmail).collection('calendars');
}

/**
 * True only for genuine refresh-token invalidation (revoked/expired
 * consent), as opposed to transient network or Google API errors. Only
 * these should force the user through the OAuth flow again — anything else
 * is safe to retry on the next scheduled run without disturbing the account.
 */
function isInvalidGrantError(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | undefined;
  if (e?.response?.data?.error === 'invalid_grant') return true;
  return typeof e?.message === 'string' && e.message.includes('invalid_grant');
}

export async function upsertCalendarAccount(
  uid: string,
  args: { accountEmail: string; refreshToken: string; scopes: string[] },
): Promise<void> {
  const ref = accountsCol(uid).doc(args.accountEmail);
  await ref.set(
    {
      accountEmail: args.accountEmail,
      refreshTokenEnc: encryptField(args.refreshToken),
      scopes: args.scopes,
      needsReauth: false,
      connectedAt: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncCalendarList(
  uid: string,
  accountEmail: string,
  entries: CalendarListEntry[],
): Promise<void> {
  const col = calendarsCol(uid, accountEmail);
  const existing = await col.get();
  const seen = new Set<string>();
  const batch = adminDb().batch();

  for (const entry of entries) {
    if (!entry.id) continue;
    seen.add(entry.id);
    const prev = existing.docs.find((d) => d.id === entry.id);
    const enabledDefault = entry.primary === true;
    batch.set(
      col.doc(entry.id),
      {
        calendarId: entry.id,
        summary: entry.summary ?? entry.summaryOverride ?? '(untitled)',
        primary: entry.primary === true,
        // Preserve user choice if we already had this calendar.
        enabled: prev ? (prev.data().enabled as boolean) : enabledDefault,
        colorId: entry.colorId ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  // Remove sub-calendars that no longer exist upstream.
  for (const doc of existing.docs) {
    if (!seen.has(doc.id)) batch.delete(doc.ref);
  }

  await batch.commit();
}

export async function listCalendarAccounts(uid: string): Promise<StoredCalendarAccount[]> {
  const snap = await accountsCol(uid).orderBy('connectedAt', 'asc').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      accountEmail: (data.accountEmail as string) ?? d.id,
      scopes: (data.scopes as string[]) ?? [],
      needsReauth: (data.needsReauth as boolean) ?? false,
      connectedAt: (data.connectedAt as number) ?? 0,
    };
  });
}

export async function listSubCalendars(
  uid: string,
  accountEmail: string,
): Promise<StoredSubCalendar[]> {
  const snap = await calendarsCol(uid, accountEmail).get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        calendarId: (data.calendarId as string) ?? d.id,
        summary: (data.summary as string) ?? '(untitled)',
        primary: (data.primary as boolean) ?? false,
        enabled: (data.enabled as boolean) ?? false,
        colorId: (data.colorId as string | null) ?? null,
      };
    })
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return a.summary.localeCompare(b.summary);
    });
}

export async function setCalendarEnabled(
  uid: string,
  accountEmail: string,
  calendarId: string,
  enabled: boolean,
): Promise<void> {
  await calendarsCol(uid, accountEmail).doc(calendarId).set(
    {
      enabled,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteCalendarAccount(uid: string, accountEmail: string): Promise<void> {
  const col = calendarsCol(uid, accountEmail);
  const snap = await col.get();
  const batch = adminDb().batch();
  for (const d of snap.docs) batch.delete(d.ref);
  batch.delete(accountsCol(uid).doc(accountEmail));
  await batch.commit();
}

/**
 * Re-fetch the calendar list for an already-connected account using its
 * stored refresh token (no OAuth redirect required). Picks up newly
 * created/shared calendars without disturbing existing enabled toggles.
 */
export async function resyncCalendarAccount(
  uid: string,
  accountEmail: string,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'needs_reauth' | 'sync_failed' }> {
  const ref = accountsCol(uid).doc(accountEmail);
  const snap = await ref.get();
  const enc = snap.data()?.refreshTokenEnc as string | undefined;
  if (!snap.exists || !enc) return { ok: false, error: 'not_found' };

  const client = oauthClient();
  try {
    const refreshToken = decryptField(enc);
    client.setCredentials({ refresh_token: refreshToken });
    await client.getAccessToken();
  } catch (err) {
    if (!isInvalidGrantError(err)) {
      console.warn('resync: transient token refresh failure for', accountEmail, err);
      return { ok: false, error: 'sync_failed' };
    }
    console.warn('resync: refresh token invalid for', accountEmail, err);
    await ref.set({ needsReauth: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: false, error: 'needs_reauth' };
  }

  try {
    const cal = google.calendar({ version: 'v3', auth: client });
    const list = await cal.calendarList.list({ maxResults: 250 });
    await syncCalendarList(uid, accountEmail, list.data.items ?? []);
    await ref.set({ needsReauth: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.warn('resync: calendarList.list failed for', accountEmail, err);
    return { ok: false, error: 'sync_failed' };
  }
}
