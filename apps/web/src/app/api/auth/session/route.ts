import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, destroySession } from '@/lib/session';

const Body = z.object({
  idToken: z.string().min(10).max(4096),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  try {
    await createSession(parsed.idToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('session create failed', err);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}

export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
