import { NextRequest, NextResponse } from "next/server";
import { getPickerSessionStatus, getValidAccessToken } from "@/lib/google-photos";

/**
 * Polled from the client (src/components/GooglePhotosImport.tsx) while the owner is off on
 * Google's own picker page — that's a full context switch outside this app's UI, so polling
 * a session id is the only way to notice when they've finished choosing photos.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken();
    const done = await getPickerSessionStatus(accessToken, sessionId);
    return NextResponse.json({ done });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't check the picking session" },
      { status: 500 }
    );
  }
}
