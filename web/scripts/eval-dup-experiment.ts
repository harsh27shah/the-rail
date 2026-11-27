// The duplicate-detection experiment (BACKLOG.md, "Duplicate checking": better recall AND lower cost).
//
// The owner's wardrobe has no real duplicates left to measure on (they were cleaned out by hand), so this builds
// test cases: for ~12 pieces, a NEW photo of the same garment, made by cropping, tilting and re-lighting the
// piece's own original photo, then sent through the app's real pipeline (read the photo, make the clean product
// shot). The new piece's name, colour and cleaned image therefore differ from the first one's, like a real
// second photo of the same garment would. Then, for each strategy, two scenarios per case:
//   POSITIVE: the new piece arrives and its first twin is in the wardrobe  -> did the strategy flag the twin?
//   NEGATIVE: the same new piece arrives but the twin is removed          -> did it wrongly flag a lookalike?
//
// Strategies (all use claude-sonnet-5, the model the app uses; a flag needs verdict "same" at confidence >= 0.6):
//   S0 today:        word-overlap filter, first 5 in database order, 4 full-size images per comparison
//   S1 ranked/full:  rank candidates by tag similarity, top 3, 4 full-size images
//   S2 ranked/small: rank, top 3, same 4 images shrunk to 640px
//   S3 ranked/iso:   rank, top 3, only the 2 cleaned product shots at 512px
//   S4 sheet:        ONE call: the new piece + a contact sheet of every same-category piece
//
// Results and every AI answer are cached in eval-data/duplicates/, so a re-run costs nothing for work already
// done. A spend counter stops the run at BUDGET_USD.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-dup-experiment.ts [phaseA|analyse|run]

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { tagPhoto, type TaggedFields } from "@/lib/anthropic";
import { extractGarmentImage } from "@/lib/gemini";
import { shrinkForAi } from "@/lib/ingest";
import { asCategory } from "@/lib/tag-fields";

const DIR = path.resolve(import.meta.dirname, "..", "eval-data", "duplicates");
fs.mkdirSync(DIR, { recursive: true });
const BUDGET_USD = 5.5;
const THRESHOLD = 0.6; // the app's own cut-off (DUPLICATE_CONFIDENCE_THRESHOLD)
const N_CASES = 12;
const admin = getSupabaseAdmin()!;
const anthropic = new Anthropic();
const BG = { r: 247, g: 246, b: 242 };

// ── spend ─────────────────────────────────────────────────────────────────────────────────────────────────
const SPEND_FILE = path.join(DIR, "spend.json");
const spend: { claude: number; gemini: number; calls: number } = fs.existsSync(SPEND_FILE) ? JSON.parse(fs.readFileSync(SPEND_FILE, "utf8")) : { claude: 0, gemini: 0, calls: 0 };
const total = () => spend.claude + spend.gemini;
function charge(kind: "claude" | "gemini", usd: number) {
  spend[kind] += usd; spend.calls++;
  fs.writeFileSync(SPEND_FILE, JSON.stringify(spend));
  if (total() > BUDGET_USD) throw new Error(`BUDGET: spent $${total().toFixed(2)} (cap $${BUDGET_USD})`);
}
const claudeUsd = (u: { input_tokens: number; output_tokens: number }) => (u.input_tokens * 3 + u.output_tokens * 15) / 1e6;

// ── data ──────────────────────────────────────────────────────────────────────────────────────────────────
interface Row { id: string; name: string; category: string; color: string; palette: string[]; pattern: string; material: string; formality: number; added: string; image_path: string; original_image_path: string }
async function loadWardrobe(): Promise<Row[]> {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const owner = users!.users.find((u) => u.app_metadata?.role === "owner")!;
  // No ORDER BY, exactly like the app's own candidate query, so "database order" is the real one.
  const { data, error } = await admin.from("items").select("id,name,category,color,palette,pattern,material,formality,added,image_path,original_image_path").eq("user_id", owner.id).not("image_path", "is", null);
  if (error) throw new Error(error.message);
  return data as Row[];
}

