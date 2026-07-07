import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CustomEventUpdateSchema } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { updateCustomEvent, deleteCustomEvent } from '@/lib/custom-events-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EventIdSchema = z.string().min(1).max(200);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { eventId: rawId } = await params;
  const eventId = EventIdSchema.safeParse(decodeURIComponent(rawId));
  if (!eventId.success) return NextResponse.json({ error: 'invalid params' }, { status: 400 });

  const parsed = CustomEventUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  await updateCustomEvent(session.uid, eventId.data, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { eventId: rawId } = await params;
  const eventId = EventIdSchema.safeParse(decodeURIComponent(rawId));
  if (!eventId.success) return NextResponse.json({ error: 'invalid params' }, { status: 400 });

  await deleteCustomEvent(session.uid, eventId.data);
  return NextResponse.json({ ok: true });
}
