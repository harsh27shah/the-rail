import { NextRequest, NextResponse } from "next/server";
import { deletePickerSession, getValidAccessToken, listPickedPhotos } from "@/lib/google-photos";

/**
 * Lists what the owner actually picked, once /api/google-photos/status says the session is
 * done. `baseUrl` is safe to hand to the client here (unlike the access token) — Google
 * rejects any fetch against it that doesn't carry our bearer token, so exposing the URL
 * itself grants nothing; the actual byte download still happens server-side, via
 * /api/google-photos/download. Deletes the picking session once listed (best-effort,
 * per Google's own guidance not to leave sessions around) — nothing else needs it again.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken();
    const photos = await listPickedPhotos(accessToken, sessionId);
    void deletePickerSession(accessToken, sessionId);
    return NextResponse.json({
      photos: photos.map((p) => ({ id: p.id, filename: p.filename, mimeType: p.mimeType, baseUrl: p.baseUrl })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't list the picked photos" },
      { status: 500 }
    );
  }
}
