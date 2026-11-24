// How much do people agree about the 24 pairs, and how well do the engines match the crowd?
// Reads eval-data/pairing-ratings.json (the owner), eval-data/second-opinions.json (others),
// eval-data/stylist-runs.json (cached AI stylist scores). Free to run; no AI calls.
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-consensus.ts

import fs from "node:fs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getItems } from "@/lib/items";
import { makePairScorer, pairScore } from "@/lib/pairings";

type L = "Y" | "M" | "N";
const val = (l: L) => (l === "Y" ? 1 : l === "M" ? 0.5 : 0);

function ranks(xs: number[]): number[] {
  const idx = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length).fill(0);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b);
  const n = a.length, ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

async function main() {
  const owner = JSON.parse(fs.readFileSync("eval-data/pairing-ratings.json", "utf8")) as {
    pairs: { topId: string; bottomId: string; top: string; bottom: string; rating: L }[];
  };
  const others = (JSON.parse(fs.readFileSync("eval-data/second-opinions.json", "utf8")) as { raters: Record<string, L[]> }).raters;
  const pairs = owner.pairs;
  const raters: Record<string, L[]> = { ...others, You: pairs.map((p) => p.rating) };
  const names = Object.keys(raters);
  const n = pairs.length;

  // 1. Do people agree with each other?
  console.log(`Raters: ${names.join(", ")} (${n} pairs each)\n`);
  console.log("Agreement between each two raters (same answer / one said Y and the other N):");
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = raters[names[i]], b = raters[names[j]];
    const same = a.filter((x, k) => x === b[k]).length;
    const opp = a.filter((x, k) => (x === "Y" && b[k] === "N") || (x === "N" && b[k] === "Y")).length;
    console.log(`  ${names[i]} & ${names[j]}: same ${String(same).padStart(2)}/${n}, flat opposites ${opp}`);
  }
  console.log("\nHow often each rater says N:", names.map((k) => `${k} ${raters[k].filter((x) => x === "N").length}`).join("   "));

  // 2. Per-pair consensus
  const mean = (k: number, who = names) => who.reduce((s, r) => s + val(raters[r][k]), 0) / who.length;
  const crowd = (k: number) => mean(k, Object.keys(others)); // the four others, without you
  const allMean = (k: number) => mean(k);

  const { data: users } = await getSupabaseAdmin()!.auth.admin.listUsers({ perPage: 50 });
  const items = await getItems(users.users[0].id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const runs = JSON.parse(fs.readFileSync("eval-data/stylist-runs.json", "utf8")) as Record<string, { score: number }>[];
  const run = runs[runs.length - 1];
  const keyOf = (p: (typeof pairs)[number]) => `${p.topId}|${p.bottomId}`;
  const colour = makePairScorer({ texturedIsPlain: true, colour: true });

  const rows = pairs.map((p, k) => ({
    n: k + 1, p, crowd: crowd(k), all: allMean(k),
    ai: run[keyOf(p)]?.score ?? NaN,
    rules: pairScore(byId.get(p.topId)!, byId.get(p.bottomId)!),
    colourRules: colour(byId.get(p.topId)!, byId.get(p.bottomId)!),
  }));

  const unanimous = rows.filter((r) => new Set(names.map((x) => raters[x][r.n - 1])).size === 1).length;
  const strong = rows.filter((r) => r.crowd >= 0.875).length, weak = rows.filter((r) => r.crowd <= 0.375).length;
  console.log(`\nAll five raters gave the identical answer on ${unanimous}/${n} pairs.`);
  console.log(`The four others: clearly good (avg ≥ 0.875) on ${strong}, clearly bad (avg ≤ 0.375) on ${weak}, the rest are mixed.\n`);

  console.log("Pair by pair — others' average (Y=1, M=.5, N=0), each rater's answer, then AI / rules scores:");
  console.log("      avg   A B C D You   AI  rules  +colour");
  for (const r of [...rows].sort((a, b) => b.crowd - a.crowd)) {
    const cells = names.map((x) => raters[x][r.n - 1]).join(" ");
    console.log(`  ${String(r.n).padStart(2)}  ${r.crowd.toFixed(2)}  ${cells}   ${String(r.ai).padStart(2)}   ${String(r.rules).padStart(2)}     ${String(r.colourRules).padStart(2)}   ${r.p.top} + ${r.p.bottom}`);
  }

  // 3. How well do the engines track the crowd?
  const sp = (xs: number[], ys: number[]) => spearman(xs, ys).toFixed(2);
  const crowdV = rows.map((r) => r.crowd), allV = rows.map((r) => r.all);
  console.log("\nHow closely each engine ranks pairs like the crowd (0 = unrelated, 1 = identical order):");
  console.log(`                   vs the 4 others   vs all 5`);
  console.log(`  AI stylist          ${sp(rows.map((r) => r.ai), crowdV).padStart(5)}            ${sp(rows.map((r) => r.ai), allV).padStart(5)}`);
  console.log(`  today's rules       ${sp(rows.map((r) => r.rules), crowdV).padStart(5)}            ${sp(rows.map((r) => r.rules), allV).padStart(5)}`);
  console.log(`  rules + colour      ${sp(rows.map((r) => r.colourRules), crowdV).padStart(5)}            ${sp(rows.map((r) => r.colourRules), allV).padStart(5)}`);
  // Yardstick: how closely does ONE person track the other four? (the ceiling a good engine can expect)
  const loo = names.map((x) => {
    const rest = names.filter((y) => y !== x && y !== "You");
    return spearman(raters[x].map(val), rows.map((_, k) => mean(k, rest)));
  });
  console.log(`\nFor comparison, how closely each single rater tracks the others (the realistic ceiling):`);
  console.log("  " + names.map((x, i) => `${x} ${loo[i].toFixed(2)}`).join("   "));
}
main();
