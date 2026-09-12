import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-photos";

/**
 * Step 1 of connecting Google Photos (src/lib/google-photos.ts) — sends the owner's browser
 * to Google's own consent screen. A random `state` value round-trips through Google and back
 * to /api/google-photos/callback in a short-lived cookie, checked there against what Google
 * sends back, so a forged callback request can't be used to inject someone else's auth code.
 */
export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  const origin = request.nextUrl.origin;

  const response = NextResponse.redirect(getAuthUrl(origin, state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes — plenty for a consent screen, short enough to matter as CSRF protection
    path: "/",
  });
  return response;
}
