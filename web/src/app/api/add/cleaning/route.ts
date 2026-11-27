import { NextResponse, type NextRequest } from "next/server";
import { cleaningStatusFor } from "@/lib/add-photo";
import { guard } from "../_guard";

/** Of these piece ids, which are still having their clean photo made? Read-only, the caller's own pieces only. */
export async function POST(request: NextRequest) {
  const g = await guard(request);
  if (g instanceof NextResponse) return g;
  const ids = Array.isArray(g.body.ids) ? g.body.ids.filter((x): x is string => typeof x === "string") : [];
  return NextResponse.json({ ids: await cleaningStatusFor(g.user.id, ids) });
}
