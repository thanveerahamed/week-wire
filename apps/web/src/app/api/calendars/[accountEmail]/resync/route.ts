import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { resyncCalendarAccount } from '@/lib/calendars-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EmailSchema = z.string().email();

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ accountEmail: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { accountEmail: raw } = await params;
  const parsed = EmailSchema.safeParse(decodeURIComponent(raw));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const result = await resyncCalendarAccount(session.uid, parsed.data);
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : result.error === 'needs_reauth' ? 409 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
