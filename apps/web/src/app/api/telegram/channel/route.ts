import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getChat, getChatMember, getMe, TelegramApiError } from '@/lib/telegram-api';
import {
  linkChannel,
  loadBotToken,
  setChannelNotifyEnabled,
  unlinkChannel,
} from '@/lib/telegram-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepts a public "@username" handle or a numeric chat id (e.g. -1001234567890).
const Body = z.object({
  channelId: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^(@[A-Za-z0-9_]{5,32}|-?\d+)$/u, 'Enter a channel @username or numeric id'),
});

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? (err.issues[0]?.message ?? 'invalid') : 'invalid';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const botToken = await loadBotToken(session.uid);
  if (!botToken) {
    return NextResponse.json({ error: 'bot_not_configured' }, { status: 400 });
  }

  let chat;
  try {
    chat = await getChat(botToken, parsed.channelId);
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? (err.description ?? err.message) : 'getChat failed';
    return NextResponse.json({ error: 'channel_not_found', description }, { status: 400 });
  }

  if (chat.type !== 'channel') {
    return NextResponse.json({ error: 'not_a_channel' }, { status: 400 });
  }

  // Confirm the bot itself is an admin so it can actually post to the channel.
  const me = await getMe(botToken);
  let member;
  try {
    member = await getChatMember(botToken, parsed.channelId, me.id);
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? (err.description ?? err.message) : 'getChatMember failed';
    return NextResponse.json({ error: 'bot_not_admin', description }, { status: 400 });
  }
  if (member.status !== 'administrator' && member.status !== 'creator') {
    return NextResponse.json({ error: 'bot_not_admin' }, { status: 400 });
  }

  await linkChannel(session.uid, {
    chatId: chat.id,
    title: chat.title ?? null,
    username: chat.username ?? null,
  });

  return NextResponse.json({
    ok: true,
    title: chat.title ?? null,
    username: chat.username ?? null,
  });
}

const PatchBody = z.object({ enabled: z.boolean() });

export async function PATCH(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await setChannelNotifyEnabled(session.uid, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await unlinkChannel(session.uid);
  return NextResponse.json({ ok: true });
}
