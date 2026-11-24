// The "hide one" test for pairing suggestions (PROJECT.md / the Outfit Matching Research doc's
// "fill in the blank" test), run on the owner's own real outfits.
//
// How it works. Items cut from the same photo were worn together (their original photos are
// byte-identical, so grouping is exact). For every real pair (A, P) in such an outfit we ask
// the engine: "here is A, and a target category — rank the wardrobe's items in that category".
// P is the hidden right answer. Did the engine put it at the top?
//
// Fairness rules, so the number means something:
//  * Ties are scored by expected position under random tie-breaking, not list order — an engine
//    that gives everything the same score gets credit for chance, no more and no less.
//  * Flagged duplicates of A or P are removed from the candidates (the same real garment
//    shouldn't count as a wrong answer).
//  * Outfits with two items in the same category are skipped (ambiguous: layered look?).
//  * Only "was it worn together" is known — a different good partner counts as a miss, so
//    scores are a floor on quality, not a verdict. Compare engines to each other, not to 100%.
//
// To test a new engine, add it to ENGINES below: a function (a, b) => score, higher = better.
//
// Run from web/:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-pairings.ts

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getItems } from "@/lib/items";
import { makePairScorer, pairScore } from "@/lib/pairings";
import { colourProfile } from "@/lib/colour";
import type { Item } from "@/lib/types";

type Scorer = (a: Item, b: Item) => number;

const ENGINES: Record<string, Scorer> = {
  "today's rules": pairScore,
  "+ textured fix": makePairScorer({ texturedIsPlain: true }),
  "+ textured fix + colour": makePairScorer({ texturedIsPlain: true, colour: true }),
};
const BASELINE = "today's rules";

interface Question {
  a: Item;
  answer: Item;
  candidates: Item[]; // everything in the answer's category except A and duplicates
}

