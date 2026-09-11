// One-off (re-runnable) backfill: runs the duplicate check — comparing each item's ORIGINAL
// upload plus its EXTRACTED (isolated) photo together against the same pair for each
// candidate — across the existing wardrobe, in upload order. Mirrors the corrected live
// logic in src/lib/items.ts (findDuplicateCandidates) and src/lib/anthropic.ts
// (compareGarmentPhotos) exactly, on purpose — see that function's comment for the full
// three-attempt story (comparing only `image_path`, then only `original_image_path`, then
// only the extracted photo, were each tried and found wanting before landing on using both
// together). Re-validated against known real duplicate pairs before shipping: caught every
// one the single-image approaches missed, while still correctly calling a known false-
// positive trap "different".
//
// Processes items oldest-first so each is only checked against earlier, already-extracted,
// not-already-flagged candidates — matches the live semantics and avoids forming chains.
//
// Run from the web/ directory: node scripts/backfill-duplicates.mjs
// Requires .env.local to have SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ANTHROPIC_API_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const envPath = path.resolve(import.meta.dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const BUCKET = "wardrobe-images";
const CONFIDENCE_THRESHOLD = 0.6;
const MAX_CANDIDATES = 5;

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Kept in sync by hand with lib/items.ts (significantWords/wordsOverlap) and
// lib/anthropic.ts (compareGarmentPhotos/COMPARE_PROMPT) — this script can't import those
// .ts files.
const STOP_WORDS = new Set(["a", "an", "the", "and", "with", "for", "in", "on", "of", "to"]);
function significantWords(s) {
  return new Set((s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}
function wordsOverlap(a, b) {
  for (const w of a) if (b.has(w)) return true;
  return false;
}

const COMPARE_PROMPT =
  `You're deciding whether ITEM A and ITEM B are the same individual physical garment or ` +
  `two different garments. For each item you're shown two photos: its ORIGINAL upload (may ` +
  `show a person wearing several garments at once — focus only on the specific item this ` +
  `side is about) and an ISOLATED photo (an AI-cleaned single-garment product shot, which ` +
  `can have its own rendering quirks — slightly different crop, pose, or exact shade each ` +
  `time it's generated, even for the same real garment). Use both together: the original ` +
  `tells you the true context and exact appearance; the isolated shot removes background ` +
  `clutter. If they seem to disagree, trust the original for ground truth.\n\n` +
  `Weigh: cut, silhouette, sleeve length, neckline, closures, pockets, seams, print/pattern ` +
  `placement, distinctive wear or markings. Ignore differences that are just photography ` +
  `(background, lighting, crop) or just generation variance in the isolated shots.\n\n` +
  `Return ONLY JSON: {"verdict":"same"|"different","confidence":0-1,"why":"one sentence"}`;

const imageCache = new Map();
async function downloadCached(storagePath) {
  if (imageCache.has(storagePath)) return imageCache.get(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(error.message);
  const buffer = Buffer.from(await data.arrayBuffer());
  const result = { base64: buffer.toString("base64"), mimeType: data.type || "image/jpeg" };
  imageCache.set(storagePath, result);
  return result;
}

function imageBlock(image) {
  return { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } };
}

async function compare(a, b) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 600, // 300 truncated some responses mid-JSON — see lib/anthropic.ts's comment
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "ITEM A — original photo:" },
        imageBlock(a.original),
        { type: "text", text: "ITEM A — isolated photo:" },
        imageBlock(a.extracted),
        { type: "text", text: "ITEM B — original photo:" },
        imageBlock(b.original),
        { type: "text", text: "ITEM B — isolated photo:" },
        imageBlock(b.extracted),
        { type: "text", text: COMPARE_PROMPT },
      ],
    }],
  });
  const text = message.content.filter((x) => x.type === "text").map((x) => x.text).join("");
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  return JSON.parse(text.slice(s, e + 1));
}

async function photoPairFor(item) {
  const [original, extracted] = await Promise.all([
    downloadCached(item.original_image_path),
    downloadCached(item.image_path),
  ]);
  return { original, extracted };
}

async function main() {
  const { data: allItems, error } = await supabase
    .from("items")
    .select("id, name, category, color, image_path, original_image_path, duplicate_of, added")
    .not("image_path", "is", null)
    .order("added", { ascending: true });
  if (error) throw new Error(error.message);

  // Only items whose extraction has actually finished are trustworthy comparison material —
  // same rule the live check uses.
  const items = allItems.filter((it) => it.image_path !== it.original_image_path);
  const skippedNotExtracted = allItems.length - items.length;

  console.log(`Checking ${items.length} extracted item(s), oldest first` + (skippedNotExtracted ? ` (${skippedNotExtracted} skipped — not yet extracted)` : "") + `.\n`);

  let flagged = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = `${item.name} (${item.id.slice(0, 8)})`;

    if (item.duplicate_of) {
      console.log(`•  ${label}: already flagged, skipped`);
      unchanged++;
      continue;
    }

    const colorWords = significantWords(item.color);
    const nameWords = significantWords(item.name);
    const candidates = items
      .slice(0, i)
      .filter((c) => c.category === item.category && !c.duplicate_of)
      .filter((c) => wordsOverlap(colorWords, significantWords(c.color)) || wordsOverlap(nameWords, significantWords(c.name)))
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      unchanged++;
      continue;
    }

    try {
      const itemPair = await photoPairFor(item);
      let matched = false;
      let candidateFailed = false;
      for (const candidate of candidates) {
        try {
          const candidatePair = await photoPairFor(candidate);
          const result = await compare(itemPair, candidatePair);
          if (result.verdict === "same" && result.confidence >= CONFIDENCE_THRESHOLD) {
            const { error: updateError } = await supabase
              .from("items")
              .update({ duplicate_of: candidate.id, duplicate_note: result.why, duplicate_confidence: result.confidence })
              .eq("id", item.id);
            if (updateError) throw new Error(updateError.message);
            console.log(`✅ ${label} → duplicate of "${candidate.name}" (${candidate.id.slice(0, 8)}), confidence ${result.confidence}`);
            console.log(`     "${result.why}"`);
            item.duplicate_of = candidate.id; // so later items don't chain off this one
            flagged++;
            matched = true;
            break;
          } else {
            console.log(`   ${label} vs "${candidate.name}": ${result.verdict} (${result.confidence}) — ${result.why}`);
          }
        } catch (e) {
          // One bad response (e.g. truncated JSON) shouldn't skip the rest of this item's
          // candidates — just note it and keep going.
          console.log(`   ${label} vs "${candidate.name}": comparison failed — ${e.message}`);
          candidateFailed = true;
        }
      }
      if (matched) {
        // already counted
      } else if (candidateFailed) {
        failed++;
      } else {
        unchanged++;
      }
    } catch (e) {
      console.log(`❌ ${label}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${flagged} flagged, ${unchanged} unchanged, ${failed} failed.`);
}

main();
