import { NextResponse } from 'next/server';
import { formatDigest } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { getUserPrefs } from '@/lib/prefs-repo';
import { collectUpcomingEvents } from '@/lib/events-collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const prefs = await getUserPrefs(session.uid);
  const events = await collectUpcomingEvents({
    uid: session.uid,
    lookaheadDays: prefs.lookaheadDays,
    timezone: prefs.timezone,
  });
  const markdown = formatDigest(events, {
    timezone: prefs.timezone,
    lookaheadDays: prefs.lookaheadDays,
  });

  return NextResponse.json({
    markdown,
    eventCount: events.length,
    lookaheadDays: prefs.lookaheadDays,
    timezone: prefs.timezone,
  });
}
