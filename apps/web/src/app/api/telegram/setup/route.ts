import { NextResponse } from 'next/server';
import { z } from 'zod';
import { TelegramBotTokenSchema } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { getMe, setWebhook, TelegramApiError } from '@/lib/telegram-api';
import {
  saveBotConfig,
  webhookSecretFor,
  webhookUrlFor,
} from '@/lib/telegram-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ botToken: TelegramBotTokenSchema });

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message ?? 'invalid' : 'invalid';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  let me;
  try {
    me = await getMe(parsed.botToken);
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? err.description ?? err.message : 'getMe failed';
    return NextResponse.json(
      { error: 'invalid_token', description },
      { status: 400 },
    );
  }

  if (!me.is_bot || !me.username) {
    return NextResponse.json({ error: 'not_a_bot' }, { status: 400 });
  }

  // Register webhook BEFORE persisting, so we never store a token we can't reach.
  try {
    await setWebhook(parsed.botToken, {
      url: webhookUrlFor(session.uid),
      secretToken: webhookSecretFor(session.uid),
    });
  } catch (err) {
    const description =
      err instanceof TelegramApiError ? err.description ?? err.message : 'setWebhook failed';
    return NextResponse.json(
      { error: 'webhook_failed', description },
      { status: 502 },
    );
  }

  const { linkSecret } = await saveBotConfig(session.uid, {
    botToken: parsed.botToken,
    botUsername: me.username,
  });

  return NextResponse.json({
    ok: true,
    botUsername: me.username,
    linkSecret,
    startUrl: `https://t.me/${me.username}?start=${linkSecret}`,
  });
}
