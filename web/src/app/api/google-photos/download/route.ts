import { NextRequest, NextResponse } from "next/server";
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
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": mimeType } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't download that photo" },
      { status: 500 }
    );
  }
}
