import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { clearBotConfig, setChatNotifyEnabled } from '@/lib/telegram-repo';
import { deleteWebhook } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  await setChatNotifyEnabled(session.uid, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = await clearBotConfig(session.uid);
  if (token) {
    // Best-effort: revoke the webhook so Telegram stops calling us with this bot.
    try {
      await deleteWebhook(token);
    } catch (err) {
      console.warn('telegram deleteWebhook on disconnect failed', err);
    }
  }
  return NextResponse.json({ ok: true });
}
