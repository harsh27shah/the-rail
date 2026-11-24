import { colourProfile, colourScore } from "./colour";
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

type Slot = "top" | "bottom" | "layer" | "foot";

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
  }
}

/** Two items can share an outfit unless they'd occupy the same "slot" (e.g. two tops). */
function complementary(a: Item, b: Item): boolean {
  return slotOf(a.category) !== slotOf(b.category);
}

function isLoudPattern(pattern: Item["pattern"]): boolean {
  return pattern !== "solid";
}

/** How well `b` goes with `a`, higher = better. Exported so the evaluation harness
 * (scripts/eval-pairings.ts) scores exactly what ships. */
export function pairScore(a: Item, b: Item): number {
  let s = 5 - Math.abs((a.formality || 3) - (b.formality || 3)); // 0-5, higher = closer formality
  s += isLoudPattern(a.pattern) && isLoudPattern(b.pattern) ? -3 : 2; // avoid clashing patterns
  const sharesSeason = a.seasons.some((season) => b.seasons.includes(season));
  s += sharesSeason ? 1 : 0;
  return s;
}

export interface ScorerOptions {
  /** Treat "textured" (a ribbed knit, say) as plain rather than as a loud pattern. Only
   * striped / checked / printed pieces clash with each other. */
  texturedIsPlain?: boolean;
  /** Add colour fit (lib/colour.ts) to the score. */
  colour?: boolean;
}

/** Candidate versions of the scoring rules, for the evaluation harness. With no options this
 * is identical to `pairScore`. Nothing here is used by the live app until it is shown to beat
 * `pairScore` on scripts/eval-pairings.ts and wired into `pairingsFor` on purpose. */
export function makePairScorer(opts: ScorerOptions): (a: Item, b: Item) => number {
  const loud = (p: Item["pattern"]) =>
    opts.texturedIsPlain ? p === "striped" || p === "checked" || p === "printed" : isLoudPattern(p);
  return (a, b) => {
    let s = 5 - Math.abs((a.formality || 3) - (b.formality || 3));
    s += loud(a.pattern) && loud(b.pattern) ? -3 : 2;
    s += a.seasons.some((season) => b.seasons.includes(season)) ? 1 : 0;
    if (opts.colour) s += colourScore(colourProfile(a.palette), colourProfile(b.palette));
    return s;
  };
}

/** Top N pairing suggestions for `item`, out of `pool` (the rest of the wardrobe). */
export function pairingsFor(item: Item, pool: Item[], limit = 4): Item[] {
  return pool
    .filter((other) => other.id !== item.id && complementary(item, other))
    .map((other) => ({ other, score: pairScore(item, other) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ other }) => other);
}
