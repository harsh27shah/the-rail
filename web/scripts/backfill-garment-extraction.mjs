// One-off (and re-runnable) backfill: runs every existing wardrobe item's photo through
// the same garment-extraction step that new uploads get automatically (see
// src/app/add/actions.ts and src/lib/gemini.ts). Useful the first time this feature ships,
// or again later if the extraction prompt gets improved and old items should be redone.
//
// Run from the web/ directory: node scripts/backfill-garment-extraction.mjs
// Requires .env.local to have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI, Modality } from "@google/genai";
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
const MODEL = "gemini-3.1-flash-image";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// Kept in sync by hand with src/lib/product-photo.ts's normalizeProductPhoto — this script
// can't import a .ts module directly. See that file's comment for why this exists: Gemini's
// isolated product shots don't reliably fill their own canvas, and every card on the
// storefront displays at a fixed 3:4 with `object-fit: cover`, so a mismatched canvas shape
// can leave a perfectly fine garment looking half cut-off in the UI.
const CARD_RATIO = 3 / 4;

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
  let working = buffer;
  try {
    working = await sharp(buffer).trim({ threshold: 12 }).toBuffer();
  } catch {
    // No uniform border to trim — proceed untrimmed.
  }
  const meta = await sharp(working).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { data: base64, mimeType };
  const ratio = width / height;
  const targetWidth = ratio > CARD_RATIO ? width : Math.round(height * CARD_RATIO);
  const targetHeight = ratio > CARD_RATIO ? Math.round(width / CARD_RATIO) : height;
  // Sampled from the photo's own background rather than a fixed colour — Gemini's "plain
  // neutral studio background" isn't the same tone every generation, and a fixed pad colour
  // left a visible seam where it met the real one (found in real use, see product-photo.ts).
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

async function extractGarmentImage(base64Image, mimeType, description) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        text:
          `Remove any person, mannequin, hanger, or background clutter from this photo and ` +
          `produce a clean, isolated product photograph of just the ${description}. ` +
          `Style: flat lay or ghost-mannequin look on a plain, light neutral studio ` +
          `background, centred, well-lit, no shadows of a body — like a minimalist ` +
          `online clothing retailer's catalogue photo. Keep the garment's true colour, ` +
          `pattern, and shape faithful to the original photo. Show it as ONE single view ` +
          `from one consistent angle only — never multiple copies, angles, or duplicate ` +
          `views of the same item side by side. Fill most of the frame with the garment ` +
          `itself, with only a small, even margin of background around it — not a large ` +
          `empty canvas. Show the ENTIRE garment fully within the frame — never let any ` +
          `part of it (a sleeve, a shoulder, a hem) extend past the edge of the photo.`,
      },
      { inlineData: { data: base64Image, mimeType } },
    ],
    config: { responseModalities: [Modality.IMAGE] },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return normalizeProductPhoto(part.inlineData.data, part.inlineData.mimeType ?? "image/png");
    }
  }
  return null;
}

async function main() {
  // Only items never processed through this pipeline before (original_image_path still
  // null) — otherwise a re-run would blow away corrections made since the last backfill,
  // re-extracting from scratch and losing that work.
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, color, image_path, original_image_path")
    .not("image_path", "is", null)
    .is("original_image_path", null);
  if (error) throw new Error(error.message);

  console.log(`Found ${items.length} item(s) needing a first extraction.\n`);

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    const label = `${item.name || "item"} (${item.id})`;
    try {
      // The item's *current* image_path is only the true original the first time this
      // runs — a second run (e.g. after improving the prompt) would otherwise overwrite
      // original_image_path with an already-generated photo. Only set it once.
      const sourcePath = item.original_image_path || item.image_path;

      const { data: fileBlob, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(sourcePath);
      if (dlError) throw new Error(dlError.message);

      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = fileBlob.type || "image/jpeg";
      const description = [item.color, item.name].filter(Boolean).join(" ") || "garment";

      const extracted = await extractGarmentImage(base64, mimeType, description);
      if (!extracted) {
        console.log(`⚠️  ${label}: model returned no image, skipped`);
        failed++;
        continue;
      }

      const ext = extracted.mimeType === "image/png" ? "png" : "jpg";
      const newPath = `${crypto.randomUUID()}.${ext}`;
      const buffer = Buffer.from(extracted.data, "base64");
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, buffer, { contentType: extracted.mimeType });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from("items")
        .update({ image_path: newPath, original_image_path: sourcePath })
        .eq("id", item.id);
      if (updateError) throw new Error(updateError.message);

      console.log(`✅ ${label}`);
      ok++;
    } catch (e) {
      console.log(`❌ ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed/skipped.`);
}

main();
