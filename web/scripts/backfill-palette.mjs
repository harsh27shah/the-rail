// One-off (re-runnable) backfill: re-derives just the `palette` field for every existing
// item. Fixes a real tagging bug — the schema example in src/lib/anthropic.ts showed
// `["#hex","#hex"]`, which nudged Claude into always filling two slots, so solid-coloured
// garments got tagged with two near-identical shades of the same colour. That shows up as
// two visibly different swatches in the hover overlay (src/components/ItemCard.tsx) even
// though the garment is really just one colour. The live prompt is now fixed (see
// PALETTE_NOTE in src/lib/anthropic.ts) — this script re-tags existing items so already-
// catalogued pieces get the same fix without re-running the whole tagging/extraction flow.
//
// Only touches the `palette` column — name, category, material etc. are left alone.
//
// Run from the web/ directory: node scripts/backfill-palette.mjs
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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const PALETTE_PROMPT =
  `Look at this product photo of a single wardrobe garment. Identify only the colours that ` +
  `are genuinely, visibly distinct on it. A plain solid-coloured garment should get exactly ` +
  `ONE hex code — do not add a second, slightly different shade of the same colour just to ` +
  `fill the list. Only include a second or third hex when there's a real, clearly separate ` +
  `colour on the garment (e.g. contrast trim, a colour-blocked panel, stripes, or a print), ` +
  `most visually dominant colour first.\n\n` +
  `Return ONLY a JSON array of hex colour strings, no prose, no markdown fences, e.g. ` +
  `["#5b5645"] or ["#1a1a1a","#f2ede2"].`;

async function derivePalette(base64, mimeType) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: PALETTE_PROMPT },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Model didn't return a JSON array");
  const parsed = JSON.parse(clean.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty palette returned");
  return parsed;
}

async function main() {
  const { data: items, error } = await supabase
    .from("items")
    .select("id, name, palette, image_path")
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

      const newPalette = await derivePalette(base64, mimeType);
      const before = JSON.stringify(item.palette ?? []);
      const after = JSON.stringify(newPalette);

      if (before === after) {
        console.log(`•  ${label}: unchanged (${after})`);
        unchanged++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("items")
        .update({ palette: newPalette })
        .eq("id", item.id);
      if (updateError) throw new Error(updateError.message);

      console.log(`✅ ${label}: ${before} → ${after}`);
      ok++;
    } catch (e) {
      console.log(`❌ ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} updated, ${unchanged} unchanged, ${failed} failed.`);
}

main();
