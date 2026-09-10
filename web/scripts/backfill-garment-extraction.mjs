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

async function extractGarmentImage(base64Image, mimeType, description) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        text:
          `Remove any person, mannequin, hanger, or background clutter from this photo and ` +
          `produce a clean, isolated product photograph of just the ${description}. ` +
          `Style: flat lay or ghost-mannequin look on a plain, light neutral studio ` +
          `background, centered, well-lit, no shadows of a body — like a minimalist ` +
          `online clothing retailer's catalogue photo. Keep the garment's true color, ` +
          `pattern, and shape faithful to the original photo.`,
      },
      { inlineData: { data: base64Image, mimeType } },
    ],
    config: { responseModalities: [Modality.IMAGE] },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
    }
  }
  return null;
}

async function main() {
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, color, image_path")
    .not("image_path", "is", null);
  if (error) throw new Error(error.message);

  console.log(`Found ${items.length} item(s) with a photo.\n`);

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    const label = `${item.name || "item"} (${item.id})`;
    try {
      const { data: fileBlob, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(item.image_path);
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
        .update({ image_path: newPath })
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
