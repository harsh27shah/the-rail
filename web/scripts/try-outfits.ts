// Runs the REAL outfit stylist on a few of the owner's items and draws each result, so the
// outfits can be judged by eye. Costs a few cents per item (one AI request each).
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/try-outfits.ts "Navy Crewneck" "Olive Cargo"
//   (each argument is part of an item name; --no-pictures skips the images)

import fs from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getItems } from "@/lib/items";
import { generateOutfits } from "@/lib/outfits";
import { claudeOutfitModel } from "@/lib/stylist";
import type { Item } from "@/lib/types";

const TILE_W = 190, TILE_H = 253, GAP = 10, PAD = 16, ROW_TEXT = 62;
const BG = { r: 247, g: 246, b: 242 };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif">${body}</svg>`);

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/), lines: string[] = [];
  let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

async function draw(hero: Item, outfits: { itemIds: string[]; why: string }[], byId: Map<string, Item>, out: string) {
  const width = PAD * 2 + TILE_W * 4 + GAP * 3;
  const rowH = TILE_H + ROW_TEXT;
  const height = 70 + outfits.length * (rowH + PAD) + PAD;
  const layers: OverlayOptions[] = [{ input: svg(width, 70, `<text x="${PAD}" y="42" font-size="26" font-weight="bold">Outfits for: ${esc(hero.name)}</text>`), left: 0, top: 0 }];
  for (let r = 0; r < outfits.length; r++) {
    const y = 70 + PAD + r * (rowH + PAD);
    const o = outfits[r];
    for (let i = 0; i < o.itemIds.length; i++) {
      const it = byId.get(o.itemIds[i])!;
      const res = await fetch(it.imageUrl!);
      const photo = await sharp(Buffer.from(await res.arrayBuffer())).resize(TILE_W, TILE_H, { fit: "contain", background: BG }).jpeg({ quality: 85 }).toBuffer();
      const x = PAD + i * (TILE_W + GAP);
      layers.push({ input: photo, left: x, top: y });
      if (it.id === hero.id) layers.push({ input: svg(TILE_W, TILE_H, `<rect x="2" y="2" width="${TILE_W - 4}" height="${TILE_H - 4}" fill="none" stroke="#2B4CD4" stroke-width="4"/>`), left: x, top: y });
    }
    const lines = wrap(`${r + 1}.  ${o.why}`, 88);
    layers.push({ input: svg(width, ROW_TEXT, lines.map((l, k) => `<text x="${PAD}" y="${24 + k * 22}" font-size="17" fill="#1a1a18">${esc(l)}</text>`).join("")), left: 0, top: y + TILE_H });
  }
  await sharp({ create: { width, height, channels: 3, background: BG } }).composite(layers).png().toFile(out);
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const admin = getSupabaseAdmin()!;
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 50 });
  const items = await getItems(users.users[0].id);
  const byId = new Map(items.map((i) => [i.id, i]));
  const model = claudeOutfitModel();

  let totalIn = 0, totalOut = 0;
  for (const w of wanted) {
    const hero = items.find((i) => i.name.toLowerCase().includes(w.toLowerCase()) && !i.duplicateOfId);
    if (!hero) { console.log(`\n"${w}": no such item`); continue; }
    const t0 = Date.now();
    const res = await generateOutfits(hero, items, model);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`\n=== ${hero.name} [${hero.category}] — ${res.status}, ${secs}s ===`);
    if (res.status === "too-small") { console.log("too small:", JSON.stringify(res.readiness)); continue; }
    totalIn += res.usage.input; totalOut += res.usage.output;
    if (res.status === "failed") { console.log("FAILED:", res.error); continue; }
    console.log(`attempts: ${res.attempts}, tokens in ${res.usage.input} out ${res.usage.output}`);
    res.outfits.forEach((o, i) => console.log(`  ${i + 1}. ${o.itemIds.map((id) => byId.get(id)!.name).join("  +  ")}\n     ${o.why}`));
    if (!process.argv.includes("--no-pictures")) {
      fs.mkdirSync("eval-data/outfit-previews", { recursive: true });
      const file = `eval-data/outfit-previews/${hero.name.toLowerCase().replace(/\W+/g, "-")}.png`;
      await draw(hero, res.outfits, byId, file);
      console.log(`  picture: ${file}`);
    }
  }
  // Rates are an assumption ($3 / $15 per million tokens), not a quote.
  console.log(`\nTotal tokens in ${totalIn}, out ${totalOut}; approx cost $${((totalIn * 3 + totalOut * 15) / 1e6).toFixed(2)} (assumed rates)`);
}
main();
