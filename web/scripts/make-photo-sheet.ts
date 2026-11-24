// Makes numbered photo sheets of the rated top+bottom pairs, to show to other people for a
// second opinion (photos only — no item names, so nothing about the wardrobe's owner or the
// original ratings leaks into what they see). Output: eval-data/photo-sheet-1.png, -2.png.
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/make-photo-sheet.ts

import fs from "node:fs";
import sharp, { type OverlayOptions } from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";

interface RatedPair { topId: string; bottomId: string }

const COLS = 3, ROWS = 4, PER_SHEET = COLS * ROWS;
const IMG_W = 200, IMG_H = 267, GAP = 8, LABEL_H = 40, CELL_PAD = 14;
const CELL_W = IMG_W * 2 + GAP, CELL_H = IMG_H + LABEL_H;
const HEADER_H = 110;
const BG = { r: 247, g: 246, b: 242 };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="Helvetica, Arial, sans-serif">${body}</svg>`);

async function main() {
  const pairs = (JSON.parse(fs.readFileSync("eval-data/pairing-ratings.json", "utf8")) as { pairs: RatedPair[] }).pairs;
  const admin = getSupabaseAdmin()!;
  const { data: rows } = await admin.from("items").select("id,image_path");
  const pathOf = new Map((rows ?? []).map((r) => [r.id as string, r.image_path as string]));

  async function photo(id: string): Promise<Buffer> {
    const dl = await admin.storage.from("wardrobe-images").download(pathOf.get(id)!);
    if (dl.error) throw new Error(`couldn't download ${id}: ${dl.error.message}`);
    return sharp(Buffer.from(await dl.data!.arrayBuffer()))
      .resize(IMG_W, IMG_H, { fit: "contain", background: BG })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  const width = COLS * CELL_W + (COLS + 1) * CELL_PAD;
  const height = HEADER_H + ROWS * (CELL_H + CELL_PAD) + CELL_PAD;

  for (let sheet = 0; sheet * PER_SHEET < pairs.length; sheet++) {
    const slice = pairs.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
    const layers: OverlayOptions[] = [
      {
        input: svg(width, HEADER_H,
          `<text x="${CELL_PAD}" y="42" font-size="27" font-weight="bold">Is each pair a well put-together outfit?  Y / Maybe / N</text>` +
          `<text x="${CELL_PAD}" y="76" font-size="19" fill="#555">Top on the left, trousers on the right. Ignore whether it would suit or fit the wearer.</text>` +
          `<text x="${CELL_PAD}" y="100" font-size="19" fill="#555">Reply with the number and your answer, like:  1Y  2N  3M …</text>`),
        left: 0, top: 0,
      },
    ];
    for (let i = 0; i < slice.length; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = CELL_PAD + col * (CELL_W + CELL_PAD);
      const y = HEADER_H + CELL_PAD + row * (CELL_H + CELL_PAD);
      const n = sheet * PER_SHEET + i + 1;
      layers.push({ input: svg(CELL_W, LABEL_H, `<text x="2" y="31" font-size="30" font-weight="bold">${esc(String(n))}</text>`), left: x, top: y });
      layers.push({ input: await photo(slice[i].topId), left: x, top: y + LABEL_H });
      layers.push({ input: await photo(slice[i].bottomId), left: x + IMG_W + GAP, top: y + LABEL_H });
    }
    const out = `eval-data/photo-sheet-${sheet + 1}.png`;
    await sharp({ create: { width, height, channels: 3, background: BG } }).composite(layers).png().toFile(out);
    console.log(`wrote ${out}  (pairs ${sheet * PER_SHEET + 1}–${sheet * PER_SHEET + slice.length}, ${width}×${height})`);
  }
}
main();
