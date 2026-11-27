// Step 1 of the duplicate-detection experiment (BACKLOG.md, "Duplicate checking": better recall, lower cost).
//
// To measure recall we need ground truth: which pairs in the owner's wardrobe really are the same
// garment. Nobody has labelled that, so this builds a SHORT list of suspect pairs for the owner to label:
//   - pairs a one-call "look at everything of this category on one sheet" pass thinks are the same garment,
//   - pairs it calls close lookalikes (the hard negatives, which matter for precision),
//   - a few pairs picked free from the stored tags (similar colour, pattern, material, name words), which
//     catches pairs the sheet pass misses.
// The pairs are shuffled and drawn as numbered side-by-side sheets (photos only, no names), so the labeller
// isn't nudged by which method suggested a pair. About 4 AI calls, well under a dollar.
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-dup-shortlist.ts

import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";

const OUT = path.resolve(import.meta.dirname, "..", "eval-data", "duplicates");
fs.mkdirSync(OUT, { recursive: true });
const SHEETS = process.env.SHEETS_DIR ?? OUT;

const admin = getSupabaseAdmin()!;
const anthropic = new Anthropic();
const BG = { r: 247, g: 246, b: 242 };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif">${body}</svg>`);

interface Row { id: string; name: string; category: string; color: string; pattern: string; material: string; palette: string[]; added: string; image_path: string }

