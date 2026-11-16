"use server";

import { requireUser } from "@/lib/auth";
import { markManualDuplicate } from "@/lib/items";

/**
 * The owner's own "these are the same piece" call from the item detail page
 * (src/components/MarkDuplicate.tsx) — see markManualDuplicate's comment for why this
 * exists alongside the automatic AI check. Never runs automatically.
 */
export async function markDuplicateAction(
  itemId: string,
  duplicateOfId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await markManualDuplicate(user.id, itemId, duplicateOfId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't mark that" };
  }
}
