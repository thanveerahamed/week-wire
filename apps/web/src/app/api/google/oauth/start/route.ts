import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import {
  GOOGLE_CALENDAR_SCOPES,
  newNonce,
  oauthClient,
  oauthRedirectUriFromOrigin,
  signState,
} from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const origin = new URL(req.url).origin;
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', origin));
  }

  const redirectUri = oauthRedirectUriFromOrigin(origin);
  const state = signState({ uid: session.uid, nonce: newNonce(), createdAt: Date.now() });
  const url = oauthClient(redirectUri).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // force refresh_token even on re-auth
    include_granted_scopes: true,
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
  });

  return NextResponse.redirect(url);
}
