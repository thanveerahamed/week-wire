import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  GOOGLE_CALENDAR_SCOPES,
  newNonce,
  oauthClient,
  signState,
} from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', requestOrigin()));
  }

  const state = signState({ uid: session.uid, nonce: newNonce(), createdAt: Date.now() });
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token even on re-auth
    include_granted_scopes: true,
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
  });

  return NextResponse.redirect(url);
}

function requestOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
