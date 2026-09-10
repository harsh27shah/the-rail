// One-off (re-runnable) backfill: re-derives `category` for every existing item under the
// simplified 5-category taxonomy (Tops, Bottoms, Outerwear, Footwear, Accessories) — see
// PROJECT.md §5. Knitwear, Suiting, and Activewear were dropped as top-level categories;
// this re-tags any item still holding one of those stale values (or otherwise miscategorised
// under the old, blurrier boundaries — e.g. a quarter-zip sweatshirt tagged Outerwear when
// it functions as a top) using the same layering-role rule now baked into the live prompt
// (see CATEGORY_NOTE in src/lib/anthropic.ts).
//
// Only touches the `category` column — name, palette, material etc. are left alone.
//
// Run from the web/ directory: node scripts/backfill-category.mjs
// Requires .env.local to have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ANTHROPIC_API_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

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
const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Footwear", "Accessories"];

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Kept in sync by hand with CATEGORY_NOTE in src/lib/anthropic.ts (this script can't import
// that .ts file directly — see the header above). If you change one, change the other.
const CATEGORY_PROMPT =
  `Look at this product photo of a single wardrobe garment (it's currently catalogued as ` +
  `"${"%NAME%"}"). Choose exactly one category from this fixed list: ${CATEGORIES.join(", ")}.\n\n` +
  `There is no separate "knitwear", "suiting", or "activewear" category. For a knit garment ` +
  `(jumper, cardigan, quarter-zip, sweatshirt), decide by how it's actually worn: if it's ` +
  `typically the outermost layer over another top (a chunky cardigan, a heavy overshirt), ` +
  `it's "Outerwear"; if it typically functions as the top itself (worn alone or as the main ` +
  `layer), it's "Tops". A blazer or suit jacket is "Outerwear"; suit trousers are "Bottoms". ` +
  `Gym-specific pieces (athletic tee, leggings, running shorts) are catalogued the same as ` +
  `any other garment — "Tops" or "Bottoms" by ordinary function.\n\n` +
  `Return ONLY the category string, nothing else — no prose, no punctuation, no quotes.`;

async function deriveCategory(base64, mimeType, name) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 20,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: CATEGORY_PROMPT.replace("%NAME%", name || "garment") },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const match = CATEGORIES.find((c) => text.toLowerCase().includes(c.toLowerCase()));
  if (!match) throw new Error(`Model returned an unrecognised category: "${text}"`);
  return match;
}

async function main() {
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, category, image_path")
    .not("image_path", "is", null);
  if (error) throw new Error(error.message);

  console.log(`Found ${items.length} item(s) with a photo.\n`);

  let ok = 0;
  let unchanged = 0;
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

      const newCategory = await deriveCategory(base64, mimeType, item.name);

      if (newCategory === item.category) {
        console.log(`•  ${label}: unchanged (${newCategory})`);
        unchanged++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ category: newCategory })
        .eq("id", item.id);
      if (updateError) throw new Error(updateError.message);

      console.log(`✅ ${label}: ${item.category} → ${newCategory}`);
      ok++;
    } catch (e) {
      console.log(`❌ ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} updated, ${unchanged} unchanged, ${failed} failed.`);
}

main();
