// Scores the owner's rated top+bottom pairs with the AI stylist and compares with their ratings.
// Ratings live in eval-data/pairing-ratings.json (Y = would wear, M = maybe, N = wouldn't).
// Stylist answers are cached in eval-data/stylist-runs.json, so re-analysing costs nothing;
// pass --fresh to call the model again (appends a new run).
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-stylist.ts [--fresh]

import fs from "node:fs";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getItems } from "@/lib/items";
import { pairScore } from "@/lib/pairings";
import { rateTopAndBottom, type StylistPiece } from "@/lib/stylist";
import type { Item } from "@/lib/types";

const RATINGS_FILE = "eval-data/pairing-ratings.json";
const RUNS_FILE = "eval-data/stylist-runs.json";

interface RatedPair { topId: string; bottomId: string; top: string; bottom: string; rating: "Y" | "M" | "N"; wasRealOutfit: boolean }
type Run = Record<string, { score: number; why: string }>; // key = topId|bottomId

async function piece(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, item: Item, imagePath: string): Promise<StylistPiece> {
  const dl = await admin.storage.from("wardrobe-images").download(imagePath);
  if (dl.error) throw new Error(`couldn't download ${item.name}: ${dl.error.message}`);
  // Smaller photos cost less and are plenty for judging colour and shape.
  const jpeg = await sharp(Buffer.from(await dl.data!.arrayBuffer())).resize(640, 640, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  return {
    name: item.name, color: item.color, material: item.material, pattern: item.pattern, formality: item.formality,
    photo: { base64: jpeg.toString("base64"), mediaType: "image/jpeg" },
  };
}

function agreement(pairs: RatedPair[], score: (p: RatedPair) => number) {
  const Y = pairs.filter((p) => p.rating === "Y"), N = pairs.filter((p) => p.rating === "N");
  let win = 0, tie = 0;
  for (const y of Y) for (const n of N) {
    const a = score(y), b = score(n);
    if (a > b) win++; else if (a === b) tie++;
  }
  const total = Y.length * N.length;
  return { pct: (win + tie / 2) / total, tie, total };
}

async function main() {
  const pairs = (JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8")) as { pairs: RatedPair[] }).pairs;
  const runs: Run[] = fs.existsSync(RUNS_FILE) ? JSON.parse(fs.readFileSync(RUNS_FILE, "utf8")) : [];
  const key = (p: RatedPair) => `${p.topId}|${p.bottomId}`;

  if (runs.length === 0 || process.argv.includes("--fresh")) {
    const admin = getSupabaseAdmin()!;
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 50 });
    const ownerId = users.users[0].id;
    const items = await getItems(ownerId);
    const byId = new Map(items.map((i) => [i.id, i]));
    const { data: rows } = await admin.from("items").select("id,image_path").eq("user_id", ownerId);
    const pathOf = new Map((rows ?? []).map((r) => [r.id as string, r.image_path as string]));

    const run: Run = {};
    let inTok = 0, outTok = 0;
    const queue = [...pairs];
    await Promise.all([0, 1, 2, 3].map(async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const t = byId.get(p.topId)!, b = byId.get(p.bottomId)!;
        try {
          const v = await rateTopAndBottom(await piece(admin, t, pathOf.get(t.id)!), await piece(admin, b, pathOf.get(b.id)!));
          run[key(p)] = { score: v.score, why: v.why };
          inTok += v.usage.input; outTok += v.usage.output;
        } catch (e) {
          console.error("failed:", p.top, "+", p.bottom, e instanceof Error ? e.message : e);
        }
      }
    }));
    runs.push(run);
    fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 1));
    // Price is an assumption (list-style rates of $3 / $15 per million tokens), not a quote.
    console.log(`run saved. tokens in ${inTok}, out ${outTok}; approx cost $${((inTok * 3 + outTok * 15) / 1e6).toFixed(2)} (assumed rates)\n`);
  }

  const run = runs[runs.length - 1];
  // --no-jerseys: leave out football-shirt pairs. The owner wears them but, asked, agrees the
  // product should NOT call them good smart-casual pairings — what he wears isn't always what
  // he'd want recommended, so those labels aren't a fair test of the engine.
  const skipJerseys = process.argv.includes("--no-jerseys");
  const scored = pairs.filter((p) => run[key(p)] && !(skipJerseys && /jersey|kaisertrikot|\bkit\b/i.test(p.top)));
  console.log(`pairs scored: ${scored.length}/${pairs.length}`);

  const items = await getItems((await getSupabaseAdmin()!.auth.admin.listUsers({ perPage: 50 })).data.users[0].id);
  const byId = new Map(items.map((i) => [i.id, i]));

  const ai = agreement(scored, (p) => run[key(p)].score);
  const rules = agreement(scored, (p) => pairScore(byId.get(p.topId)!, byId.get(p.bottomId)!));
  console.log(`\nAgreement with your ratings (50% = coin flip, 100% = perfect):`);
  console.log(`  AI stylist       ${(ai.pct * 100).toFixed(0)}%  (ties ${ai.tie}/${ai.total})`);
  console.log(`  today's rules    ${(rules.pct * 100).toFixed(0)}%  (ties ${rules.tie}/${rules.total})`);

  const mean = (k: string) => { const s = scored.filter((p) => p.rating === k).map((p) => run[key(p)].score); return s.length ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : "-"; };
  console.log(`\nAverage AI score by your rating:  Y ${mean("Y")}   M ${mean("M")}   N ${mean("N")}`);

  console.log("\npair by pair (your rating, AI score, AI's reason):");
  for (const p of [...scored].sort((a, b) => "YMN".indexOf(a.rating) - "YMN".indexOf(b.rating) || run[key(b)].score - run[key(a)].score)) {
    const r = run[key(p)];
    console.log(`  ${p.rating} ${p.wasRealOutfit ? "(worn)" : "      "} AI ${String(r.score).padStart(2)}  ${p.top} + ${p.bottom}\n        ${r.why}`);
  }
}
main();
