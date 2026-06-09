import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware: cheap presence check on the session cookie. Full
 * verification happens in the protected layout via firebase-admin (Node
 * runtime), which the Edge runtime cannot do.
 */
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__wwsession';

export function middleware(req: NextRequest) {
  const hasCookie = req.cookies.has(COOKIE_NAME);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*'],
};
