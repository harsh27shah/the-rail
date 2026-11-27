import { CATEGORY_COVERAGE, STARTER_PLAN, STARTER_TOTAL } from "./coverage";
import { eligibleItems } from "./outfits";
import type { Category, Item } from "./types";

/**
 * Where a new person is up to, for the progress panel on the rail (components/OnboardingPanel.tsx;
 * PROJECT.md §5, first-run onboarding step 2). Pure logic, tested in scripts/test-onboarding.ts.
 *
 * Three moments, decided with the owner (2026-11-27):
 *  - building: some pieces, not yet enough for outfits. Shows the split and what unlocks outfits.
 *  - ready: enough for outfits (5 tops and 5 bottoms, i.e. 10 pieces: NOT the full 12), but they
 *    haven't opened a piece's outfits yet. Points at one piece. Outerwear stays a quiet extra, so
 *    nobody is held back from outfits they could already see.
 *  - nothing (null): an empty rail (the welcome handles that) or they have already seen outfits.
 *
 * Counting follows the outfit feature, not the raw total: duplicates and photo-less pieces don't
 * count (`eligibleItems`), and each category counts only up to its target, so 12 tops and no
 * bottoms reads as 5 of 12, never 12 of 12.
 */

export interface CategoryProgress {
  category: Category;
  have: number;
  target: number;
}
export interface SuggestedPiece {
  id: string;
  name: string;
  imageUrl: string;
}
export type OnboardingProgress =
  | { kind: "building"; total: number; target: number; rows: CategoryProgress[]; message: string }
  | { kind: "ready"; total: number; target: number; rows: CategoryProgress[]; piece: SuggestedPiece; roundOut: string | null };

const plural = (n: number, word: string) => `${n} more ${word}${n === 1 ? "" : "s"}`;

/** "3 more bottoms unlock outfits." / "1 more top and 2 more bottoms unlock outfits." */
export function unlockMessage(missingTops: number, missingBottoms: number): string {
  const parts = [missingTops > 0 ? plural(missingTops, "top") : null, missingBottoms > 0 ? plural(missingBottoms, "bottom") : null].filter(Boolean);
  const single = parts.length === 1 && (missingTops === 1 || missingBottoms === 1);
  return `${parts.join(" and ")} ${single ? "unlocks" : "unlock"} outfits.`;
}

export function onboardingProgress(items: Item[], seenOutfits: boolean): OnboardingProgress | null {
  if (items.length === 0 || seenOutfits) return null;

  const eligible = eligibleItems(items);
  const rows: CategoryProgress[] = STARTER_PLAN.map((p) => ({
    category: p.category,
    have: eligible.filter((i) => i.category === p.category).length,
    target: p.min,
  }));
  const total = rows.reduce((n, r) => n + Math.min(r.have, r.target), 0);
  const row = (c: Category) => rows.find((r) => r.category === c)!;

  const missingTops = Math.max(0, (CATEGORY_COVERAGE.Tops?.min ?? 5) - row("Tops").have);
  const missingBottoms = Math.max(0, (CATEGORY_COVERAGE.Bottoms?.min ?? 5) - row("Bottoms").have);

  if (missingTops > 0 || missingBottoms > 0) {
    return { kind: "building", total, target: STARTER_TOTAL, rows, message: unlockMessage(missingTops, missingBottoms) };
  }

  // Ready. Point at the newest top: the piece they have most recently been looking at.
  const newestTop = eligible.filter((i) => i.category === "Tops").sort((a, b) => b.added - a.added)[0];
  const outerwear = row("Outerwear");
  const missingOuterwear = Math.max(0, outerwear.target - outerwear.have);
  return {
    kind: "ready",
    total,
    target: STARTER_TOTAL,
    rows,
    piece: { id: newestTop.id, name: newestTop.name, imageUrl: newestTop.imageUrl! },
    roundOut: missingOuterwear > 0 ? `${missingOuterwear} more outerwear would round out your set.` : null,
  };
}
