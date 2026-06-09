import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { clearBotConfig } from '@/lib/telegram-repo';
import { deleteWebhook } from '@/lib/telegram-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