async function loadQuestions(ownerId: string): Promise<{ questions: Question[]; outfits: number; skipped: number }> {
  const admin = getSupabaseAdmin()!;
  const items = await getItems(ownerId);
  const byId = new Map(items.map((i) => [i.id, i]));

  const { data } = await admin.from("items").select("id,original_image_path").eq("user_id", ownerId);
  const pathOf = new Map((data ?? []).map((r) => [r.id as string, r.original_image_path as string]));

  const hashes = new Map<string, string>();
  const queue = items.filter((i) => pathOf.get(i.id));
  async function worker() {
    for (let it = queue.shift(); it; it = queue.shift()) {
      const dl = await admin.storage.from("wardrobe-images").download(pathOf.get(it.id)!);
      if (dl.error) continue;
      hashes.set(it.id, createHash("sha256").update(Buffer.from(await dl.data!.arrayBuffer())).digest("hex"));
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const h = hashes.get(it.id);
    if (h) groups.set(h, [...(groups.get(h) ?? []), it]);
  }

  // duplicate links, both directions, so "same real garment" is symmetric
  const dupes = new Map<string, Set<string>>();
  const link = (x: string, y: string) => dupes.set(x, (dupes.get(x) ?? new Set()).add(y));
  for (const it of items) if (it.duplicateOfId && byId.has(it.duplicateOfId)) { link(it.id, it.duplicateOfId); link(it.duplicateOfId, it.id); }

  const questions: Question[] = [];
  let outfits = 0, skipped = 0;
  for (const g of groups.values()) {
    const cats = g.map((i) => i.category);
    if (g.length < 2 || new Set(cats).size < 2) continue;
    if (new Set(cats).size < cats.length) { skipped++; continue; }
    outfits++;
    for (const a of g) for (const answer of g) {
      if (a.id === answer.id || a.category === answer.category) continue;
      const banned = new Set([a.id, ...(dupes.get(a.id) ?? []), ...(dupes.get(answer.id) ?? [])]);
      banned.delete(answer.id);
      const candidates = items.filter((c) => c.category === answer.category && !banned.has(c.id));
      questions.push({ a, answer, candidates });
    }
  }
  return { questions, outfits, skipped };
}

/** Where the right answer lands, with ties broken at random: how many candidates beat it,
 * how many tie with it, and so the chance it ends up in the top k. */
function standing(score: Scorer, q: Question) {
  const s = score(q.a, q.answer);
  let better = 0, tied = 0;
  for (const c of q.candidates) {
    if (c.id === q.answer.id) continue;
    const cs = score(q.a, c);
    if (cs > s) better++;
    else if (cs === s) tied++;
  }
  const n = q.candidates.length; // includes the answer
  const topK = (k: number) => Math.max(0, Math.min(1, (k - better) / (tied + 1)));
  return { n, better, tied, expectedRank: better + 1 + tied / 2, hit1: topK(1), hit3: topK(3), rr: 1 / (better + 1 + tied / 2) };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(4);

async function main() {
  const admin = getSupabaseAdmin()!;
  const email = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const owner = email ? data.users.find((u) => u.email === email) : data.users[0];
  if (!owner) throw new Error("no such user");

  const { questions, outfits, skipped } = await loadQuestions(owner.id);
  console.log(`Real outfits used: ${outfits} (skipped ${skipped} with two items of one category)`);
  console.log(`Hide-one questions: ${questions.length} (each real pair asked both ways)\n`);

  // Chance baseline: picking at random among the candidates.
  const chance1 = questions.reduce((s, q) => s + 1 / q.candidates.length, 0) / questions.length;
  const chance3 = questions.reduce((s, q) => s + Math.min(3, q.candidates.length) / q.candidates.length, 0) / questions.length;

  const baseRows = questions.map((q) => standing(ENGINES[BASELINE], q));

  for (const [name, scorer] of Object.entries(ENGINES)) {
    const rows = questions.map((q) => ({ q, r: standing(scorer, q) }));
    const avg = (f: (x: (typeof rows)[number]) => number, set = rows) => set.reduce((s, x) => s + f(x), 0) / set.length;
    console.log(`── ${name} ──`);
    console.log(`            right answer first   in top 3   avg position (of candidates)`);
    console.log(`  engine       ${pct(avg((x) => x.r.hit1))}              ${pct(avg((x) => x.r.hit3))}       ${avg((x) => x.r.expectedRank).toFixed(1)} of ${avg((x) => x.r.n).toFixed(1)}`);
    console.log(`  pure chance  ${pct(chance1)}              ${pct(chance3)}`);
    console.log(`  tied with at least one wrong answer: ${pct(rows.filter((x) => x.r.tied > 0).length / rows.length)} of questions`);
    if (name !== BASELINE) {
      // Head-to-head with today's rules, question by question — more robust on 40 questions
      // than comparing averages: did the right answer move up, or down?
      let up = 0, down = 0;
      rows.forEach((x, i) => {
        if (x.r.expectedRank < baseRows[i].expectedRank - 1e-9) up++;
        else if (x.r.expectedRank > baseRows[i].expectedRank + 1e-9) down++;
      });
      console.log(`  vs today's rules: right answer moved UP in ${up} questions, DOWN in ${down}, unchanged in ${rows.length - up - down}`);
    }
    console.log();

    const types = new Map<string, typeof rows>();
    for (const x of rows) {
      const key = `${x.q.a.category} → ${x.q.answer.category}`;
      types.set(key, [...(types.get(key) ?? []), x]);
    }
    console.log("  by question type (given → hidden):");
    for (const [key, set] of [...types.entries()].sort()) {
      const ch3 = set.reduce((s, x) => s + Math.min(3, x.q.candidates.length) / x.q.candidates.length, 0) / set.length;
      console.log(`    ${key.padEnd(24)} n=${String(set.length).padStart(2)}  first ${pct(avg((x) => x.r.hit1, set))}  top3 ${pct(avg((x) => x.r.hit3, set))}  (chance top3 ${pct(ch3)})`);
    }
    console.log();
  }

  if (process.argv.includes("--colours")) {
    // Sanity check of the neutral / colourful sorting against the item names — not a score.
    const items = await getItems(owner.id);
    console.log("Colour sorting, item by item:");
    for (const it of items) {
      const p = colourProfile(it.palette);
      console.log(`  ${(p ? (p.neutral ? "neutral  " : "COLOURFUL") : "no colour")}  ${it.name}  [${it.color}]  ${p ? `h${p.hsl.h.toFixed(0)} s${p.hsl.s.toFixed(2)} l${p.hsl.l.toFixed(2)}` : ""}`);
    }
    console.log();
  }

  if (process.argv.includes("--examples")) {
    for (const q of questions.slice(0, 12)) {
      const r = standing(ENGINES["today's rules"], q);
      console.log(`${q.a.name} → hidden: ${q.answer.name}  | position ${r.expectedRank.toFixed(1)} of ${r.n} (${r.tied} tied)`);
    }
  }
}
main();
