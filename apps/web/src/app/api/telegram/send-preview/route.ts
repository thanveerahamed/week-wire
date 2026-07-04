import { NextResponse } from 'next/server';
import { formatDigest, formatDigestDateLabel } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { getUserPrefs } from '@/lib/prefs-repo';
import { collectUpcomingEvents } from '@/lib/events-collector';
import { getLinkedChannel, getLinkedChat } from '@/lib/telegram-repo';
import { sendMessage, TelegramApiError } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DestinationResult {
  destination: 'dm' | 'channel';
  ok: boolean;
  description?: string;
}

async function sendTo(
  destination: 'dm' | 'channel',
  botToken: string,
  chatId: number,
  markdown: string,
): Promise<DestinationResult> {
  try {
    await sendMessage(botToken, { chat_id: chatId, text: markdown, parse_mode: 'MarkdownV2' });
    return { destination, ok: true };
  } catch (err) {
    const description =
      err instanceof TelegramApiError
        ? err.description
        : err instanceof Error
          ? err.message
          : undefined;
    console.error('telegram send-preview failed', { destination, description });
    return { destination, ok: false, description };
  }
}

export async function POST(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [dm, channel] = await Promise.all([
    getLinkedChat(session.uid),
    getLinkedChannel(session.uid),
  ]);
  if (!dm && !channel) {
    return NextResponse.json({ error: 'not_linked' }, { status: 409 });
  }

  const prefs = await getUserPrefs(session.uid);
  const events = await collectUpcomingEvents({
    uid: session.uid,
    lookaheadDays: prefs.lookaheadDays,
    timezone: prefs.timezone,
  });
  const dateLabel = formatDigestDateLabel(new Date(), prefs.timezone);
  const markdown = formatDigest(events, {
    timezone: prefs.timezone,
    title: `WeekWire preview – ${dateLabel}`,
  });

  const results = await Promise.all([
    dm ? sendTo('dm', dm.botToken, dm.chatId, markdown) : null,
    channel ? sendTo('channel', channel.botToken, channel.chatId, markdown) : null,
  ]);
  const attempted = results.filter((r): r is DestinationResult => r !== null);
  const anyOk = attempted.some((r) => r.ok);

  if (!anyOk) {
    return NextResponse.json({ error: 'send_failed', results: attempted }, { status: 502 });
  }
  return NextResponse.json({ ok: true, results: attempted });
}
