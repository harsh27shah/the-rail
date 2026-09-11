"use server";

import { resolveDuplicate } from "@/lib/items";

export type ResolveDuplicateAction = "dismiss" | "remove-flagged" | "remove-original";

/** Resolves one suspected-duplicate pair from the review queue (src/app/duplicates/page.tsx).
 * Never runs automatically — the owner always makes this call. */
export async function resolveDuplicateAction(
  flaggedId: string,
  action: ResolveDuplicateAction
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await resolveDuplicate(flaggedId, action);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update that" };
  }
}
