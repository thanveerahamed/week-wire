import { NextResponse } from 'next/server';
import { formatDigest } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { getUserPrefs } from '@/lib/prefs-repo';
import { collectUpcomingEvents } from '@/lib/events-collector';
import { getLinkedChat } from '@/lib/telegram-repo';
import { sendMessage, TelegramApiError } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const linked = await getLinkedChat(session.uid);
  if (!linked) {
    return NextResponse.json({ error: 'not_linked' }, { status: 409 });
  }

  const prefs = await getUserPrefs(session.uid);
  const events = await collectUpcomingEvents({
    uid: session.uid,
    lookaheadDays: prefs.lookaheadDays,
    timezone: prefs.timezone,
  });
  const markdown = formatDigest(events, { timezone: prefs.timezone, title: 'WeekWire preview' });

  try {
    await sendMessage(linked.botToken, {
      chat_id: linked.chatId,
      text: markdown,
      parse_mode: 'MarkdownV2',
    });
  } catch (err) {
    const description = err instanceof TelegramApiError ? err.description : undefined;
    console.error('telegram send-preview failed', {
      message: err instanceof Error ? err.message : String(err),
      description,
    });
    return NextResponse.json({ error: 'send_failed', description }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
