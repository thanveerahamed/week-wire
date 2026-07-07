import 'server-only';
import { google } from 'googleapis';
import {
  decryptField,
  expandCustomEventOccurrences,
  type CustomEventRecurrence,
  type DigestEvent,
} from '@week-wire/shared';
import { adminDb } from './firebase-admin';
import { oauthClient } from './google-oauth';

/**
 * User-created custom events (`users/{uid}/customEvents/{eventId}`), merged
 * into the same digest sent by the existing twice-daily cron — no separate
 * trigger is added for these. Mirrors functions/src/collector.ts so the web
 * preview matches what actually gets sent.
 */
async function collectCustomEvents(args: {
  uid: string;
  lookaheadDays: number;
  now: Date;
}): Promise<DigestEvent[]> {
  const { uid, lookaheadDays, now } = args;
  const snap = await adminDb().collection('users').doc(uid).collection('customEvents').get();
  if (snap.empty) return [];

  const from = now.getTime();
  const to = from + lookaheadDays * 24 * 60 * 60 * 1000;
  const out: DigestEvent[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.enabled === false) continue;
    const startAt = typeof data.startAt === 'number' ? data.startAt : null;
    if (startAt == null) continue;
    const durationMinutes =
      typeof data.durationMinutes === 'number' ? data.durationMinutes : 60;
    const recurrence: CustomEventRecurrence =
      data.recurrence === 'daily' || data.recurrence === 'weekly' || data.recurrence === 'monthly'
        ? data.recurrence
        : 'none';
    const recurrenceEndAt =
      typeof data.recurrenceEndAt === 'number' ? data.recurrenceEndAt : null;

    const occurrences = expandCustomEventOccurrences(
      { startAt, durationMinutes, recurrence, recurrenceEndAt },
      { from, to },
    );
    for (const occ of occurrences) {
      out.push({
        id: `${doc.id}_${occ.start}`,
        calendarId: 'custom',
        accountEmail: 'custom',
        title: typeof data.title === 'string' ? data.title : '(untitled)',
        location: typeof data.location === 'string' ? data.location : null,
        start: new Date(occ.start).toISOString(),
        end: new Date(occ.end).toISOString(),
        allDay: false,
      });
    }
  }

  return out;
}

/**
 * Fetch upcoming events across all of a user's connected calendar accounts,
 * filtered to the calendars they have enabled, within `lookaheadDays`.
 * Marks the calendarAccount as `needsReauth=true` if the refresh token fails.
 */
export async function collectUpcomingEvents(args: {
  uid: string;
  lookaheadDays: number;
  timezone: string;
  now?: Date;
}): Promise<DigestEvent[]> {
  const { uid, lookaheadDays, timezone, now = new Date() } = args;
  const db = adminDb();

  const accountsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('calendarAccounts')
    .get();

  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000).toISOString();

  const all: DigestEvent[] = [];

  for (const acc of accountsSnap.docs) {
    const accountEmail = (acc.data().accountEmail as string | undefined) ?? acc.id;
    const enc = acc.data().refreshTokenEnc as string | undefined;
    if (!enc) continue;

    const calendarsSnap = await acc.ref.collection('calendars').where('enabled', '==', true).get();
    if (calendarsSnap.empty) continue;

    let client;
    try {
      const refreshToken = decryptField(enc);
      client = oauthClient();
      client.setCredentials({ refresh_token: refreshToken });
      // Force a token refresh now so we surface auth errors before fan-out.
      await client.getAccessToken();
    } catch (err) {
      console.warn('refresh token failed for', accountEmail, err);
      await acc.ref.set({ needsReauth: true }, { merge: true });
      continue;
    }

    const cal = google.calendar({ version: 'v3', auth: client });

    for (const calDoc of calendarsSnap.docs) {
      const calendarId = (calDoc.data().calendarId as string | undefined) ?? calDoc.id;
      try {
        const res = await cal.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          timeZone: timezone,
        });
        for (const ev of res.data.items ?? []) {
          if (!ev.id || ev.status === 'cancelled') continue;
          const startIso = ev.start?.dateTime ?? ev.start?.date;
          const endIso = ev.end?.dateTime ?? ev.end?.date;
          if (!startIso || !endIso) continue;
          all.push({
            id: ev.id,
            calendarId,
            accountEmail,
            title: ev.summary ?? '(untitled)',
            location: ev.location ?? null,
            start: startIso,
            end: endIso,
            allDay: !ev.start?.dateTime,
          });
        }
      } catch (err) {
        console.warn('events.list failed', { accountEmail, calendarId, err });
      }
    }
  }

  const customEvents = await collectCustomEvents({ uid, lookaheadDays, now });
  all.push(...customEvents);

  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}
