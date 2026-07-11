import { google } from 'googleapis';
import {
  decryptField,
  expandCustomEventOccurrences,
  type CustomEventRecurrence,
  type DigestEvent,
} from './shared-vendored';
import { db } from './firebase';
import { env } from './env';

/**
 * True only for genuine refresh-token invalidation (revoked/expired
 * consent), as opposed to transient network or Google API errors. Only
 * these should force the user to reconnect — anything else is safe to
 * retry on the next scheduled run without flagging the account.
 */
function isInvalidGrantError(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } } | undefined;
  if (e?.response?.data?.error === 'invalid_grant') return true;
  return typeof e?.message === 'string' && e.message.includes('invalid_grant');
}

function oauthClient() {
  const e = env();
  return new google.auth.OAuth2(
    e.GOOGLE_OAUTH_CLIENT_ID,
    e.GOOGLE_OAUTH_CLIENT_SECRET,
    e.GOOGLE_OAUTH_REDIRECT_URI ?? 'https://placeholder.invalid/cb',
  );
}

/**
 * User-created custom events (`users/{uid}/customEvents/{eventId}`), merged
 * into the same digest sent by the existing twice-daily cron — no separate
 * trigger is added for these.
 */
async function collectCustomEvents(args: {
  uid: string;
  lookaheadDays: number;
  now: Date;
}): Promise<DigestEvent[]> {
  const { uid, lookaheadDays, now } = args;
  const snap = await db.collection('users').doc(uid).collection('customEvents').get();
  if (snap.empty) return [];

  const from = now.getTime();
  const to = from + lookaheadDays * 86_400_000;
  const out: DigestEvent[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.enabled === false) continue;
    const startAt = typeof data.startAt === 'number' ? data.startAt : null;
    if (startAt == null) continue;
    const durationMinutes = typeof data.durationMinutes === 'number' ? data.durationMinutes : 60;
    const recurrence: CustomEventRecurrence =
      data.recurrence === 'daily' || data.recurrence === 'weekly' || data.recurrence === 'monthly'
        ? data.recurrence
        : 'none';
    const recurrenceEndAt = typeof data.recurrenceEndAt === 'number' ? data.recurrenceEndAt : null;

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

export async function collectUpcomingEvents(args: {
  uid: string;
  lookaheadDays: number;
  timezone: string;
  now?: Date;
}): Promise<DigestEvent[]> {
  const { uid, lookaheadDays, timezone, now = new Date() } = args;
  const accountsSnap = await db.collection('users').doc(uid).collection('calendarAccounts').get();

  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + lookaheadDays * 86_400_000).toISOString();
  const out: DigestEvent[] = [];

  for (const acc of accountsSnap.docs) {
    const accountEmail = (acc.data().accountEmail as string | undefined) ?? acc.id;
    const enc = acc.data().refreshTokenEnc as string | undefined;
    if (!enc) continue;

    const calsSnap = await acc.ref.collection('calendars').where('enabled', '==', true).get();
    if (calsSnap.empty) continue;

    let client;
    try {
      const refreshToken = decryptField(enc);
      client = oauthClient();
      client.setCredentials({ refresh_token: refreshToken });
      await client.getAccessToken();
      // Refresh succeeded — clear any stale flag from a prior transient failure.
      if (acc.data().needsReauth === true) {
        await acc.ref.set({ needsReauth: false }, { merge: true });
      }
    } catch (err) {
      if (!isInvalidGrantError(err)) {
        console.warn(`[${uid}] transient refresh failure for ${accountEmail}`, err);
        continue;
      }
      console.warn(`[${uid}] refresh failed for ${accountEmail}`, err);
      await acc.ref.set({ needsReauth: true }, { merge: true });
      continue;
    }

    const cal = google.calendar({ version: 'v3', auth: client });
    for (const calDoc of calsSnap.docs) {
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
          out.push({
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
        console.warn(`[${uid}] events.list failed`, { accountEmail, calendarId, err });
      }
    }
  }

  const customEvents = await collectCustomEvents({ uid, lookaheadDays, now });
  out.push(...customEvents);

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
