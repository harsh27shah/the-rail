// Tests for the recommended-outfit rules (lib/outfits.ts), using a fake stylist — no AI calls.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-outfits.ts

import {
  OUTFIT_ENGINE_VERSION, checkAnswer, eligibleItems, generateOutfits, isStale, planFor, tidyWhy, wardrobeReadiness,
  type ModelFn, type Plan, type RawOutfit,
} from "@/lib/outfits";
import type { Category, Item } from "@/lib/types";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

let counter = 0;
function mk(name: string, category: Category | string, extra: Partial<Item> = {}): Item {
  counter++;
  return {
    id: `id-${counter}-${name.toLowerCase().replace(/\W+/g, "-")}`, name, category: category as Category, color: "grey", palette: ["#888888"],
    pattern: "solid", material: "cotton", formality: 2, seasons: [], notes: "", imageUrl: "https://x/img.jpg", originalImageUrl: null,
    canUndo: false, needsReview: false, reviewNote: null, duplicateOfId: null, duplicateNote: null, duplicateConfidence: null,
    source: null, added: 0, ...extra,
  };
}

const tops = ["Navy jumper", "White tee", "Black shirt", "Grey hoodie", "Olive polo", "Cream knit"].map((n) => mk(n, "Tops"));
const bottoms = ["Dark jeans", "Khaki chinos", "Black trousers", "Light jeans", "Olive cargo", "Grey joggers"].map((n) => mk(n, "Bottoms"));
const shoes = ["White trainers", "Brown boots", "Black loafers"].map((n) => mk(n, "Footwear"));
const outer = ["Denim jacket", "Black bomber", "Navy overcoat"].map((n) => mk(n, "Outerwear"));
const wardrobe = [...tops, ...bottoms, ...shoes, ...outer];

const labelOf = (plan: Plan, item: Item) => plan.candidates.find((c) => c.item.id === item.id)!.label;

