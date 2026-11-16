import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page/route request. Two jobs:
 *
 *  1. Keep the Supabase session fresh — an expired access token gets refreshed here and the
 *     new cookies are written onto the response, so a signed-in visitor doesn't get bounced
 *     just because their short-lived token aged out.
 *  2. A fast, cookie-only "optimistic" check that sends signed-out visitors to /login.
 *
 * This is deliberately *not* the app's real access control. Per Next's own guidance a proxy
 * check protects the page in front of it but not the Server Actions and Route Handlers
 * behind it (those are separately callable) — the real checks are `requireUser()` /
 * `getCurrentUser()` in lib/auth.ts, called right next to every data access.
 *
 * Fails closed: if auth isn't configured at all, every request is treated as signed out
 * rather than letting everything through.
 */

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });
  let signedIn = false;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    // getClaims() verifies the token locally where it can, instead of a network call to the
    // auth server on every request (this runs on prefetches too). Fine for an optimistic
    // check — the authoritative one is getUser() in lib/auth.ts.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  }

  if (!signedIn && !PUBLIC_PATHS.has(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    // 303 so a signed-out Server Action POST lands on /login as a plain GET.
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }

  return response;
}

export const config = {
  // Everything except Next internals and static assets — otherwise the login page's own
  // CSS/fonts/icons would be bounced to /login and it would render unstyled.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
