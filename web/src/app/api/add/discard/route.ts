import { NextResponse, type NextRequest } from "next/server";
import { discardUploadFor } from "@/lib/add-photo";
import { guard } from "../_guard";

/** Throws away an uploaded photo that won't be used (skipped, or something failed). Only the caller's own. */
export async function POST(request: NextRequest) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;
  if (typeof g.body.path === "string") await discardUploadFor(g.user.id, g.body.path).catch(() => {});
  return NextResponse.json({ ok: true });
}
