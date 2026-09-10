import type { Item } from "./types";

/**
 * Rule-based "styles well with" scoring — the real P0 pairing logic, replacing the
 * hand-authored mock data used in the retired prototype (PROJECT.md §4).
 *
 * Deliberately simple and free to run (no AI call per view): category complementarity as
 * a hard gate, then formality closeness, pattern-clash avoidance, and season overlap as
 * soft scoring. Good enough to validate the feature; swappable for an AI-computed version
 * later without touching any UI code (see PROJECT.md §2, "not decided yet").
 */

type Slot = "top" | "bottom" | "layer" | "foot" | "acc";

function slotOf(category: Item["category"]): Slot {
  switch (category) {
    case "Tops":
      return "top";
    case "Bottoms":
      return "bottom";
    case "Outerwear":
      return "layer";
    case "Footwear":
      return "foot";
    case "Accessories":
      return "acc";
  }
}

/** Two items can share an outfit unless they'd occupy the same "slot" (e.g. two tops) —
 * accessories are the exception, since stacking a belt and a watch is normal. */
function complementary(a: Item, b: Item): boolean {
  const slotA = slotOf(a.category);
  const slotB = slotOf(b.category);
  if (slotA === "acc" || slotB === "acc") return true;
  return slotA !== slotB;
}

function isLoudPattern(pattern: Item["pattern"]): boolean {
  return pattern !== "solid";
}

function score(a: Item, b: Item): number {
  let s = 5 - Math.abs((a.formality || 3) - (b.formality || 3)); // 0-5, higher = closer formality
  s += isLoudPattern(a.pattern) && isLoudPattern(b.pattern) ? -3 : 2; // avoid clashing patterns
  const sharesSeason = a.seasons.some((season) => b.seasons.includes(season));
  s += sharesSeason ? 1 : 0;
  return s;
}

/** Top N pairing suggestions for `item`, out of `pool` (the rest of the wardrobe). */
export function pairingsFor(item: Item, pool: Item[], limit = 4): Item[] {
  return pool
    .filter((other) => other.id !== item.id && complementary(item, other))
    .map((other) => ({ other, score: score(item, other) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ other }) => other);
}
