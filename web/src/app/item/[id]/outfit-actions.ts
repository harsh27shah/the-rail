"use server";

import { requireUser } from "@/lib/auth";
import { getItem, getItems } from "@/lib/items";
import { eligibleItems, generateOutfits, isStale, wardrobeReadiness } from "@/lib/outfits";
import { claimGeneration, loadSet, saveFailed, saveReady } from "@/lib/outfit-store";
import { claudeOutfitModel } from "@/lib/stylist";
import { trackUsageFor } from "@/lib/usage";

export type GenerateOutfitsResult =
  | { kind: "ready" }
  | { kind: "busy" } // someone (another tab) is already working on it
  | { kind: "too-small" }
  | { kind: "failed"; message: string };

const FRIENDLY_FAILURE = "Couldn't put outfits together just now. Try again in a moment.";

/**
 * Works out (or re-works out) the recommended outfits for one item and saves them. Called by the
 * item page when it finds none saved, or saved ones that are out of date — so opening an item
 * costs nothing while its outfits hold. Raw errors go to the server log, never to the screen.
 */
export async function generateOutfitsAction(itemId: string): Promise<GenerateOutfitsResult> {
  const user = await requireUser();
  trackUsageFor(user.id);
  const hero = await getItem(user.id, itemId);
  if (!hero) return { kind: "failed", message: "That piece isn't on the rail any more." };

  try {
    const all = await getItems(user.id);
    const eligible = eligibleItems(all);
    if (wardrobeReadiness(eligible, hero).kind === "too-small") return { kind: "too-small" };

    const saved = await loadSet(user.id, itemId);
    if (saved?.status === "ready" && !isStale(saved, eligible, hero.id)) return { kind: "ready" };

    if (!(await claimGeneration(user.id, itemId))) return { kind: "busy" };

    try {
      const result = await generateOutfits(hero, all, claudeOutfitModel());
      if (result.status === "ready") {
        await saveReady(user.id, itemId, result.outfits, eligible.length);
        console.log(`[outfits] ${itemId}: ${result.outfits.length} outfits, ${result.attempts} attempt(s), tokens in ${result.usage.input} out ${result.usage.output}`);
        return { kind: "ready" };
      }
      if (result.status === "too-small") return { kind: "too-small" };
      console.error(`[outfits] ${itemId} failed:`, result.error);
      await saveFailed(user.id, itemId, result.error);
      return { kind: "failed", message: FRIENDLY_FAILURE };
    } catch (e) {
      console.error(`[outfits] ${itemId} crashed:`, e);
      await saveFailed(user.id, itemId, e instanceof Error ? e.message : "unknown error").catch(() => {});
      return { kind: "failed", message: FRIENDLY_FAILURE };
    }
  } catch (e) {
    console.error(`[outfits] ${itemId} couldn't start:`, e);
    return { kind: "failed", message: FRIENDLY_FAILURE };
  }
}