const blobCache = new Map<string, Buffer>();
async function blob(storagePath: string): Promise<Buffer> {
  if (blobCache.has(storagePath)) return blobCache.get(storagePath)!;
  const dl = await admin.storage.from("wardrobe-images").download(storagePath);
  if (dl.error) throw new Error(`download ${storagePath}: ${dl.error.message}`);
  const b = Buffer.from(await dl.data!.arrayBuffer());
  blobCache.set(storagePath, b);
  return b;
}

// ── test cases ────────────────────────────────────────────────────────────────────────────────────────────
interface Case {
  i: number; srcId: string; srcName: string; category: string;
  tags: TaggedFields; aug: string; ext: string; // file names in DIR
}
const CASES_FILE = path.join(DIR, "cases.json");
const loadCases = (): Case[] => (fs.existsSync(CASES_FILE) ? JSON.parse(fs.readFileSync(CASES_FILE, "utf8")) : []);

let seed = 20261127; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const STOP = new Set(["a", "an", "the", "and", "with", "for", "in", "on", "of", "to"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const overlaps = (a: Set<string>, b: Set<string>) => { for (const w of a) if (b.has(w)) return true; return false; };

/** A believable "second photo of the same garment": different crop, a few degrees of tilt, different light. */
async function augment(original: Buffer, category: string): Promise<Buffer> {
  const base = await sharp(original).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const w = base.info.width, h = base.info.height;
  const f = 0.84 + rnd() * 0.1;
  const cw = Math.round(w * f), ch = Math.round(h * f);
  const left = Math.round(((w - cw) / 2) * (0.4 + rnd() * 1.2));
  const top = category === "Footwear" ? h - ch : Math.round(((h - ch) / 2) * (0.4 + rnd() * 1.2)); // shoes live at the bottom of a mirror selfie
  const angle = (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 4);
  const cropped = await sharp(base.data).extract({ left: Math.min(left, w - cw), top: Math.min(top, h - ch), width: cw, height: ch }).toBuffer();
  const rotated = await sharp(cropped).rotate(angle, { background: { r: 120, g: 120, b: 120 } }).toBuffer({ resolveWithObject: true });
  const trim = 0.06; // cut the grey corners the tilt leaves
  const rw = rotated.info.width, rh = rotated.info.height;
  return sharp(rotated.data)
    .extract({ left: Math.round(rw * trim), top: Math.round(rh * trim), width: Math.round(rw * (1 - 2 * trim)), height: Math.round(rh * (1 - 2 * trim)) })
    .modulate({ brightness: 0.88 + rnd() * 0.24, saturation: 0.88 + rnd() * 0.24, hue: Math.round((rnd() - 0.5) * 16) })
    .jpeg({ quality: 80 }).toBuffer();
}

async function phaseA() {
  const existing = loadCases();
  if (existing.length >= N_CASES) { console.log(`phase A already done (${existing.length} cases)`); return; }
  const rows = await loadWardrobe();
  // Spread across categories: this many of each, picking evenly through each category's pieces.
  const want: Record<string, number> = { Tops: 5, Bottoms: 3, Outerwear: 2, Footwear: 2 };
  const sources: Row[] = [];
  for (const [cat, n] of Object.entries(want)) {
    const inCat = rows.filter((r) => r.category === cat && r.original_image_path);
    const step = Math.max(1, Math.floor(inCat.length / (n + 2))); // a few spare in case some fail
    for (let k = 0, taken = 0; k < inCat.length && taken < n + 2; k += step, taken++) sources.push(inCat[k]);
  }
  const cases = [...existing];
  const done = new Set(existing.map((c) => c.srcId));
  const need: Record<string, number> = { ...want };
  for (const c of existing) need[c.category]--;
  for (const src of sources) {
    if (done.has(src.id) || (need[src.category] ?? 0) <= 0) continue;
    try {
      const aug = await augment(await blob(src.original_image_path), src.category);
      const b64 = aug.toString("base64");
      const tagged = await (async () => { const r = await tagPhoto(b64, "image/jpeg", "single-person"); return r; })();
      charge("claude", 0.02); // tagPhoto doesn't expose usage; ~2 cents measured earlier
      const srcWords = words(`${src.name} ${src.color}`);
      const same = tagged.garments.filter((g) => asCategory(g.category) === src.category);
      const pick = same.sort((a, b) => [...words(`${b.name} ${b.color}`)].filter((w) => srcWords.has(w)).length - [...words(`${a.name} ${a.color}`)].filter((w) => srcWords.has(w)).length)[0];
      if (!pick) { console.log(`  skip "${src.name}": the re-photo gave no ${src.category}`); continue; }
      const ext = await extractGarmentImage(b64, "image/jpeg", [pick.color, pick.name].filter(Boolean).join(" ") || "garment");
      charge("gemini", 0.04);
      if (!ext) { console.log(`  skip "${src.name}": cleaning failed`); continue; }
      const i = cases.length + 1;
      fs.writeFileSync(path.join(DIR, `case-${i}-aug.jpg`), aug);
      fs.writeFileSync(path.join(DIR, `case-${i}-ext.${ext.mimeType.includes("png") ? "png" : "jpg"}`), Buffer.from(ext.data, "base64"));
      cases.push({ i, srcId: src.id, srcName: src.name, category: src.category, tags: pick, aug: `case-${i}-aug.jpg`, ext: `case-${i}-ext.${ext.mimeType.includes("png") ? "png" : "jpg"}` });
      need[src.category]--;
      fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 1));
      console.log(`  case ${i}: "${src.name}" -> new piece "${pick.name}" (${pick.color})   spent $${total().toFixed(2)}`);
    } catch (e) { if (String(e).includes("BUDGET")) throw e; console.log(`  skip "${src.name}": ${e instanceof Error ? e.message : e}`); }
  }
  console.log(`phase A: ${cases.length} cases, spent $${total().toFixed(2)}`);
}

