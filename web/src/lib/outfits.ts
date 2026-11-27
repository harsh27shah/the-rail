import { CATEGORY_COVERAGE } from "./coverage";
import type { Item } from "./types";

/**
 * Recommended outfits (ROs) — whole outfits built around one item, shown on that item's page
 * (BACKLOG.md, "Planned: recommended outfits"; PROJECT.md §5 item 27). Milestone M1: the pieces
 * shown side by side, each outfit with a one-line reason. No model photo yet (M2).
 *
 * This file is the pure logic: who is eligible, what an outfit must contain, and checking the
 * AI stylist's answer against the rules. It never calls an AI or a database itself — the stylist
 * is passed in (see `ModelFn`; the real one lives in lib/stylist.ts) — so every rule can be
 * tested with a fake (scripts/test-outfits.ts). The AI proposes; this file decides what is
 * actually allowed through, because a model's output is not something to trust unchecked.
 *
 * Rules decided with the owner, 2026-11-24:
 *  - up to 4 outfits per item, best first, with some real variety between them;
 *  - every outfit contains the item it is built around;
 *  - an outfit has a top, a bottom, shoes, and sometimes outerwear. A category the person
 *    doesn't own is simply left out (tops and bottoms are always required);
 *  - for a non-outerwear item, at least 1 and at most 3 of the 4 outfits include outerwear
 *    (when the person owns any);
 *  - items flagged as duplicates are never used;
 *  - a wardrobe with fewer than 5 tops or 5 bottoms gets an explainer instead of outfits.
 */

export type Slot = "outerwear" | "top" | "bottom" | "footwear";

/** Top-to-bottom, the order an outfit is displayed in. */
export const SLOT_ORDER: Slot[] = ["outerwear", "top", "bottom", "footwear"];

const LABEL_PREFIX: Record<Slot, string> = { top: "T", bottom: "B", footwear: "F", outerwear: "O" };

export const OUTFIT_COUNT = 4;
const MIN_OUTFITS_BEFORE_RETRY = 3;
/** Most outfits that may include outerwear (when outerwear is optional for this item). */
const MAX_WITH_OUTERWEAR = 3;
/** Candidates shown to the model per category. A very large wardrobe is narrowed to the pieces
 * closest in formality to the item, so one request stays a sensible size. */
export const MAX_PER_SLOT = 36;

/** Bump when the stylist's instructions or these rules change meaningfully: outfits saved under
 * an older version are then regenerated the next time that item is opened. */
export const OUTFIT_ENGINE_VERSION = "m1-2026-11-24";

export interface Outfit {
  /** Item ids in display order (outerwear, top, bottom, shoes), the hero included. */
  itemIds: string[];
  /** One plain sentence on why it works. */
  why: string;
}

export interface Candidate {
  label: string; // "T3", "B1", "F2", "O4"
  slot: Slot;
  item: Item;
}

export interface Plan {
  hero: Item;
  heroSlot: Slot;
  /** Slots every outfit must fill besides the hero's own. */
  required: Slot[];
  /** Outerwear is allowed and expected in some (not all, not none) outfits. */
  outerwearOptional: boolean;
  candidates: Candidate[];
  count: number;
}

export interface RawOutfit {
  items: string[]; // candidate labels, hero implicit
  why: string;
}

export interface ModelAnswer {
  outfits: RawOutfit[];
  usage?: { input: number; output: number };
}

export type ModelFn = (plan: Plan, feedback: string[]) => Promise<ModelAnswer>;

export function slotOf(category: string): Slot | null {
  switch (category) {
    case "Tops": return "top";
    case "Bottoms": return "bottom";
    case "Outerwear": return "outerwear";
    case "Footwear": return "footwear";
    default: return null; // e.g. the retired "Accessories" category
  }
}

/** Items that may appear in a suggestion: not flagged as a duplicate, and with a photo to show. */
export function eligibleItems(items: Item[]): Item[] {
  return items.filter((i) => !i.duplicateOfId && i.imageUrl && slotOf(i.category));
}

export type Readiness =
  | { kind: "ok" }
  | { kind: "too-small"; tops: number; bottoms: number; minTops: number; minBottoms: number };

/** Enough tops and bottoms to make real outfits from? Reuses the coverage nudge's minimums. */
export function wardrobeReadiness(eligible: Item[], hero: Item): Readiness {
  const pool = eligible.some((i) => i.id === hero.id) ? eligible : [...eligible, hero];
  const tops = pool.filter((i) => slotOf(i.category) === "top").length;
  const bottoms = pool.filter((i) => slotOf(i.category) === "bottom").length;
  const minTops = CATEGORY_COVERAGE.Tops?.min ?? 5;
  const minBottoms = CATEGORY_COVERAGE.Bottoms?.min ?? 5;
  return tops >= minTops && bottoms >= minBottoms ? { kind: "ok" } : { kind: "too-small", tops, bottoms, minTops, minBottoms };
}

/** Builds what the stylist will be asked, for one hero. Returns null if the item can't anchor
 * outfits (no usable category). */
