// proxy.ts
// (Next.js 16 renamed Middleware to Proxy — same runtime, see web/AGENTS.md
// and node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.)
//
// Optimistic auth gate: runs before any protected page is served, so a
// signed-out visitor who presses the browser back button or types a
// dashboard URL directly gets redirected here — before the page ever
// reaches the browser. This closes the gap that useRequireRole
// (web/hooks/useRequireRole.ts) leaves open: that hook only redirects from
// inside a useEffect, i.e. after the page has already hydrated, so it can't
// stop the initial paint of a cached/back-navigated page.
//
// This is deliberately an OPTIMISTIC check, per Next's own authentication
// guide (guides/authentication.md#optimistic-checks-with-proxy-optional):
// it only reads a plain "is someone signed in" cookie set by AuthContext,
// never a Firebase ID token — Proxy has no Firebase Admin credentials and
// shouldn't be given any. Real authorization is unchanged and still lives
// in two places: useRequireRole (role-based UI gating, client-side) and
// verifyToken (server/src/middleware/auth.ts, verifies the actual ID token
// on every API call). A forged cookie gets someone past this redirect and
// nothing else — every real data request still requires a valid Firebase ID
// token.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'session_active';

// Paths reachable without being signed in. Everything else is protected by
// default, so a newly added page is safe even if nobody remembers to list
// it here.
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/reset-password',
  '/examiner-access',
  '/defense-access',
  '/login-security',
  '/privacy-policy',
  '/maintenance',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true; // app/page.tsx resolves its own redirect
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const signedIn = request.cookies.get(SESSION_COOKIE)?.value === '1';
  if (!signedIn) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Defense-in-depth against the browser's back/forward cache (bfcache) or
  // HTTP cache repainting a stale authenticated page after logout — without
  // this header, pressing back right after signing out can show the old
  // page from cache without issuing a new request at all.
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, must-revalidate');
  return response;
}

// Skip static assets — Proxy runs on every matched request, and none of
// these ever need the auth check or the no-store header.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