// ── ranking (the free part of the idea) ───────────────────────────────────────────────────────────────────
const hexDist = (a?: string, b?: string) => {
  const rgb = (h: string) => { const s = h.replace("#", ""); const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
  try { const x = rgb(a!), y = rgb(b!); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); } catch { return 200; }
};
const jaccard = (a: Set<string>, b: Set<string>) => { const i = [...a].filter((w) => b.has(w)).length; return i / Math.max(1, a.size + b.size - i); };
function similarity(n: TaggedFields, c: Row): number {
  const color = Math.max(0, 1 - hexDist(n.palette?.[0], c.palette?.[0]) / 150);
  const name = jaccard(words(`${n.name} ${n.color}`), words(`${c.name} ${c.color}`));
  return 2 * color + 1.5 * name + (n.pattern === c.pattern ? 0.3 : 0) + (n.material && n.material === c.material ? 0.2 : 0) + (Math.abs((n.formality || 3) - (c.formality || 3)) <= 1 ? 0.1 : 0);
}
/** Today's candidate list: same category, shares a colour or name word, extraction finished, first 5 in database order. */
function candidatesToday(n: TaggedFields, w: Row[]): Row[] {
  const cw = words(n.color), nw = words(n.name);
  return w.filter((r) => r.category === asCategory(n.category) && r.image_path !== r.original_image_path && (overlaps(cw, words(r.color)) || overlaps(nw, words(r.name)))).slice(0, 5);
}
const rankedAll = (n: TaggedFields, w: Row[]) => w.filter((r) => r.category === asCategory(n.category)).map((r) => ({ r, s: similarity(n, r) })).sort((a, b) => b.s - a.s).map((x) => x.r);

