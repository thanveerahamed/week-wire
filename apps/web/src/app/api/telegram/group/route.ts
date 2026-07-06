import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getChat, getChatMember, getMe, TelegramApiError } from '@/lib/telegram-api';
import { linkGroup, loadBotToken, setGroupNotifyEnabled, unlinkGroup } from '@/lib/telegram-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepts a public "@username" handle or a numeric chat id (e.g. -1001234567890).
const Body = z.object({
  groupId: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^(@[A-Za-z0-9_]{5,32}|-?\d+)$/u, 'Enter a group @username or numeric id'),
  // Topic (thread) id within the supergroup. Omit/empty to target the "General" topic.
  topicId: z
    .union([z.string().trim().regex(/^\d+$/u, 'Topic id must be numeric'), z.literal('')])
    .optional(),
  topicName: z.string().trim().max(64).optional(),
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
    chat = await getChat(botToken, parsed.groupId);
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? (err.description ?? err.message) : 'getChat failed';
    return NextResponse.json({ error: 'group_not_found', description }, { status: 400 });
  }

  if (chat.type !== 'supergroup') {
    return NextResponse.json({ error: 'not_a_supergroup' }, { status: 400 });
  }

  const topicId = parsed.topicId ? Number(parsed.topicId) : null;
  if (topicId != null && chat.is_forum === false) {
    return NextResponse.json({ error: 'topics_not_enabled' }, { status: 400 });
  }

  // Confirm the bot is actually a member so it can send messages there.
  const me = await getMe(botToken);
  let member;
  try {
    member = await getChatMember(botToken, parsed.groupId, me.id);
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? (err.description ?? err.message) : 'getChatMember failed';
    return NextResponse.json({ error: 'bot_not_member', description }, { status: 400 });
  }
  if (!['creator', 'administrator', 'member'].includes(member.status)) {
    return NextResponse.json({ error: 'bot_not_member' }, { status: 400 });
  }

  await linkGroup(session.uid, {
    chatId: chat.id,
    title: chat.title ?? null,
    topicId,
    topicName: parsed.topicName?.trim() || null,
  });

  return NextResponse.json({
    ok: true,
    title: chat.title ?? null,
    topicId,
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

  await setGroupNotifyEnabled(session.uid, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await unlinkGroup(session.uid);
  return NextResponse.json({ ok: true });
}
