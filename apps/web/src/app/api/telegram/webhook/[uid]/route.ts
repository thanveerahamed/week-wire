import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  findByLinkSecret,
  loadBotToken,
  setLinkedChat,
  webhookSecretFor,
} from '@/lib/telegram-repo';
import { sendMessage } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Minimal subset of the Telegram Bot API Update we actually use.
 * https://core.telegram.org/bots/api#update
 */
const UpdateSchema = z.object({
  update_id: z.number(),
  message: z
    .object({
      message_id: z.number(),
      from: z
        .object({
          id: z.number(),
          is_bot: z.boolean().optional(),
          first_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
      chat: z.object({
        id: z.number(),
        type: z.string(),
      }),
      text: z.string().optional(),
      entities: z
        .array(
          z.object({
            type: z.string(),
            offset: z.number(),
            length: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const UidSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/u);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<Response> {
  const { uid: rawUid } = await params;
  const uidParse = UidSchema.safeParse(rawUid);
  if (!uidParse.success) {
    return NextResponse.json({ error: 'bad_uid' }, { status: 400 });
  }
  const uid = uidParse.data;

  // Verify Telegram secret header (set when we registered the webhook).
  const presented = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const expected = webhookSecretFor(uid);
  if (!safeEq(presented, expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let update;
  try {
    update = UpdateSchema.parse(await req.json());
  } catch {
    // Bad payload — acknowledge so Telegram doesn't retry forever.
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text;
  const chatId = update.message?.chat.id;
  if (!text || chatId === undefined) {
    return NextResponse.json({ ok: true });
  }

  // Only respond to /start <payload>; everything else is a no-op for v1.
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,})\s*$/u.exec(text);
  if (!match) {
    return NextResponse.json({ ok: true });
  }
  const linkSecret = match[1]!;

  const found = await findByLinkSecret(linkSecret);
  if (!found || found.uid !== uid) {
    const token = await loadBotToken(uid);
    if (token) {
      try {
        await sendMessage(token, {
          chat_id: chatId,
          text: 'This link is invalid or expired. Please regenerate it in WeekWire.',
        });
      } catch (err) {
        console.warn('telegram reply (invalid link) failed', err);
      }
    }
    return NextResponse.json({ ok: true });
  }

  await setLinkedChat(uid, chatId);

  try {
    await sendMessage(found.botToken, {
      chat_id: chatId,
      text: "✅ You're linked! WeekWire will send your calendar digest twice a day.",
    });
  } catch (err) {
    console.warn('telegram confirmation send failed', err);
  }

  return NextResponse.json({ ok: true });
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