async function phaseAnalyse() {
  const cases = loadCases(); const w = await loadWardrobe();
  console.log("\nWhere the true twin lands in each candidate list (free, no AI):\n");
  console.log("case  piece                              pool  today(5)        ranked position");
  const hits = { today: 0, k1: 0, k2: 0, k3: 0, k5: 0 };
  for (const c of cases) {
    const pool = w.filter((r) => r.category === c.category).length;
    const t = candidatesToday(c.tags, w); const ti = t.findIndex((r) => r.id === c.srcId);
    const rk = rankedAll(c.tags, w); const ri = rk.findIndex((r) => r.id === c.srcId);
    if (ti >= 0) hits.today++; if (ri === 0) hits.k1++; if (ri >= 0 && ri < 2) hits.k2++; if (ri >= 0 && ri < 3) hits.k3++; if (ri >= 0 && ri < 5) hits.k5++;
    const allOverlap = w.filter((r) => r.category === c.category && (overlaps(words(c.tags.color), words(r.color)) || overlaps(words(c.tags.name), words(r.name)))).length;
    console.log(`${String(c.i).padStart(2)}    ${c.srcName.slice(0, 33).padEnd(33)}  ${String(pool).padStart(3)}   ${(ti >= 0 ? `in list (#${ti + 1}/${allOverlap} overlap)` : `MISSED (${allOverlap} overlap)`).padEnd(24)} #${ri + 1}`);
  }
  const n = cases.length;
  console.log(`\nTwin is among the candidates compared:  today ${hits.today}/${n}   | ranked top-1 ${hits.k1}/${n}   top-2 ${hits.k2}/${n}   top-3 ${hits.k3}/${n}   top-5 ${hits.k5}/${n}`);
}

// ── comparisons ───────────────────────────────────────────────────────────────────────────────────────────
const VERDICTS_FILE = path.join(DIR, "verdicts.json");
const verdicts: Record<string, { verdict: string; confidence: number; why: string; usd: number }> = fs.existsSync(VERDICTS_FILE) ? JSON.parse(fs.readFileSync(VERDICTS_FILE, "utf8")) : {};
const saveVerdicts = () => fs.writeFileSync(VERDICTS_FILE, JSON.stringify(verdicts));

// Verbatim from lib/anthropic.ts (COMPARE_PROMPT), so strategy S0 is what the app does today.
const COMPARE_PROMPT =
  `You're deciding whether ITEM A and ITEM B are the same individual physical garment or ` +
  `two different garments. For each item you're shown two photos: its ORIGINAL upload (may ` +
  `show a person wearing several garments at once — focus only on the specific item this ` +
  `side is about) and an ISOLATED photo (an AI-cleaned single-garment product shot, which ` +
  `can have its own rendering quirks — slightly different crop, pose, or exact shade each ` +
  `time it's generated, even for the same real garment). Use both together: the original ` +
  `tells you the true context and exact appearance; the isolated shot removes background ` +
  `clutter. If they seem to disagree, trust the original for ground truth.\n\n` +
  `Weigh: cut, silhouette, sleeve length, neckline, closures, pockets, seams, print/pattern ` +
  `placement, distinctive wear or markings. Ignore differences that are just photography ` +
  `(background, lighting, crop) or just generation variance in the isolated shots.\n\n` +
  `Return ONLY JSON: {"verdict":"same"|"different","confidence":0-1,"why":"one sentence"}`;
const ISO_PROMPT =
  `You're deciding whether ITEM A and ITEM B are the same individual physical garment or two different garments. ` +
  `Each is an AI-cleaned catalogue shot made from a phone photo, so it can differ slightly in crop, pose or exact shade even for the same real garment. ` +
  `Weigh: cut, silhouette, sleeve length, neckline, closures, pockets, seams, print/pattern placement, distinctive details. ` +
  `Ignore differences that are just photography or generation variance. Garments that merely look alike (same colour and style but a different cut or details) are DIFFERENT.\n\n` +
  `Return ONLY JSON: {"verdict":"same"|"different","confidence":0-1,"why":"one sentence"}`;

type Variant = "full4" | "small4" | "iso2";
const img = (b: Buffer, mt = "image/jpeg") => ({ type: "image" as const, source: { type: "base64" as const, media_type: mt as "image/jpeg", data: b.toString("base64") } });
const small = (b: Buffer, side: number, q = 80) => sharp(b).rotate().resize({ width: side, height: side, fit: "inside", withoutEnlargement: true }).jpeg({ quality: q }).toBuffer();
const full = async (b: Buffer) => { const s = await shrinkForAi({ base64: b.toString("base64"), mimeType: "image/jpeg" }); return Buffer.from(s.base64, "base64"); };

function parseJson(text: string): Record<string, unknown> {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON in the answer");
  return JSON.parse(text.slice(s, e + 1));
}
const textOf = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");

async function newPiece(c: Case) {
  return { orig: fs.readFileSync(path.join(DIR, c.aug)), ext: fs.readFileSync(path.join(DIR, c.ext)) };
}

async function compare(variant: Variant, c: Case, cand: Row): Promise<{ verdict: string; confidence: number; usd: number }> {
  const key = `${variant}|${c.i}|${cand.id}`;
  if (verdicts[key]) return verdicts[key];
  const n = await newPiece(c);
  const co = await blob(cand.original_image_path), ce = await blob(cand.image_path);
  let content: Anthropic.ContentBlockParam[];
  if (variant === "iso2") {
    content = [{ type: "text", text: "ITEM A:" }, img(await small(n.ext, 512)), { type: "text", text: "ITEM B:" }, img(await small(ce, 512)), { type: "text", text: ISO_PROMPT }];
  } else {
    const prep = variant === "full4" ? full : (b: Buffer) => small(b, 640);
    content = [
      { type: "text", text: "ITEM A — original photo:" }, img(await prep(n.orig)),
      { type: "text", text: "ITEM A — isolated photo:" }, img(await prep(n.ext)),
      { type: "text", text: "ITEM B — original photo:" }, img(await prep(co)),
      { type: "text", text: "ITEM B — isolated photo:" }, img(await prep(ce)),
      { type: "text", text: COMPARE_PROMPT },
    ];
  }
  let out = { verdict: "different", confidence: 0, why: "(no usable answer)", usd: 0 };
  try {
    const m = await anthropic.messages.create({ model: "claude-sonnet-5", max_tokens: 600, messages: [{ role: "user", content }] });
    const usd = claudeUsd(m.usage);
    charge("claude", usd);
    const j = parseJson(textOf(m));
    out = { verdict: j.verdict === "same" ? "same" : "different", confidence: Number(j.confidence) || 0, why: String(j.why ?? ""), usd };
  } catch (e) { if (String(e).includes("BUDGET")) throw e; }
  verdicts[key] = out; saveVerdicts();
  return out;
}

// ── S4: one call, the new piece plus a contact sheet of every same-category piece ─────────────────────────
async function sheetOf(rows: Row[]): Promise<Buffer> {
  const W = 220, H = 293, COLS = 5;
  const layers: import("sharp").OverlayOptions[] = [];
  for (let i = 0; i < rows.length; i++) {
    const x = (i % COLS) * W, y = Math.floor(i / COLS) * H;
    const tile = await sharp(await blob(rows[i].image_path)).resize(W, H, { fit: "contain", background: BG }).jpeg({ quality: 80 }).toBuffer();
    layers.push({ input: tile, left: x, top: y });
    const label = String(i + 1);
    layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="44"><rect x="4" y="4" width="${14 + label.length * 17}" height="32" fill="white" stroke="#1a1a18"/><text x="11" y="29" font-size="26" font-family="Helvetica,Arial" font-weight="bold" fill="#1a1a18">${label}</text></svg>`), left: x, top: y });
  }
  return sharp({ create: { width: W * Math.min(COLS, rows.length), height: H * Math.ceil(rows.length / COLS), channels: 3, background: BG } }).composite(layers).jpeg({ quality: 80 }).toBuffer();
}
async function sheetMatch(c: Case, w: Row[], scenario: "P" | "N"): Promise<{ matchId: string | null; confidence: number; usd: number }> {
  const key = `sheet|${c.i}|${scenario}`;
  const pool = w.filter((r) => r.category === c.category);
  const cached = verdicts[key] as unknown as { verdict: string; confidence: number; usd: number } | undefined;
  if (cached) return { matchId: cached.verdict === "none" ? null : cached.verdict, confidence: cached.confidence, usd: cached.usd };
  const n = await newPiece(c);
  const m = await anthropic.messages.create({
    model: "claude-sonnet-5", max_tokens: 400,
    messages: [{ role: "user", content: [
      { type: "text", text: "NEW piece (an AI-cleaned catalogue shot made from a phone photo):" }, img(await small(n.ext, 640)),
      { type: "text", text: `The person's existing ${c.category.toLowerCase()}, as a numbered contact sheet (${pool.length} pieces):` }, img(await sheetOf(pool)),
      { type: "text", text:
        `Is the NEW piece the same individual physical garment as any numbered piece? The same garment can look slightly different between two photos (crop, exact shade, pose, rendering). ` +
        `Garments that merely look alike (same colour and style but a different cut, collar, pockets, closures or details) are NOT the same. ` +
        `Return ONLY JSON: {"match": <number or null>, "confidence": 0-1, "why": "one sentence"}` },
    ] }],
  });
  const usd = claudeUsd(m.usage); charge("claude", usd);
  let matchId: string | null = null, confidence = 0;
  try { const j = parseJson(textOf(m)); const k = Number(j.match); if (Number.isInteger(k) && k >= 1 && k <= pool.length) matchId = pool[k - 1].id; confidence = Number(j.confidence) || 0; } catch { /* no usable answer = no match */ }
  verdicts[key] = { verdict: matchId ?? "none", confidence, why: "", usd }; saveVerdicts();
  return { matchId, confidence, usd };
}

