import { NextResponse } from 'next/server';
import { UserPrefsUpdateSchema } from '@week-wire/shared';
import { getSession } from '@/lib/session';
import { updateUserPrefs } from '@/lib/prefs-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = UserPrefsUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  await updateUserPrefs(session.uid, parsed.data);
  return NextResponse.json({ ok: true });
}
