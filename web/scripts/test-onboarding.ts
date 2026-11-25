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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