// ── running a strategy ────────────────────────────────────────────────────────────────────────────────────
interface Outcome { flagged: string | null; usd: number; calls: number }
async function strategy(name: string, c: Case, w: Row[], scenario: "P" | "N"): Promise<Outcome> {
  if (name === "S4 sheet") { const r = await sheetMatch(c, w, scenario); return { flagged: r.matchId && r.confidence >= THRESHOLD ? r.matchId : null, usd: r.usd, calls: 1 }; }
  const variant: Variant = name.startsWith("S0") || name.startsWith("S1") ? "full4" : name.startsWith("S2") ? "small4" : "iso2";
  const cands = name.startsWith("S0") ? candidatesToday(c.tags, w) : rankedAll(c.tags, w).slice(0, 3);
  let usd = 0, calls = 0, flagged: string | null = null;
  for (const cand of cands) { // like the app: stop at the first match
    const r = await compare(variant, c, cand); usd += r.usd; calls++;
    if (r.verdict === "same" && r.confidence >= THRESHOLD) { flagged = cand.id; break; }
  }
  return { flagged, usd, calls };
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => { while (next < items.length) { const t = items[next++]; await fn(t); } }));
}

async function phaseRun(only?: string[]) {
  const cases = loadCases(); const w = await loadWardrobe();
  const names = ["S4 sheet", "S3 ranked/iso", "S2 ranked/small", "S1 ranked/full", "S0 today"].filter((n) => !only?.length || only.some((o) => n.startsWith(o)));
  const results: Record<string, { tp: number; miss: number; wrong: number; fp: number; cost: number; callsPerUpload: number; detail: string[] }> = {};
  for (const name of names) {
    const r = { tp: 0, miss: 0, wrong: 0, fp: 0, cost: 0, callsPerUpload: 0, detail: [] as string[] };
    let uploads = 0;
    await pool(cases, 4, async (c) => {
      const p = await strategy(name, c, w, "P");
      const n = await strategy(name, c, w.filter((x) => x.id !== c.srcId), "N");
      uploads += 2; r.cost += p.usd + n.usd; r.callsPerUpload += p.calls + n.calls;
      if (p.flagged === c.srcId) r.tp++; else if (p.flagged) { r.wrong++; r.miss++; } else r.miss++;
      if (n.flagged) r.fp++;
      r.detail.push(`case ${c.i} ${c.srcName.slice(0, 26)}: ${p.flagged === c.srcId ? "FOUND" : p.flagged ? "wrong piece" : "missed"}${n.flagged ? " + false alarm without twin" : ""}`);
    });
    results[name] = { ...r, cost: r.cost / uploads, callsPerUpload: r.callsPerUpload / uploads };
    console.log(`${name.padEnd(16)} found ${r.tp}/${cases.length}   false alarms (twin removed) ${r.fp}/${cases.length}   avg cost/new piece ${(results[name].cost * 100).toFixed(1)}¢   avg AI calls ${results[name].callsPerUpload.toFixed(1)}   | billed so far $${total().toFixed(2)}`);
  }
  fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(results, null, 1));
  for (const [name, r] of Object.entries(results)) { console.log(`\n${name}`); r.detail.sort().forEach((d) => console.log("  " + d)); }
}

