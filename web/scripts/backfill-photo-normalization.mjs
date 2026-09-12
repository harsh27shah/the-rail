// One-off (and re-runnable) backfill: re-tightens every existing item's CURRENT photo
// around its actual garment content and re-letterboxes it to the storefront card's 3:4
// ratio — the same normalizeProductPhoto step new uploads get automatically (see
// src/lib/product-photo.ts). Deliberately does NOT call Gemini again: this only reprocesses
// pixels the item already has, so it carries none of the stochastic-generation risk a fresh
// extraction would (a duplicate-view collage, the garment bleeding off its own canvas, etc.)
// — see PROJECT.md §5 item 20 for that whole saga.
//
// Needed because normalizeProductPhoto (and the content-bounding-box detector it uses
// instead of sharp's unreliable trim()) was added after most of the wardrobe was already
// catalogued — those older items kept their original, more loosely-framed composition,
// which reads as visibly smaller/more "zoomed out" than anything catalogued since. This
// brings the whole wardrobe to one consistent convention.
//
// Run from the web/ directory: node scripts/backfill-photo-normalization.mjs
// Requires .env.local to have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const envPath = path.resolve(import.meta.dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const BUCKET = "wardrobe-images";
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Kept in sync by hand with src/lib/product-photo.ts — this script can't import a .ts
// module directly. See that file's full comment for why findContentBBox exists in place of
// sharp's trim().
const CARD_RATIO = 3 / 4;

async function findContentBBox(buffer, width, height) {
  const RASTER = 300;
  const scale = RASTER / Math.max(width, height);
  const rasterWidth = Math.max(1, Math.round(width * scale));
  const rasterHeight = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(buffer)
    .resize(rasterWidth, rasterHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  function pixelAt(x, y) {
    const i = (y * rasterWidth + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  }
  const corners = [
    pixelAt(0, 0),
    pixelAt(rasterWidth - 1, 0),
    pixelAt(0, rasterHeight - 1),
    pixelAt(rasterWidth - 1, rasterHeight - 1),
  ];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((sum, p) => sum + p[c], 0) / corners.length));
  const DIST_THRESHOLD = 28;
  const LINE_FRACTION = 0.015;
  function distFromBg(p) {
    return Math.sqrt((p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2);
  }
  const colHits = new Array(rasterWidth).fill(0);
  const rowHits = new Array(rasterHeight).fill(0);
  for (let y = 0; y < rasterHeight; y++) {
    for (let x = 0; x < rasterWidth; x++) {
      if (distFromBg(pixelAt(x, y)) > DIST_THRESHOLD) {
        colHits[x]++;
        rowHits[y]++;
      }
    }
  }
  let left = 0;
  let right = rasterWidth - 1;
  let top = 0;
  let bottom = rasterHeight - 1;
  while (left < rasterWidth && colHits[left] / rasterHeight < LINE_FRACTION) left++;
  while (right > left && colHits[right] / rasterHeight < LINE_FRACTION) right--;
  while (top < rasterHeight && rowHits[top] / rasterWidth < LINE_FRACTION) top++;
  while (bottom > top && rowHits[bottom] / rasterWidth < LINE_FRACTION) bottom--;
  if (left >= right || top >= bottom) return null;
  const marginFraction = 0.04;
  const fullLeft = left / scale;
  const fullRight = (right + 1) / scale;
  const fullTop = top / scale;
  const fullBottom = (bottom + 1) / scale;
  const marginX = (fullRight - fullLeft) * marginFraction;
  const marginY = (fullBottom - fullTop) * marginFraction;
  return {
    left: Math.max(0, Math.round(fullLeft - marginX)),
    top: Math.max(0, Math.round(fullTop - marginY)),
    right: Math.min(width, Math.round(fullRight + marginX)),
    bottom: Math.min(height, Math.round(fullBottom + marginY)),
  };
}

async function sampleBackgroundColor(buffer, width, height) {
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.01));
  const points = [
    [inset, inset],
    [width - inset - 1, inset],
    [inset, height - inset - 1],
    [width - inset - 1, height - inset - 1],
  ];
  let r = 0,
    g = 0,
    b = 0;
  for (const [left, top] of points) {
    const pixel = await sharp(buffer).extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  return { r: Math.round(r / points.length), g: Math.round(g / points.length), b: Math.round(b / points.length) };
}

async function normalizeProductPhoto(base64, mimeType) {
  const buffer = Buffer.from(base64, "base64");
  const sourceMeta = await sharp(buffer).metadata();
  let working = buffer;
  if (sourceMeta.width && sourceMeta.height) {
    try {
      const bbox = await findContentBBox(buffer, sourceMeta.width, sourceMeta.height);
      if (bbox) {
        working = await sharp(buffer)
          .extract({ left: bbox.left, top: bbox.top, width: bbox.right - bbox.left, height: bbox.bottom - bbox.top })
          .toBuffer();
      }
    } catch {
      // Bounding-box detection failed — proceed with the untouched image.
    }
  }
  const meta = await sharp(working).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { data: base64, mimeType };
  const ratio = width / height;
  const targetWidth = ratio > CARD_RATIO ? width : Math.round(height * CARD_RATIO);
  const targetHeight = ratio > CARD_RATIO ? Math.round(width / CARD_RATIO) : height;
  let background = { r: 247, g: 246, b: 242 };
  try {
    background = await sampleBackgroundColor(working, width, height);
  } catch {
    // Fall back to the fixed neutral above.
  }
  const out = await sharp(working)
    .resize(targetWidth, targetHeight, { fit: "contain", background })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { data: out.toString("base64"), mimeType: "image/jpeg" };
}

async function main() {
  const { data: items, error } = await supabase.from("items").select("id, name, image_path").not("image_path", "is", null);
  if (error) throw new Error(error.message);

  console.log(`Found ${items.length} item(s) with a photo.\n`);

  let ok = 0;
  let unchanged = 0;
  let failed = 0;
  for (const item of items) {
    const label = `${item.name || "item"} (${item.id})`;
    try {
      const { data: fileBlob, error: dlError } = await supabase.storage.from(BUCKET).download(item.image_path);
      if (dlError) throw new Error(dlError.message);

      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = fileBlob.type || "image/jpeg";

      const normalized = await normalizeProductPhoto(base64, mimeType);

      // Skip the upload entirely if normalization made no real difference (already tight,
      // already matching background) — avoids littering storage with a near-identical
      // duplicate file for every already-good item.
      const beforeMeta = await sharp(Buffer.from(base64, "base64")).metadata();
      const afterMeta = await sharp(Buffer.from(normalized.data, "base64")).metadata();
      const changedEnough =
        Math.abs((beforeMeta.width ?? 0) - (afterMeta.width ?? 0)) > 4 ||
        Math.abs((beforeMeta.height ?? 0) - (afterMeta.height ?? 0)) > 4;
      if (!changedEnough) {
        console.log(`•  ${label}: already tight, left as-is`);
        unchanged++;
        continue;
      }

      const newPath = `${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, Buffer.from(normalized.data, "base64"), { contentType: "image/jpeg" });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase.from("items").update({ image_path: newPath }).eq("id", item.id);
      if (updateError) throw new Error(updateError.message);

      console.log(`✅ ${label}`);
      ok++;
    } catch (e) {
      console.log(`❌ ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} re-tightened, ${unchanged} already fine, ${failed} failed.`);
}

main();