const STOP = new Set(["a", "an", "the", "and", "with", "for", "in", "on", "of", "to"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const rgb = (hex: string) => { const h = hex.replace("#", ""); const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const dist = (a: string, b: string) => { try { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); } catch { return 999; } };

async function photo(row: Row, w: number, h: number): Promise<Buffer> {
  const dl = await admin.storage.from("wardrobe-images").download(row.image_path);
  if (dl.error) throw new Error(`couldn't download ${row.id}: ${dl.error.message}`);
  return sharp(Buffer.from(await dl.data!.arrayBuffer())).resize(w, h, { fit: "contain", background: BG }).jpeg({ quality: 85 }).toBuffer();
}

async function contactSheet(rows: Row[]): Promise<Buffer> {
  const W = 220, H = 293, COLS = 5;
  const layers: OverlayOptions[] = [];
  for (let i = 0; i < rows.length; i++) {
    const x = (i % COLS) * W, y = Math.floor(i / COLS) * H;
    layers.push({ input: await photo(rows[i], W, H), left: x, top: y });
    const label = String(i + 1);
    layers.push({ input: svg(W, 44, `<rect x="4" y="4" width="${14 + label.length * 17}" height="32" fill="white" stroke="#1a1a18"/><text x="11" y="29" font-size="26" font-weight="bold" fill="#1a1a18">${label}</text>`), left: x, top: y });
  }
  return sharp({ create: { width: W * Math.min(COLS, rows.length), height: H * Math.ceil(rows.length / COLS), channels: 3, background: BG } })
    .composite(layers).jpeg({ quality: 85 }).toBuffer();
}

type Source = "sheet-same" | "sheet-lookalike" | "tags";
interface Pair { a: string; b: string; category: string; sources: Source[]; why: string }
const pairs = new Map<string, Pair>();
const key = (a: string, b: string) => [a, b].sort().join("|");
function addPair(a: Row, b: Row, source: Source, why = "") {
  const k = key(a.id, b.id);
  const p = pairs.get(k) ?? { a: a.id, b: b.id, category: a.category, sources: [], why: "" };
  if (!p.sources.includes(source)) p.sources.push(source);
  if (why && !p.why) p.why = why;
  pairs.set(k, p);
}

async function main() {
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const owner = users!.users.find((u) => u.app_metadata?.role === "owner")!;
  const { data } = await admin.from("items").select("id,name,category,color,pattern,material,palette,added,image_path").eq("user_id", owner.id).is("duplicate_of", null).not("image_path", "is", null).order("added", { ascending: true });
  const items = data as Row[];
  const cats = [...new Set(items.map((i) => i.category))];
  let inTok = 0, outTok = 0, calls = 0;

  for (const cat of cats) {
    const rows = items.filter((i) => i.category === cat);
    if (rows.length < 2) continue;
    const sheet = await contactSheet(rows);
    const list = rows.map((r, i) => `${i + 1}: ${r.name} (${r.color})`).join("\n");
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: sheet.toString("base64") } },
          { type: "text", text:
            `This is one person's wardrobe, category "${cat}", as numbered product photos (each is an AI-cleaned catalogue shot made from a phone photo). ` +
            `The same real garment may have been photographed and catalogued more than once, so it can appear under two numbers, rendered slightly differently ` +
            `(crop, exact shade, pose).\n\n${list}\n\n` +
            `Find every set of numbers that you think are the SAME individual physical garment, and separately list pairs that look very similar but that you think are DIFFERENT garments (close lookalikes). ` +
            `Be generous: it is better to list a doubtful pair than to miss one. Judge by cut, silhouette, sleeve length, neckline, closures, pockets, print or pattern placement, and distinctive details.\n\n` +
            `Return ONLY JSON: {"same":[{"items":[1,2],"confidence":0-1,"why":"one sentence"}],"lookalikes":[{"items":[3,4],"why":"one sentence"}]}` },
        ],
      }],
    });
    calls++; inTok += msg.usage.input_tokens; outTok += msg.usage.output_tokens;
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { same: { items: number[]; why: string }[]; lookalikes: { items: number[]; why: string }[] };
    for (const g of parsed.same ?? []) for (let i = 0; i < g.items.length; i++) for (let j = i + 1; j < g.items.length; j++) { const a = rows[g.items[i] - 1], b = rows[g.items[j] - 1]; if (a && b) addPair(a, b, "sheet-same", g.why); }
    for (const g of parsed.lookalikes ?? []) { const a = rows[g.items[0] - 1], b = rows[g.items[1] - 1]; if (a && b) addPair(a, b, "sheet-lookalike", g.why); }
    console.log(`${cat}: ${rows.length} items, sheet says ${(parsed.same ?? []).length} same-group(s), ${(parsed.lookalikes ?? []).length} lookalike pair(s)`);
  }

  // Free picks from the stored tags: most similar pairs per category that the sheet pass didn't already list.
  for (const cat of cats) {
    const rows = items.filter((i) => i.category === cat);
    const scored: { a: Row; b: Row; score: number }[] = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      const d = dist(a.palette?.[0] ?? "#000", b.palette?.[0] ?? "#fff");
      let score = Math.max(0, 120 - d) / 40; // closer main colour scores higher
      if (a.pattern === b.pattern) score += 1;
      if (a.material && a.material === b.material) score += 1;
      const shared = [...words(a.name)].filter((w) => words(b.name).has(w)).length;
      score += shared * 0.7;
      scored.push({ a, b, score });
    }
    scored.sort((x, y) => y.score - x.score);
    let added = 0;
    for (const s of scored) { if (added >= 4) break; if (pairs.has(key(s.a.id, s.b.id))) continue; addPair(s.a, s.b, "tags"); added++; }
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  // Shuffle with a fixed seed so the sheet order doesn't reveal which method suggested a pair.
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const all = [...pairs.values()].map((p) => ({ p, r: rnd() })).sort((x, y) => x.r - y.r).map((x) => x.p);
  const shortlist = all.map((p, i) => ({ n: i + 1, ...p, aName: byId.get(p.a)!.name, bName: byId.get(p.b)!.name }));
  fs.writeFileSync(path.join(OUT, "shortlist.json"), JSON.stringify(shortlist, null, 1));
  const cost = (inTok * 3 + outTok * 15) / 1e6;
  console.log(`\n${shortlist.length} pairs to label (${shortlist.filter((p) => p.sources.includes("sheet-same")).length} the sheet pass calls the same, ${shortlist.filter((p) => p.sources.includes("sheet-lookalike")).length} lookalikes, ${shortlist.filter((p) => p.sources.length === 1 && p.sources[0] === "tags").length} tag-only picks). ${calls} AI calls, about $${cost.toFixed(2)}.`);

  // Numbered side-by-side sheets: photos only.
  const COLS = 3, ROWS = 4, PER = COLS * ROWS, IMG_W = 200, IMG_H = 267, GAP = 8, LABEL_H = 40, PAD = 14, HEADER_H = 110;
  const CELL_W = IMG_W * 2 + GAP, CELL_H = IMG_H + LABEL_H;
  const width = COLS * CELL_W + (COLS + 1) * PAD, height = HEADER_H + ROWS * (CELL_H + PAD) + PAD;
  const files: string[] = [];
  for (let sheet = 0; sheet * PER < shortlist.length; sheet++) {
    const slice = shortlist.slice(sheet * PER, (sheet + 1) * PER);
    const layers: OverlayOptions[] = [{
      input: svg(width, HEADER_H,
        `<text x="${PAD}" y="42" font-size="27" font-weight="bold">Is each pair the SAME garment you own twice?   S = same   D = different   ? = can't tell</text>` +
        `<text x="${PAD}" y="76" font-size="19" fill="#555">Two different garments that merely look alike are D. Same garment photographed twice is S.</text>` +
        `<text x="${PAD}" y="100" font-size="19" fill="#555">Reply with the number and your answer, like:  1S  2D  3?  4D …</text>`),
      left: 0, top: 0,
    }];
    for (let i = 0; i < slice.length; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * (CELL_W + PAD), y = HEADER_H + PAD + row * (CELL_H + PAD);
      layers.push({ input: svg(CELL_W, LABEL_H, `<text x="2" y="31" font-size="30" font-weight="bold">${esc(String(slice[i].n))}</text>`), left: x, top: y });
      layers.push({ input: await photo(byId.get(slice[i].a)!, IMG_W, IMG_H), left: x, top: y + LABEL_H });
      layers.push({ input: await photo(byId.get(slice[i].b)!, IMG_W, IMG_H), left: x + IMG_W + GAP, top: y + LABEL_H });
    }
    const file = path.join(SHEETS, `pairs-sheet-${sheet + 1}.png`);
    await sharp({ create: { width, height, channels: 3, background: BG } }).composite(layers).png().toFile(file);
    files.push(file);
  }
  console.log("sheets:", files.join("\n        "));
}
main();