// ── cascades: a cheap first look, a careful second look only when the first is unsure ───────────────────────
async function cascade(c: Case, w: Row[], k: number, unsureBelow: number): Promise<Outcome> {
  let usd = 0, calls = 0;
  for (const cand of rankedAll(c.tags, w).slice(0, k)) {
    const a = await compare("small4", c, cand); usd += a.usd; calls++;
    if (a.verdict === "same" && a.confidence >= THRESHOLD) return { flagged: cand.id, usd, calls };
    if (a.verdict === "different" && a.confidence < unsureBelow) { // unsure it is different: look again at full size
      const b = await compare("full4", c, cand); usd += b.usd; calls++;
      if (b.verdict === "same" && b.confidence >= THRESHOLD) return { flagged: cand.id, usd, calls };
    }
  }
  return { flagged: null, usd, calls };
}

async function phaseCombos() {
  const cases = loadCases(); const w = await loadWardrobe();
  console.log("\nHow confident is the small-image pass when it says DIFFERENT? (twin = should have said same)");
  const twinConf: number[] = [], lookConf: number[] = [];
  for (const [key, x] of Object.entries(verdicts)) {
    if (!key.startsWith("small4|") || x.verdict !== "different") continue;
    const [, ci, id] = key.split("|"); const c = cases.find((q) => String(q.i) === ci)!;
    (id === c.srcId ? twinConf : lookConf).push(x.confidence);
  }
  const q = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return `n=${s.length} min ${s[0]?.toFixed(2)} median ${s[Math.floor(s.length / 2)]?.toFixed(2)}`; };
  console.log(`  on the twin (wrong answers): ${q(twinConf)}\n  on lookalikes (right answers): ${q(lookConf)}`);
  console.log("\ncascade = small-image look at the top K ranked pieces; if unsure it is different (confidence below T), a full-size look at that piece\n");
  for (const [k, t] of [[3, 0.8], [3, 0.85], [3, 0.9], [3, 0.95], [2, 0.9], [2, 0.95]] as [number, number][]) {
    let tp = 0, fp = 0, costP = 0, costN = 0, callsP = 0, callsN = 0;
    await pool(cases, 4, async (c) => {
      const p = await cascade(c, w, k, t), n = await cascade(c, w.filter((x) => x.id !== c.srcId), k, t);
      if (p.flagged === c.srcId) tp++; if (n.flagged) fp++;
      costP += p.usd; costN += n.usd; callsP += p.calls; callsN += n.calls;
    });
    const m = cases.length;
    console.log(`K=${k} T=${t}:  found ${tp}/${m}  false alarms ${fp}/${m}  cost when a twin exists ${(costP / m * 100).toFixed(1)}¢ (${(callsP / m).toFixed(1)} calls)  cost when there is NO twin ${(costN / m * 100).toFixed(1)}¢ (${(callsN / m).toFixed(1)} calls)   | billed so far $${total().toFixed(2)}`);
  }
  // For comparison, today's per-scenario costs, from the saved answers
  let sp = 0, sn = 0;
  for (const c of cases) {
    for (const [scen, ww] of [["P", w], ["N", w.filter((x) => x.id !== c.srcId)]] as ["P" | "N", Row[]][]) {
      let u = 0; for (const cand of candidatesToday(c.tags, ww)) { const r = verdicts[`full4|${c.i}|${cand.id}`]; if (r) u += r.usd; if (r?.verdict === "same" && r.confidence >= THRESHOLD) break; }
      if (scen === "P") sp += u; else sn += u;
    }
  }
  console.log(`today (S0):  cost when a twin exists ${(sp / cases.length * 100).toFixed(1)}¢   cost when there is NO twin ${(sn / cases.length * 100).toFixed(1)}¢`);
}

async function main() {
  const phase = process.argv[2] ?? "all";
  try {
    if (phase === "combos") await phaseCombos();
    if (phase === "phaseA" || phase === "all") await phaseA();
    if (phase === "analyse" || phase === "all") await phaseAnalyse();
    if (phase === "run" || phase === "all") await phaseRun(process.argv.slice(3));
  } catch (e) { console.error(String(e instanceof Error ? e.message : e)); }
  console.log(`\nspent so far: Claude $${spend.claude.toFixed(2)} + Gemini $${spend.gemini.toFixed(2)} = $${total().toFixed(2)} (cap $${BUDGET_USD})`);
}
main();
