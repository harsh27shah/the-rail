import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";

/**
 * Shared front door for the Add page's routes (src/app/api/add/*). Each one is a real, separately
 * callable endpoint, so each checks for itself: who is asking, and that the request is JSON.
 *
 * Why insist on JSON: a web page on another site can make a browser send a plain form or text POST to
 * this address with the visitor's cookies, but it can't send `application/json` without the browser
 * first asking this server's permission. Requiring it closes that door (Server Actions had a similar
 * built-in check; routes don't).
 */
export async function guard(request: NextRequest): Promise<{ user: CurrentUser; body: Record<string, unknown> } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { user, body: body as Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Couldn't read that request" }, { status: 400 });
  }
}