async function main() {
  // ── eligibility & readiness ──
  const dup = mk("Navy jumper copy", "Tops", { duplicateOfId: tops[0].id });
  const noPhoto = mk("No photo", "Tops", { imageUrl: null });
  const accessory = mk("Belt", "Accessories");
  const elig = eligibleItems([...wardrobe, dup, noPhoto, accessory]);
  check("flagged duplicates, photo-less items and accessories are left out", elig.length === wardrobe.length && !elig.some((i) => [dup, noPhoto, accessory].includes(i)));

  check("5 tops and 5 bottoms: ready", wardrobeReadiness(elig, tops[0]).kind === "ok");
  check("4 tops: too small", wardrobeReadiness(eligibleItems([...tops.slice(0, 4), ...bottoms, ...shoes]), tops[0]).kind === "too-small");
  check("4 bottoms: too small", wardrobeReadiness(eligibleItems([...tops, ...bottoms.slice(0, 4)]), tops[0]).kind === "too-small");
  const small = wardrobeReadiness(eligibleItems([...tops.slice(0, 4), ...bottoms]), tops[0]);
  check("too-small says how many of each there are", small.kind === "too-small" && small.tops === 4 && small.minTops === 5, JSON.stringify(small));

  // ── plans ──
  let plan = planFor(tops[0], elig)!;
  check("top hero: needs a bottom and shoes; outerwear optional", plan.required.sort().join() === "bottom,footwear" && plan.outerwearOptional);
  check("top hero: other tops are not candidates", !plan.candidates.some((c) => c.slot === "top"));
  check("labels are unique", new Set(plan.candidates.map((c) => c.label)).size === plan.candidates.length);
  plan = planFor(outer[0], elig)!;
  check("outerwear hero: needs top, bottom and shoes; outerwear not optional", plan.required.sort().join() === "bottom,footwear,top" && !plan.outerwearOptional);
  plan = planFor(shoes[0], elig)!;
  check("shoes hero: needs top and bottom; outerwear optional", plan.required.sort().join() === "bottom,top" && plan.outerwearOptional);
  plan = planFor(bottoms[0], eligibleItems([...tops, ...bottoms, ...outer]))!;
  check("no shoes owned: shoes not required", plan.required.sort().join() === "top" && plan.outerwearOptional);
  plan = planFor(tops[0], eligibleItems([...tops, ...bottoms, ...shoes]))!;
  check("no outerwear owned: outerwear not optional", !plan.outerwearOptional && !plan.candidates.some((c) => c.slot === "outerwear"));
  plan = planFor(tops[0], eligibleItems([...tops, ...bottoms]))!;
  check("only tops and bottoms owned: just a bottom required", plan.required.join() === "bottom");
  const heroDup = mk("Khaki chinos again", "Bottoms", { duplicateOfId: bottoms[1].id });
  plan = planFor(heroDup, [...elig, heroDup])!;
  check("the original of a flagged-duplicate hero is not offered as a partner", !plan.candidates.some((c) => c.item.id === bottoms[1].id));
  const many = Array.from({ length: 50 }, (_, i) => mk(`Shirt ${String(i).padStart(2, "0")}`, "Bottoms", { formality: i % 5 + 1 }));
  plan = planFor(tops[0], eligibleItems([...tops, ...many, ...shoes]))!;
  check("a huge category is capped, closest formality first", plan.candidates.filter((c) => c.slot === "bottom").length === 36 && plan.candidates.filter((c) => c.slot === "bottom").every((c) => Math.abs(c.item.formality - 2) <= 2));

  // ── checking answers ──
  plan = planFor(tops[0], elig)!;
  const L = (...items: Item[]) => items.map((i) => labelOf(plan, i));
  const good: RawOutfit[] = [
    { items: L(bottoms[0], shoes[0]), why: "Clean and easy." },
    { items: L(bottoms[1], shoes[1], outer[0]), why: "Warm earthy tones." },
    { items: L(bottoms[2], shoes[2], outer[1]), why: "Sharp and dark." },
    { items: L(bottoms[3], shoes[1]), why: "Light and relaxed." },
  ];
  let r = checkAnswer(good, plan);
  check("a good answer passes untouched", r.ok && r.outfits.length === 4 && r.problems.length === 0, JSON.stringify(r.problems));
  check("the hero is in every outfit, in display order (outerwear, top, bottom, shoes)",
    r.outfits.every((o) => o.itemIds.includes(tops[0].id)) &&
    r.outfits[1].itemIds.join() === [outer[0].id, tops[0].id, bottoms[1].id, shoes[1].id].join());

  r = checkAnswer([{ items: ["B1", "Z9"], why: "x" }, ...good.slice(0, 3)], plan);
  check("an unknown label is caught and that outfit dropped", r.problems.some((p) => p.includes("Z9")) && r.outfits.length === 3);
  r = checkAnswer([{ items: L(bottoms[0], bottoms[1], shoes[0]), why: "x" }, ...good], plan);
  check("two bottoms in one outfit is rejected", r.problems.some((p) => p.includes("same category")));
  r = checkAnswer([{ items: ["T1", ...L(bottoms[0], shoes[0])], why: "x" }, ...good], plan);
  check("a second top is rejected (the hero is the top; no top is on offer)", r.problems.some((p) => p.includes("T1")));
  r = checkAnswer([{ items: L(bottoms[0]), why: "x" }, ...good], plan);
  check("a missing required piece (shoes) is rejected", r.problems.some((p) => p.includes("missing")));
  r = checkAnswer([{ items: L(bottoms[0], shoes[0]), why: "  " }, ...good], plan);
  check("an outfit with no explanation is rejected", r.problems.some((p) => p.includes("no explanation")));

  const allOuter: RawOutfit[] = [
    { items: L(bottoms[0], shoes[0], outer[0]), why: "a" }, { items: L(bottoms[1], shoes[1], outer[1]), why: "b" },
    { items: L(bottoms[2], shoes[2], outer[2]), why: "c" }, { items: L(bottoms[3], shoes[0], outer[0]), why: "d" },
  ];
  r = checkAnswer(allOuter, plan);
  check("all four with outerwear: flagged, and the lowest-ranked is dropped so at most 3 have it",
    r.problems.some((p) => p.includes("at most 3")) && r.outfits.length === 3);
  const noOuter: RawOutfit[] = good.map((o, i) => ({ items: L(bottoms[i], shoes[i % 3]), why: o.why }));
  r = checkAnswer(noOuter, plan);
  check("none with outerwear: flagged", r.problems.some((p) => p.includes("outerwear")) && !r.ok);

  const nearCopies: RawOutfit[] = [
    { items: L(bottoms[0], shoes[0]), why: "a" },
    { items: L(bottoms[0], shoes[1]), why: "same trousers, other shoes" }, // differs in one category
    { items: L(bottoms[1], shoes[1], outer[0]), why: "c" },
    { items: L(bottoms[2], shoes[2], outer[1]), why: "d" },
  ];
  r = checkAnswer(nearCopies, plan);
  check("an outfit that differs by only one piece is dropped when there are enough distinct ones", r.outfits.length === 3 && !r.outfits.some((o) => o.why.startsWith("same trousers")));
  const justTwoDistinct: RawOutfit[] = [
    { items: L(bottoms[0], shoes[0], outer[0]), why: "a" },
    { items: L(bottoms[0], shoes[1], outer[0]), why: "b" },
    { items: L(bottoms[1], shoes[1]), why: "c" },
  ];
  r = checkAnswer(justTwoDistinct, plan);
  check("if strict variety would leave too few, a one-piece difference is allowed", r.outfits.length === 3);
  r = checkAnswer([good[0], good[0]], plan);
  check("an identical repeat is dropped", r.outfits.length === 1);

  // outerwear hero: every outfit contains it by definition; no outerwear rule
  const op = planFor(outer[0], elig)!;
  const OL = (...items: Item[]) => items.map((i) => op.candidates.find((c) => c.item.id === i.id)!.label);
  r = checkAnswer([
    { items: OL(tops[0], bottoms[0], shoes[0]), why: "a" }, { items: OL(tops[1], bottoms[1], shoes[1]), why: "b" },
    { items: OL(tops[2], bottoms[2], shoes[2]), why: "c" },
  ], op);
  check("outerwear hero: three distinct outfits pass, hero first in each", r.ok && r.outfits.every((o) => o.itemIds[0] === outer[0].id));

  check("the reason is tidied: capital letter, full stop, no dashes",
    tidyWhy("warm browns — and a clean line") === "Warm browns, and a clean line." && tidyWhy("Already fine.") === "Already fine." && tidyWhy("  ") === "");
  r = checkAnswer([{ items: L(bottoms[0], shoes[0]), why: "easy and relaxed" }], plan);
  check("checkAnswer applies the tidy-up to each reason", r.outfits[0].why === "Easy and relaxed.");

  // ── generateOutfits flow ──
  let calls = 0;
  const seenFeedback: string[][] = [];
  let g =await generateOutfits(tops[0], wardrobe, async (p, f) => { calls++; seenFeedback.push(f); return { outfits: good, usage: { input: 100, output: 20 } }; });
  check("good first answer: one call, four outfits, usage counted", g.status === "ready" && calls === 1 && g.outfits.length === 4 && g.usage.input === 100);

  calls = 0; seenFeedback.length = 0;
  g = await generateOutfits(tops[0], wardrobe, async (p, f) => {
    calls++; seenFeedback.push(f);
    return { outfits: calls === 1 ? [{ items: ["Z9"], why: "x" }, good[0]] : good, usage: { input: 100, output: 20 } };
  });
  check("a bad first answer gets one retry with the problems spelled out",
    g.status === "ready" && calls === 2 && seenFeedback[1].some((f) => f.includes("Z9")) && g.usage.input === 200 && g.outfits.length === 4);

  calls = 0;
  g = await generateOutfits(tops[0], wardrobe, async () => { calls++; return { outfits: [{ items: ["Z9"], why: "x" }] }; });
  check("two bad answers: failed, never returns invalid outfits", g.status === "failed" && calls === 2);

  calls = 0;
  g = await generateOutfits(tops[0], wardrobe, async () => { calls++; if (calls === 1) throw new Error("boom"); return { outfits: good }; });
  check("a model error on the first try is survived by the retry", g.status === "ready" && calls === 2);

  calls = 0;
  g = await generateOutfits(tops[0], wardrobe, async () => { calls++; throw new Error("down"); });
  check("model down on both tries: failed with the reason", g.status === "failed" && g.error === "down" && calls === 2);

  calls = 0;
  g = await generateOutfits(tops[0], eligibleItems([...tops.slice(0, 3), ...bottoms]).concat(), async () => { calls++; return { outfits: good }; });
  check("too-small wardrobe: explainer, and the model is never called", g.status === "too-small" && calls === 0);

  // ── staleness ──
  const e = eligibleItems(wardrobe);
  const saved = { outfits: [{ itemIds: [tops[0].id, bottoms[0].id], why: "x" }], wardrobeSize: e.length, engineVersion: OUTFIT_ENGINE_VERSION };
  check("fresh saved outfits are kept", !isStale(saved, e, tops[0].id));
  check("an older engine version triggers regeneration", isStale({ ...saved, engineVersion: "old" }, e, tops[0].id));
  check("a piece that was deleted triggers regeneration", isStale(saved, e.filter((i) => i.id !== bottoms[0].id), tops[0].id));
  check("a piece now flagged as a duplicate triggers regeneration", isStale(saved, eligibleItems(wardrobe.map((i) => (i.id === bottoms[0].id ? { ...i, duplicateOfId: "x" } : i))), tops[0].id));
  check("a small wardrobe change is tolerated", !isStale(saved, [...e, mk("New", "Tops"), mk("New2", "Tops")], tops[0].id));
  check("a big wardrobe change triggers regeneration", isStale(saved, [...e, ...Array.from({ length: 5 }, (_, i) => mk(`N${i}`, "Tops"))], tops[0].id));
  check("a hero that is itself flagged as a duplicate does not make its own outfits stale", !isStale(saved, e.filter((i) => i.id !== tops[0].id), tops[0].id));

    // ── pieces still having their photo cleaned are left out of outfits ──
  {
    const hero = tops[0];
    const cleaningBottom = { ...mk("Still cleaning jeans", "Bottoms"), cleaning: true };
    const plan = planFor(hero, [...wardrobe, cleaningBottom]);
    check("a piece whose photo is still being cleaned is not offered to the stylist", !!plan && !plan.candidates.some((c) => c.item.id === cleaningBottom.id));
    const fine = planFor(hero, wardrobe);
    check("the same wardrobe without it still plans normally", !!fine && fine.candidates.length > 0);
  }

console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
