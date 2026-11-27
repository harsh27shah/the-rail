import { NextResponse, type NextRequest } from "next/server";
import { addPhotoFor, addPhotoWithPersonFor, type AddPhotoResult } from "@/lib/add-photo";
import { guard } from "../_guard";

/**
 * Catalogues ONE uploaded photo. With just `uploadPath` it reads the photo (and may answer "needs-selection"
 * when several people are in it). With `box` as well it is the second step of that flow: the person tapped
 * which one is them, so it crops to that box and catalogues only that. See lib/add-photo.ts.
 *
 * A route, not a Server Action, so several photos can be read at the same time.
 */
export async function POST(request: NextRequest) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;
  const uploadPath = typeof g.body.uploadPath === "string" ? g.body.uploadPath : "";
  try {
    const result: AddPhotoResult =
      g.body.box === undefined ? await addPhotoFor(g.user.id, uploadPath) : await addPhotoWithPersonFor(g.user.id, uploadPath, g.body.box);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[add] reading a photo failed:", e);
    const error: AddPhotoResult = { kind: "error", error: "something went wrong reading that photo" };
    return NextResponse.json(error);
  }
}
