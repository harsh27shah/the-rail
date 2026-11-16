// Finds stored product photos where the generator drew the garment twice (front above back)
// and, with --apply, re-saves them showing just the top view. Dry run by default — prints
// what it would change so the flagged photos can be checked by eye first. Uses the real
// detector from lib/product-photo.ts (not a copy), so what's tested is what ships.
// Only touches each item's CURRENT image; the untouched original upload is never changed.
//
// Run from web/:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/backfill-stacked-views.ts [--apply]

import fs from "node:fs";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findStackedViewTopBox } from "@/lib/product-photo";

const APPLY = process.argv.includes("--apply");
const OUT = process.env.PREVIEW_DIR;

async function main() {
  const admin = getSupabaseAdmin()!;
  const { data, error } = await admin.from("items").select("id,name,image_path,original_image_path");
  if (error) throw error;

  let flagged = 0;
  for (const item of data ?? []) {
    if (!item.image_path || item.image_path === item.original_image_path) continue; // not generated
    const dl = await admin.storage.from("wardrobe-images").download(item.image_path);
    if (dl.error) { console.log("skip (download)", item.id.slice(0, 6), dl.error.message); continue; }
    const buffer = Buffer.from(await dl.data!.arrayBuffer());
    const meta = await sharp(buffer).metadata();
    const box = await findStackedViewTopBox(buffer, meta.width!, meta.height!);
    if (!box) continue;
    flagged++;
    console.log(`STACKED  ${item.id.slice(0, 6)}  ${item.name}  keep rows ${box.top}-${box.bottom} of ${meta.height}`);
    if (OUT) {
      const crop = await sharp(buffer).extract({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top }).jpeg().toBuffer();
      fs.writeFileSync(`${OUT}/${item.id.slice(0, 6)}-top.jpg`, crop);
    }
    if (APPLY) {
      const { normalizeProductPhoto } = await import("@/lib/product-photo");
      const { replaceItemImage } = await import("@/lib/items");
      const fixed = await normalizeProductPhoto(buffer.toString("base64"), "image/jpeg");
      const owner = await admin.from("items").select("user_id").eq("id", item.id).single();
      await replaceItemImage(owner.data!.user_id, item.id, fixed.data, fixed.mimeType);
      console.log("  → fixed");
    }
  }
  console.log(`\n${flagged} of ${data?.length} items flagged${APPLY ? " and fixed" : " (dry run — nothing changed)"}`);
}
main();
