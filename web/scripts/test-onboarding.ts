// Ties what new people are TOLD (the 12-piece goal) to what the app actually NEEDS before it can
// build outfits. No database, no AI.
//   npx tsx scripts/test-onboarding.ts

import { CATEGORY_COVERAGE, STARTER_PLAN, STARTER_TOTAL } from "@/lib/coverage";
import { wardrobeReadiness } from "@/lib/outfits";
import type { Category, Item } from "@/lib/types";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

let n = 0;
const mk = (category: Category): Item => ({
  id: `i${++n}`, name: `${category} ${n}`, category, color: "grey", palette: ["#888888"], pattern: "solid", material: "cotton", formality: 2,
  seasons: [], notes: "", imageUrl: "https://x/i.jpg", originalImageUrl: null, canUndo: false, needsReview: false, reviewNote: null,
  duplicateOfId: null, duplicateNote: null, duplicateConfidence: null, source: null, added: 0,
});
const many = (category: Category, count: number) => Array.from({ length: count }, () => mk(category));

check("the goal is 12 pieces", STARTER_TOTAL === 12, String(STARTER_TOTAL));
check("the goal is 5 tops, 5 bottoms and 2 outerwear",
  STARTER_PLAN.length === 3 &&
  STARTER_PLAN.find((p) => p.category === "Tops")?.min === 5 &&
  STARTER_PLAN.find((p) => p.category === "Bottoms")?.min === 5 &&
  STARTER_PLAN.find((p) => p.category === "Outerwear")?.min === 2, JSON.stringify(STARTER_PLAN));
check("the goal is exactly the sum of the app's own minimums", STARTER_TOTAL === Object.values(CATEGORY_COVERAGE).reduce((s, r) => s + (r?.min ?? 0), 0));

// Behaviour behind the promise: with the starter set, outfits are possible; one short, they are not.
const hero = mk("Tops");
const full = [hero, ...many("Tops", 4), ...many("Bottoms", 5), ...many("Outerwear", 2)];
check("with the full starter set (12 pieces) the outfit feature is ready", full.length === 12 && wardrobeReadiness(full, hero).kind === "ok");
check("one top short, it is not ready", wardrobeReadiness([hero, ...many("Tops", 3), ...many("Bottoms", 5), ...many("Outerwear", 2)], hero).kind === "too-small");
check("one bottom short, it is not ready", wardrobeReadiness([hero, ...many("Tops", 4), ...many("Bottoms", 4), ...many("Outerwear", 2)], hero).kind === "too-small");
check("12 tops alone is NOT enough (why the panel shows the split, not just a total)", wardrobeReadiness([hero, ...many("Tops", 11)], hero).kind === "too-small");
check("outerwear is not required for outfits (it only rounds the goal out to 12)", wardrobeReadiness([hero, ...many("Tops", 4), ...many("Bottoms", 5)], hero).kind === "ok");

// ── step 2: the progress panel (lib/onboarding.ts) ──
import { onboardingProgress, unlockMessage } from "@/lib/onboarding";

const withAdded = (category: Category, added: number, extra: Partial<Item> = {}): Item => ({ ...mk(category), added, ...extra });
const kind = (items: Item[], seen = false) => onboardingProgress(items, seen)?.kind ?? null;

check("an empty rail shows no panel (the welcome handles it)", onboardingProgress([], false) === null);
check("someone who has already seen outfits gets no panel", kind([...many("Tops", 6), ...many("Bottoms", 6)], true) === null);
check("a few pieces is 'building'", kind([...many("Tops", 3), ...many("Bottoms", 2)]) === "building");

const b = onboardingProgress([...many("Tops", 3), ...many("Bottoms", 2), ...many("Outerwear", 2)], false);
check("building counts 7 of 12 and lists each category", b?.kind === "building" && b.total === 7 && b.target === 12 &&
  b.rows.map((r) => `${r.category} ${r.have}/${r.target}`).join(", ") === "Tops 3/5, Bottoms 2/5, Outerwear 2/2", JSON.stringify(b));
check("building says what unlocks outfits (2 more tops and 3 more bottoms)", b?.kind === "building" && b.message === "2 more tops and 3 more bottoms unlock outfits.", b?.kind === "building" ? b.message : "");

check("12 tops and no bottoms counts 5 of 12, never 12 of 12", (() => {
  const p = onboardingProgress(many("Tops", 12), false);
  return p?.kind === "building" && p.total === 5 && p.message === "5 more bottoms unlock outfits.";
})());
check("duplicates do not count", (() => {
  const real = [...many("Tops", 4), ...many("Bottoms", 5)];
  const dup = mk("Tops"); dup.duplicateOfId = real[0].id;
  const p = onboardingProgress([...real, dup], false);
  return p?.kind === "building" && p.message === "1 more top unlocks outfits.";
})());
check("pieces without a photo do not count", (() => {
  const p = onboardingProgress([...many("Tops", 4), mk("Tops"), ...many("Bottoms", 5)].map((i, k) => (k === 4 ? { ...i, imageUrl: null } : i)), false);
  return p?.kind === "building";
})());

check("ready at exactly 5 tops and 5 bottoms (10 pieces), not 12", kind([...many("Tops", 5), ...many("Bottoms", 5)]) === "ready");
check("one bottom short is still building", kind([...many("Tops", 5), ...many("Bottoms", 4)]) === "building");
check("ready does not wait for outerwear, but mentions it quietly", (() => {
  const p = onboardingProgress([...many("Tops", 5), ...many("Bottoms", 5)], false);
  return p?.kind === "ready" && p.total === 10 && p.roundOut === "2 more outerwear would round out your set.";
})());
check("with enough outerwear there is no round-out line", (() => {
  const p = onboardingProgress([...many("Tops", 5), ...many("Bottoms", 5), ...many("Outerwear", 2)], false);
  return p?.kind === "ready" && p.total === 12 && p.roundOut === null;
})());
check("one outerwear short says '1 more outerwear'", (() => {
  const p = onboardingProgress([...many("Tops", 5), ...many("Bottoms", 5), ...many("Outerwear", 1)], false);
  return p?.kind === "ready" && p.roundOut === "1 more outerwear would round out your set.";
})());
check("ready points at the NEWEST top", (() => {
  const tops = [withAdded("Tops", 100), withAdded("Tops", 500), withAdded("Tops", 300), withAdded("Tops", 200), withAdded("Tops", 400)];
  const p = onboardingProgress([...tops, ...many("Bottoms", 5)], false);
  return p?.kind === "ready" && p.piece.id === tops[1].id && p.piece.imageUrl.length > 0;
})());
check("footwear never counts towards or against the goal", kind([...many("Tops", 5), ...many("Bottoms", 5), ...many("Footwear", 4)]) === "ready");

check("message wording: one of each", unlockMessage(1, 1) === "1 more top and 1 more bottom unlock outfits.");
check("message wording: single and plural", unlockMessage(0, 1) === "1 more bottom unlocks outfits." && unlockMessage(3, 0) === "3 more tops unlock outfits.");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
