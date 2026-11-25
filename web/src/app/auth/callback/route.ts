import { NextRequest, NextResponse } from "next/server";
import { getAuthClient } from "@/lib/supabase-auth";

/**
 * Where both sign-in routes land: the emailed magic link and "Continue with Google". Swaps the one-time `code` for a real session (the
 * cookies are set by the auth client) and sends the person to the app. The exchange needs a
 * secret that was stored in the browser that *asked* for the link — so a link opened in a
 * different browser fails here, and the login page explains how to recover.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  // Google sign-in for an email with no account here (open sign-ups are off) comes back as an
  // error instead of a code. Say so plainly rather than "that link didn't work".
  if (!code && request.nextUrl.searchParams.get("error")) {
    return NextResponse.redirect(new URL("/login?error=invite", origin));
  }

  if (code) {
    try {
      const supabase = await getAuthClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", origin));
    } catch {
      // fall through to the error redirect
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
