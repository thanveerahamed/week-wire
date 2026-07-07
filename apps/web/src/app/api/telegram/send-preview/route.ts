import { NextResponse } from 'next/server';
import { formatDigest, formatDigestDateLabel } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { getUserPrefs } from '@/lib/prefs-repo';
import { collectUpcomingEvents } from '@/lib/events-collector';
import { getLinkedChannel, getLinkedChat, getLinkedGroup } from '@/lib/telegram-repo';
import { sendMessage, TelegramApiError } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DestinationResult {
  destination: 'dm' | 'channel' | 'group';
  ok: boolean;
  description?: string;
}

async function sendTo(
  destination: 'dm' | 'channel' | 'group',
  botToken: string,
  chatId: number,
  markdown: string,
  messageThreadId?: number,
): Promise<DestinationResult> {
  try {
    await sendMessage(botToken, {
      chat_id: chatId,
      text: markdown,
      parse_mode: 'MarkdownV2',
      message_thread_id: messageThreadId,
    });
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

  const [dm, channel, group] = await Promise.all([
    getLinkedChat(session.uid),
    getLinkedChannel(session.uid),
    getLinkedGroup(session.uid),
  ]);
  if (!dm && !channel && !group) {
    return NextResponse.json({ error: 'not_linked' }, { status: 409 });
  }

  const prefs = await getUserPrefs(session.uid);
  const events = await collectUpcomingEvents({
    uid: session.uid,
    lookaheadDays: prefs.lookaheadDays,
    timezone: prefs.timezone,
  });
  const now = new Date();
  const dateLabel = formatDigestDateLabel(now, prefs.timezone);
  const markdown = formatDigest(events, {
    timezone: prefs.timezone,
    title: `WeekWire preview – ${dateLabel}`,
    now,
    lookaheadDays: prefs.lookaheadDays,
  });

  const results = await Promise.all([
    dm ? sendTo('dm', dm.botToken, dm.chatId, markdown) : null,
    channel ? sendTo('channel', channel.botToken, channel.chatId, markdown) : null,
    group
      ? sendTo('group', group.botToken, group.chatId, markdown, group.topicId ?? undefined)
      : null,
  ]);
  const attempted = results.filter((r): r is DestinationResult => r !== null);
  const anyOk = attempted.some((r) => r.ok);

  if (!anyOk) {
    return NextResponse.json({ error: 'send_failed', results: attempted }, { status: 502 });
  }
  return NextResponse.json({ ok: true, results: attempted });
}
