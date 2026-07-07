import { NextResponse } from 'next/server';
import { CustomEventCreateSchema } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { createCustomEvent, listCustomEvents } from '@/lib/custom-events-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const events = await listCustomEvents(session.uid);
  return NextResponse.json({ events });
}

export async function POST(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = CustomEventCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  if (
    parsed.data.recurrence !== 'none' &&
    parsed.data.recurrenceEndAt != null &&
    parsed.data.recurrenceEndAt < parsed.data.startAt
  ) {
    return NextResponse.json({ error: 'recurrenceEndAt must be after startAt' }, { status: 400 });
  }

  const id = await createCustomEvent(session.uid, parsed.data);
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
