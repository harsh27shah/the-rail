import { NextResponse, type NextRequest } from "next/server";
import { createUploadFor } from "@/lib/add-photo";
import { guard } from "../_guard";

/** Hands the browser a one-time link to upload one photo straight to temporary private storage (lib/incoming.ts). */
export async function POST(request: NextRequest) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;
  const { filename, type, size } = g.body;
  if (typeof filename !== "string" || typeof type !== "string" || typeof size !== "number") {
    return NextResponse.json({ ok: false, error: "that photo didn't come through" });
  }
  return NextResponse.json(await createUploadFor(g.user.id, { filename, type, size }));
}
