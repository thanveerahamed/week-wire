import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import {
  GOOGLE_CALENDAR_SCOPES,
  newNonce,
  oauthClient,
  oauthRedirectUriFromOrigin,
  resolveOrigin,
  signState,
} from '@/lib/google-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Origins that may initiate a Google Calendar OAuth flow.
 * Add new entries when deploying to additional domains.
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'https://week-wire--week-wire.europe-west4.hosted.app',
  'https://week-wire.creativetechstudio.dev',
]);

function validateOrigin(raw: string): string | null {
  try {
    const { protocol, host } = new URL(raw);
    const normalised = `${protocol}//${host}`;
    return ALLOWED_ORIGINS.has(normalised) ? normalised : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  // Prefer the origin sent by the browser (most accurate for multi-domain
  // setups). Fall back to header-based detection for direct server calls.
  const searchParams = new URL(req.url).searchParams;
  const rawOrigin = searchParams.get('origin');
  const origin = (rawOrigin ? validateOrigin(rawOrigin) : null) ?? resolveOrigin(req);

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', origin));
  }

  // Optional hint so a "Reconnect" action for an already-connected account
  // pre-selects the right Google account instead of the browser's default.
  const loginHint = searchParams.get('email');

  const redirectUri = oauthRedirectUriFromOrigin(origin);
  const state = signState({ uid: session.uid, nonce: newNonce(), createdAt: Date.now() });
  const url = oauthClient(redirectUri).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });

  return NextResponse.redirect(url);
}
