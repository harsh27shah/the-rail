// Tests for the stacked-view detector (lib/product-photo.ts). Synthetic photos only — the
// real-wardrobe check is scripts/backfill-stacked-views.ts (dry run).
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-product-photo.ts

import sharp from "sharp";
import { findStackedViewTopBox, normalizeProductPhoto } from "@/lib/product-photo";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const W = 600;
const H = 800;
const BG = { r: 232, g: 232, b: 228 };

type Rect = { x: number; y: number; w: number; h: number; c?: [number, number, number] };

async function scene(rects: Rect[]) {
  const layers = await Promise.all(
    rects.map(async (r) => ({
      input: await sharp({
        create: { width: r.w, height: r.h, channels: 3, background: { r: r.c?.[0] ?? 20, g: r.c?.[1] ?? 30, b: r.c?.[2] ?? 70 } },
      })
        .png()
        .toBuffer(),
      left: r.x,
      top: r.y,
    }))
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: BG } }).composite(layers).jpeg().toBuffer();
}

async function run(rects: Rect[]) {
  return findStackedViewTopBox(await scene(rects), W, H);
}

async function main() {
  // Two equal garments stacked, clear band between → detected, top kept.
  let box = await run([
    { x: 150, y: 40, w: 300, h: 320 },
    { x: 150, y: 440, w: 300, h: 320 },
  ]);
  check("front above back → top view box", !!box && box.bottom < H / 2 + 20 && box.top < 60, JSON.stringify(box));

  // Slightly different size/offset (as real generations are) → still detected.
  box = await run([
    { x: 140, y: 30, w: 320, h: 330 },
    { x: 150, y: 430, w: 300, h: 310 },
  ]);
  check("stacked, slightly different sizes → detected", !!box);

  // One garment, no gap.
  box = await run([{ x: 120, y: 60, w: 360, h: 680 }]);
  check("single garment → untouched", box === null);

  // One garment with a hairline gap (e.g. a seam line lighter than the threshold).
  box = await run([
    { x: 150, y: 60, w: 300, h: 330 },
    { x: 150, y: 393, w: 300, h: 330 },
  ]);
  check("hairline gap (3px) → untouched", box === null);

  // Side by side, like a pair of shoes → normal product shot.
  box = await run([
    { x: 40, y: 300, w: 240, h: 200 },
    { x: 320, y: 300, w: 240, h: 200 },
  ]);
  check("side-by-side pair → untouched", box === null);

  // Big garment with a small accessory-like blob far below (very unequal) → untouched.
  box = await run([
    { x: 130, y: 40, w: 340, h: 560 },
    { x: 260, y: 680, w: 80, h: 60 },
  ]);
  check("big item + small blob below → untouched", box === null);

  // A tall item beside a short one stacked unevenly (ratio < 0.75) → untouched.
  box = await run([
    { x: 150, y: 40, w: 300, h: 500 },
    { x: 150, y: 600, w: 300, h: 150 },
  ]);
  check("very unequal stack → untouched", box === null);

  // End to end: normalizeProductPhoto on a doubled photo yields a 3:4 image of ONE block.
  const doubled = await scene([
    { x: 150, y: 40, w: 300, h: 320 },
    { x: 150, y: 440, w: 300, h: 320 },
  ]);
  const out = await normalizeProductPhoto(doubled.toString("base64"), "image/jpeg");
  const again = await sharp(Buffer.from(out.data, "base64")).metadata();
  const stillStacked = await findStackedViewTopBox(Buffer.from(out.data, "base64"), again.width!, again.height!);
  check("normalize: doubled photo comes out single and 3:4", stillStacked === null && Math.abs(again.width! / again.height! - 0.75) < 0.01);

  // Idempotent: normalising an already-normalised single photo leaves it single.
  const out2 = await normalizeProductPhoto(out.data, out.mimeType);
  const m2 = await sharp(Buffer.from(out2.data, "base64")).metadata();
  check("normalize twice stays single and 3:4", Math.abs(m2.width! / m2.height! - 0.75) < 0.01);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
