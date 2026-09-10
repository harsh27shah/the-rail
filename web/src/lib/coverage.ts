import type { Category } from "./types";

/**
 * Wardrobe coverage nudges — a small red indicator on a category's filter pill (see
 * Storefront.tsx) when the owner hasn't uploaded enough of that category to actually build
 * outfits from. Found this gap in real use: ingestion so far has been biased toward
 * outerwear (the outer layer is the most photogenic/visible piece in a mirror selfie), while
 * tops and bottoms — the two categories every single outfit actually requires — lagged
 * behind. The nudge exists to steer a new user toward the "aha" moment (see PROJECT.md §1)
 * faster, not to gate anything — filtering and browsing work exactly the same regardless.
 *
 * Deliberately only defined for categories with a clear, arguable minimum right now:
 * Tops and Bottoms are structurally required for any outfit at all, so five each is a
 * reasonable floor for real day-to-day rotation. Outerwear is contextual (climate-dependent,
 * per the owner) so its floor is lower and softer. Footwear and Accessories don't have an
 * agreed minimum yet — leave them unbadged rather than guess at a number. Revisit once
 * there's a clearer read on what "enough footwear" or "enough accessories" means.
 */
export const CATEGORY_COVERAGE: Partial<
  Record<Category, { min: number; message: (needed: number) => string }>
> = {
  Tops: {
    min: 5,
    message: (needed) =>
      `Add ${needed} more top${needed === 1 ? "" : "s"} — every outfit needs one, and five ` +
      `gives enough real rotation to stop repeating the same look.`,
  },
  Bottoms: {
    min: 5,
    message: (needed) =>
      `Add ${needed} more bottom${needed === 1 ? "" : "s"} — every outfit needs one, and five ` +
      `gives enough real rotation to stop repeating the same look.`,
  },
  Outerwear: {
    min: 2,
    message: (needed) =>
      `Add ${needed} more outerwear piece${needed === 1 ? "" : "s"} — useful once the ` +
      `weather calls for a layer, less urgent than tops or bottoms.`,
  },
};

export interface CoverageGap {
  min: number;
  needed: number;
  message: string;
}

/** Returns the coverage gap for a category at the given count, or null if it's either
 * undefined for this category or already met. */
export function coverageGap(category: Category, count: number): CoverageGap | null {
  const rule = CATEGORY_COVERAGE[category];
  if (!rule || count >= rule.min) return null;
  const needed = rule.min - count;
  return { min: rule.min, needed, message: rule.message(needed) };
}
