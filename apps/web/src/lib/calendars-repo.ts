import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { encryptField } from '@week-wire/shared';
import { adminDb } from './firebase-admin';
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