export function planFor(hero: Item, eligible: Item[], count = OUTFIT_COUNT): Plan | null {
  const heroSlot = slotOf(hero.category);
  if (!heroSlot) return null;

  const sameGarment = (i: Item) => i.id === hero.id || i.duplicateOfId === hero.id || hero.duplicateOfId === i.id;
  const bySlot = new Map<Slot, Item[]>();
  for (const i of eligible) {
    const s = slotOf(i.category);
    // A piece whose photo is still being cleaned shows the person's raw original, which would mislead
    // the stylist (a selfie or collage, not the garment): leave it out until its clean photo exists.
    if (!s || s === heroSlot || sameGarment(i) || i.cleaning) continue;
    bySlot.set(s, [...(bySlot.get(s) ?? []), i]);
  }

  const candidates: Candidate[] = [];
  for (const slot of SLOT_ORDER) {
    let items = bySlot.get(slot) ?? [];
    if (items.length > MAX_PER_SLOT) {
      items = [...items]
        .sort((a, b) => Math.abs((a.formality || 3) - (hero.formality || 3)) - Math.abs((b.formality || 3) - (hero.formality || 3)) || a.name.localeCompare(b.name))
        .slice(0, MAX_PER_SLOT);
    }
    items = [...items].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    items.forEach((item, idx) => candidates.push({ label: `${LABEL_PREFIX[slot]}${idx + 1}`, slot, item }));
  }

  const has = (s: Slot) => candidates.some((c) => c.slot === s);
  // Tops and bottoms are always required (readiness guarantees the wardrobe has them); shoes
  // only if the person owns any. Outerwear is a separate, optional matter.
  const required = (["top", "bottom", "footwear"] as Slot[]).filter((s) => s !== heroSlot && (s === "footwear" ? has("footwear") : true));
  return { hero, heroSlot, required, outerwearOptional: heroSlot !== "outerwear" && has("outerwear"), candidates, count };
}

// ── Checking the stylist's answer ─────────────────────────────────────────────────────────

export interface Checked {
  outfits: Outfit[];
  /** Things wrong with the answer, worded to be sent back to the stylist for a second try. */
  problems: string[];
  /** True when the answer is good enough to use as is (no problems and enough outfits). */
  ok: boolean;
}

/** House style for the one-line reason (PRD: sentence case, no dashes or other AI giveaways):
 * the model sometimes starts in lower case or uses a dash as punctuation despite being asked not to. */
