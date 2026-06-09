import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { setCalendarEnabled } from '@/lib/calendars-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ enabled: z.boolean() });

const EmailSchema = z.string().email();
const CalendarIdSchema = z.string().min(1).max(512);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ accountEmail: string; calendarId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { accountEmail: rawEmail, calendarId: rawCalId } = await params;
  const accountEmail = EmailSchema.safeParse(decodeURIComponent(rawEmail));
  const calendarId = CalendarIdSchema.safeParse(decodeURIComponent(rawCalId));
  if (!accountEmail.success || !calendarId.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 });
  }

  let body;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  await setCalendarEnabled(session.uid, accountEmail.data, calendarId.data, body.enabled);
  return NextResponse.json({ ok: true });
}
