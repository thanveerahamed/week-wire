import { google } from 'googleapis';
import { decryptField, type DigestEvent } from './shared-vendored';
import { db } from './firebase';
import { env } from './env';

function oauthClient() {
  const e = env();
  return new google.auth.OAuth2(
    e.GOOGLE_OAUTH_CLIENT_ID,
    e.GOOGLE_OAUTH_CLIENT_SECRET,
    e.GOOGLE_OAUTH_REDIRECT_URI ?? 'https://placeholder.invalid/cb',
  );
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
    } catch (err) {
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

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
