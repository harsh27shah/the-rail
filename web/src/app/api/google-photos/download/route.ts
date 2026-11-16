import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth";
import { downloadPhoto, getValidAccessToken } from "@/lib/google-photos";

/**
 * Proxies one picked photo's actual bytes to the client. Has to happen server-side — the
 * access token that Google requires for this fetch can never reach the browser — so
 * GooglePhotosImport.tsx calls this once per selected photo instead of fetching `baseUrl`
 * directly, and gets back a plain image response it can turn into an ordinary File, exactly
 * like a locally-chosen one.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const baseUrl = request.nextUrl.searchParams.get("baseUrl");
  const mimeType = request.nextUrl.searchParams.get("mimeType") || "image/jpeg";
  if (!baseUrl) return NextResponse.json({ error: "Missing baseUrl" }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken(user.id);
    const bytes = await downloadPhoto(accessToken, baseUrl);
    // Label the response by what the bytes actually are. Google's Picker reports iPhone photos
    // as image/heif even when it serves plain JPEG, and a wrong label here used to travel all
    // the way to the tagger (which rejects it). The upload step re-checks too — see
    // normalizeUpload in lib/ingest.ts — this just keeps the File's type honest on the way.
    let contentType = mimeType;
    try {
      const format = (await sharp(bytes).metadata()).format;
      if (format === "jpeg") contentType = "image/jpeg";
      else if (format === "png") contentType = "image/png";
      else if (format === "webp") contentType = "image/webp";
    } catch {
      // not decodable here — keep Google's label; the upload step reports it properly
    }
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": contentType } });
  } catch (e) {
    // Host only — the full URL is a (temporary) capability and doesn't belong in logs.
    let host = "unparseable";
    try {
      host = new URL(baseUrl).hostname;
    } catch {
      // leave as-is
    }
    console.error(`[google-photos] download failed (host: ${host}):`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't download that photo" },
      { status: 500 }
    );
  }
}
