import { NextResponse, type NextRequest } from 'next/server';
import { google } from 'googleapis';
import { getSession } from '@/lib/session';
import { oauthClient, oauthRedirectUriFromOrigin, verifyState } from '@/lib/google-oauth';
import { syncCalendarList, upsertCalendarAccount } from '@/lib/calendars-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const appUrl = new URL(req.url).origin;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/sign-in', appUrl));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) {
    return redirectToCalendars(appUrl, { error: oauthError });
  }
  if (!code || !state) {
    return redirectToCalendars(appUrl, { error: 'missing_code_or_state' });
  }

  const stateData = verifyState(state);
  if (stateData?.uid !== session.uid) {
    return redirectToCalendars(appUrl, { error: 'bad_state' });
  }

  const client = oauthClient(oauthRedirectUriFromOrigin(new URL(req.url).origin));
  let tokens;
  try {
    const exchange = await client.getToken(code);
    tokens = exchange.tokens;
  } catch (err) {
    console.error('oauth token exchange failed', err);
    return redirectToCalendars(appUrl, { error: 'exchange_failed' });
  }

  if (!tokens.refresh_token) {
    // Without offline consent we cannot run the cron — bail.
    return redirectToCalendars(appUrl, { error: 'no_refresh_token' });
  }
  client.setCredentials(tokens);

  // Identify which Google account just consented.
  let accountEmail: string;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const info = await oauth2.userinfo.get();
    if (!info.data.email) throw new Error('no email returned');
    accountEmail = info.data.email;
  } catch (err) {
    console.error('userinfo fetch failed', err);
    return redirectToCalendars(appUrl, { error: 'userinfo_failed' });
  }

  // Persist the account + refresh token (encrypted) and sync calendar list.
  const grantedScopes =
    typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/u).filter(Boolean) : [];
  try {
    await upsertCalendarAccount(session.uid, {
      accountEmail,
      refreshToken: tokens.refresh_token,
      scopes: grantedScopes,
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    const list = await cal.calendarList.list({ maxResults: 250 });
    await syncCalendarList(session.uid, accountEmail, list.data.items ?? []);
  } catch (err) {
    console.error('post-oauth persist failed', err);
    return redirectToCalendars(appUrl, { error: 'persist_failed' });
  }

  return redirectToCalendars(appUrl, { connected: accountEmail });
}

function redirectToCalendars(
  appUrl: string,
  params: Record<string, string>,
): Response {
  const dest = new URL('/app/calendars', appUrl);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
  return NextResponse.redirect(dest);
}