export function tidyWhy(text: string): string {
  let s = text.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** In how many categories do two outfits use a different piece (or one has a piece the other
 * lacks)? The hero is in every outfit, so it never counts. */
function differingSlots(a: Outfit, b: Outfit, slotById: Map<string, Slot>, heroId: string): number {
  const pick = (o: Outfit) => {
    const m = new Map<Slot, string>();
    for (const id of o.itemIds) if (id !== heroId && slotById.has(id)) m.set(slotById.get(id)!, id);
    return m;
  };
  const A = pick(a), B = pick(b);
  return SLOT_ORDER.filter((s) => A.get(s) !== B.get(s)).length;
}

export function checkAnswer(raw: RawOutfit[], plan: Plan): Checked {
  const byLabel = new Map(plan.candidates.map((c) => [c.label.toUpperCase(), c]));
  const problems: string[] = [];
  const structural: Outfit[] = [];
  const hasOuterwear = (o: Outfit) => o.itemIds.some((id) => plan.candidates.find((c) => c.item.id === id)?.slot === "outerwear");

  (Array.isArray(raw) ? raw : []).forEach((r, idx) => {
    const n = idx + 1;
    const labels = Array.isArray(r?.items) ? r.items.map((l) => String(l).trim().toUpperCase()) : null;
    if (!labels) { problems.push(`Outfit ${n} has no list of pieces.`); return; }
    const picked: Candidate[] = [];
    for (const l of labels) {
      const c = byLabel.get(l);
      if (!c) { problems.push(`Outfit ${n} uses "${l}", which is not a label from the lists.`); return; }
      picked.push(c);
    }
    const slots = picked.map((c) => c.slot);
    if (slots.includes(plan.heroSlot)) { problems.push(`Outfit ${n} adds another ${plan.heroSlot}, but the hero already is the ${plan.heroSlot}.`); return; }
    if (new Set(slots).size !== slots.length) { problems.push(`Outfit ${n} has two pieces of the same category.`); return; }
    const missing = plan.required.filter((s) => !slots.includes(s));
    if (missing.length) { problems.push(`Outfit ${n} is missing: ${missing.join(", ")}.`); return; }
    const why = tidyWhy(typeof r.why === "string" ? r.why : "");
    if (!why) { problems.push(`Outfit ${n} has no explanation.`); return; }

    const chosen = new Map<Slot, string>(picked.map((c) => [c.slot, c.item.id]));
    chosen.set(plan.heroSlot, plan.hero.id);
    structural.push({ itemIds: SLOT_ORDER.filter((s) => chosen.has(s)).map((s) => chosen.get(s)!), why });
  });

  // Outerwear spread: at least 1 and at most 3 of the outfits (only when it applies).
  let candidatesList = structural.slice(0, plan.count);
  if (plan.outerwearOptional) {
    const withOuter = candidatesList.filter(hasOuterwear).length;
    if (candidatesList.length >= 2 && withOuter === 0) problems.push("None of the outfits include outerwear; at least one should.");
    if (withOuter > MAX_WITH_OUTERWEAR) {
      problems.push(`${withOuter} outfits include outerwear; at most ${MAX_WITH_OUTERWEAR} of ${plan.count} should.`);
      // keep the best-ranked ones: drop the lowest-ranked outfits that add outerwear until it fits
      let over = withOuter - MAX_WITH_OUTERWEAR;
      candidatesList = [...candidatesList].reverse().filter((o) => (over > 0 && hasOuterwear(o) ? (over--, false) : true)).reverse();
    }
  }

  // Variety: each outfit must differ from every outfit already kept in at least two pieces.
  // If that leaves too few, a second pass accepts a difference of one piece (best first).
  const heroId = plan.hero.id;
  const slotById = new Map(plan.candidates.map((c) => [c.item.id, c.slot] as const));
  const keepWith = (minDiff: number) => {
    const kept: Outfit[] = [];
    for (const o of candidatesList) if (kept.every((k) => differingSlots(k, o, slotById, heroId) >= minDiff)) kept.push(o);
    return kept;
  };
  let outfits = keepWith(2);
  if (outfits.length < MIN_OUTFITS_BEFORE_RETRY) {
    const relaxed = keepWith(1);
    if (relaxed.length > outfits.length) outfits = relaxed;
  }
  if (candidatesList.length > 0 && outfits.length < candidatesList.length) {
    problems.push("Some outfits were near-copies of others; make each one genuinely different.");
  }

  return { outfits: outfits.slice(0, plan.count), problems, ok: problems.length === 0 && outfits.length >= MIN_OUTFITS_BEFORE_RETRY };
}

// ── Putting it together ───────────────────────────────────────────────────────────────────

export type GenerateResult =
  | { status: "ready"; outfits: Outfit[]; usage: { input: number; output: number }; attempts: number }
  | { status: "too-small"; readiness: Extract<Readiness, { kind: "too-small" }> }
  | { status: "failed"; error: string; usage: { input: number; output: number } };

/** The whole job for one item: check the wardrobe is big enough, ask the stylist, check the
 * answer, and if it broke a rule ask once more with the problems spelled out. Takes the better
 * of the two answers. Never returns outfits that fail the checks. */
export async function generateOutfits(hero: Item, allItems: Item[], model: ModelFn): Promise<GenerateResult> {
  const eligible = eligibleItems(allItems);
  const readiness = wardrobeReadiness(eligible, hero);
  if (readiness.kind === "too-small") return { status: "too-small", readiness };

  const plan = planFor(hero, eligible);
  if (!plan) return { status: "failed", error: "that kind of piece can't anchor outfits yet", usage: { input: 0, output: 0 } };

  const usage = { input: 0, output: 0 };
  let best: Checked | null = null;
  let feedback: string[] = [];
  let attempts = 0;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    try {
      const answer = await model(plan, feedback);
      usage.input += answer.usage?.input ?? 0;
      usage.output += answer.usage?.output ?? 0;
      const checked = checkAnswer(answer.outfits, plan);
      if (!best || checked.outfits.length > best.outfits.length) best = checked;
      if (checked.ok) break;
      feedback = checked.problems.length ? checked.problems : ["Give at least three genuinely different outfits."];
    } catch (e) {
      lastError = e instanceof Error ? e.message : "the stylist didn't answer";
    }
  }
  if (!best || best.outfits.length < 2) {
    return { status: "failed", error: lastError || "couldn't put together enough good outfits", usage };
  }
  return { status: "ready", outfits: best.outfits, usage, attempts };
}

// ── Saved outfits: are they still good? ───────────────────────────────────────────────────

export interface SavedSet {
  outfits: Outfit[];
  wardrobeSize: number | null;
  engineVersion: string | null;
}

/** How much the wardrobe may grow or shrink before saved outfits are worked out again. */
const WARDROBE_DRIFT = 5;

/** Saved outfits stay until something real changes: a piece in them is gone (deleted, or now
 * flagged as a duplicate), the wardrobe has moved a lot, or the engine was improved. Opening an
 * item never costs anything while they hold. */
export function isStale(saved: SavedSet, eligible: Item[], heroId: string): boolean {
  if (saved.engineVersion !== OUTFIT_ENGINE_VERSION) return true;
  // The hero is always allowed in its own outfits, even if it is itself flagged as a duplicate
  // (and so not in `eligible`); without this its page would regenerate on every single visit.
  const ids = new Set([...eligible.map((i) => i.id), heroId]);
  if (saved.outfits.some((o) => o.itemIds.some((id) => !ids.has(id)))) return true;
  if (saved.wardrobeSize == null || Math.abs(eligible.length - saved.wardrobeSize) >= WARDROBE_DRIFT) return true;
  return false;
}
