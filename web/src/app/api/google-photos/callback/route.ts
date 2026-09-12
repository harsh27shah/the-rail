import { NextRequest, NextResponse } from "next/server";
import { createPickerSession, exchangeCodeForTokens, getValidAccessToken } from "@/lib/google-photos";

/**
 * Step 2 of connecting Google Photos: Google redirects here with a one-time `code` after
 * the owner grants (or denies) access. Exchanges it for real tokens (lib/google-photos.ts),
 * then immediately opens a Picker session and sends the owner straight into it — they were
 * already mid-flow on Google's own domain, so continuing into picking without a detour back
 * through this app first is the smoother path. /add resumes polling using the session id
 * and picker URL carried in the redirect's query string.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/add?gpError=${encodeURIComponent("Google sign-in was cancelled")}`, request.nextUrl.origin)
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(
      new URL(`/add?gpError=${encodeURIComponent("That Google sign-in didn't look right — try again")}`, request.nextUrl.origin)
    );
  }

  try {
    await exchangeCodeForTokens(code, request.nextUrl.origin);
    const accessToken = await getValidAccessToken();
    const session = await createPickerSession(accessToken);

    const redirectUrl = new URL("/add", request.nextUrl.origin);
    redirectUrl.searchParams.set("gpSession", session.id);
    redirectUrl.searchParams.set("gpPickerUri", session.pickerUri);
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.delete("google_oauth_state");
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't connect to Google Photos";
    return NextResponse.redirect(new URL(`/add?gpError=${encodeURIComponent(message)}`, request.nextUrl.origin));
  }
}
