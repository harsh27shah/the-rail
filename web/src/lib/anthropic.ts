import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "./types";

/**
 * Server-only AI tagging. Ported from the retired prototype's `callClaude`/`readPhoto`
 * (PROJECT.md §4), but now the API key lives on the server (env var) instead of being
 * pasted into the browser by whoever's using the app.
 *
 * Tags *every* distinct garment in a photo, not just one — a photo of someone wearing an
 * outfit commonly shows a top and a bottom (sometimes a third outer layer too), and each
 * should become its own wardrobe item. See PROJECT.md §5 / §2 item 1 (this is the original
 * "bulk extraction from outfit photos" ingestion strategy, not a new idea).
 */

const ITEM_SCHEMA = `{"name":"short descriptive name, max 5 words",
 "category":"one of: ${CATEGORIES.join(", ")}",
 "color":"primary colour in plain words",
 "palette":["#hex", "...only if genuinely another distinct colour is visible"],
 "pattern":"solid|striped|checked|printed|textured",
 "material":"best guess",
 "formality":1-5 where 1 is lounge and 5 is formal,
 "seasons":["spring","summer","autumn","winter"],
 "notes":"one short line on styling character"}`;

// The app is British-English throughout (a deliberate design choice, see PROJECT.md) — every
// free-text field below is rendered straight into the UI, so the model needs to be told
// explicitly, not just shown "colour" once in the schema key description above.
const BRITISH_ENGLISH_NOTE =
  `Write every text value in British English spelling (e.g. "grey" not "gray", "colour" ` +
  `not "color"), not American.`;

// The palette swatches render directly in the UI (the small colour chips under each item's
// hover card) — a solid-coloured garment that gets tagged with two near-identical hexes
// shows as two visibly different swatches, which reads as wrong even though it's subtle.
// Worth spelling out explicitly since the schema's own array shape otherwise nudges the
// model toward always filling two slots.
const PALETTE_NOTE =
  `For "palette": list only colours that are genuinely, visibly distinct on the garment. A ` +
  `plain solid-coloured garment should have exactly ONE hex code — do not add a second, ` +
  `slightly different shade of the same colour just to fill the array. Only include a ` +
  `second or third hex when there's a real, clearly separate colour on the garment (e.g. ` +
  `contrast trim, a colour-blocked panel, stripes, or a print).`;

const PROMPT =
  `This photo may show a person wearing multiple distinct garments that should each become ` +
  `a separate wardrobe entry — most commonly a top and a bottom (e.g. a shirt and jeans), ` +
  `sometimes also a distinct third layer such as a jacket or blazer. Identify every ` +
  `separately-catalogable main garment visible (tops, knitwear, bottoms, outerwear, ` +
  `suiting, footwear) and catalogue each one individually and specifically — do not merge ` +
  `them into a single entry. Skip minor accessories (jewellery, watches, bags) unless one ` +
  `is clearly the main subject of the photo. If genuinely only one distinct garment is ` +
  `visible, return an array containing just that one object. ${BRITISH_ENGLISH_NOTE} ` +
  `${PALETTE_NOTE}\n\n` +
  `Return ONLY a JSON array, no prose and no markdown fences — one object per garment, ` +
  `each using this schema:\n${ITEM_SCHEMA}`;

export interface TaggedFields {
  name: string;
  category: string;
  color: string;
  palette: string[];
  pattern: string;
  material: string;
  formality: number;
  seasons: string[];
  notes: string;
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — see .env.local.example");
  return new Anthropic({ apiKey });
}

function parseJsonArrayReply(text: string): TaggedFields[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("The model didn't return a JSON array");
  const parsed = JSON.parse(clean.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
  return parsed;
}

const RETAG_PROMPT = (feedback: string) =>
  `This is a corrected product photo of a single wardrobe item. It was just regenerated ` +
  `because the owner gave this feedback about what was wrong with the previous version: ` +
  `"${feedback}". Catalogue this item fresh, based on what is actually visible in this ` +
  `photo and on the feedback above — don't just repeat old assumptions if the photo or ` +
  `the feedback contradicts them (e.g. if the feedback says it's a t-shirt, not a ` +
  `sweatshirt, catalogue it as a t-shirt). ${BRITISH_ENGLISH_NOTE} ${PALETTE_NOTE} Return ` +
  `ONLY a single JSON object (not an array), no prose and no markdown fences, using this ` +
  `schema:\n${ITEM_SCHEMA}`;

function parseJsonObjectReply(text: string): TaggedFields {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model didn't return a JSON object");
  return JSON.parse(clean.slice(start, end + 1));
}

/**
 * Re-catalogues a single item after its photo has been corrected via user feedback
 * (src/app/item/[id]/correct-actions.ts). A correction only ever asked Gemini to fix the
 * *image* — nothing previously re-checked whether the feedback also implied the item's
 * stored name/category/material/etc. were wrong (e.g. "it's not a sweatshirt, it's a
 * t-shirt" should change the catalogued name, not just the photo). This re-tags from the
 * corrected photo plus the feedback text so those fields can catch up too.
 */
export async function retagItem(
  base64: string,
  mediaType: string,
  feedback: string
): Promise<TaggedFields> {
  const message = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: RETAG_PROMPT(feedback) },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseJsonObjectReply(text);
}

/** Tags every distinct garment in a photo. `base64` is raw base64 image data (no data:
 * prefix). Always returns at least one entry when successful — falls back to a single
 * best-effort entry if the model can't confidently separate multiple garments. */
export async function tagPhoto(base64: string, mediaType: string): Promise<TaggedFields[]> {
  const message = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: base64,
            },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const items = parseJsonArrayReply(text);
  if (items.length === 0) throw new Error("No garments found in the photo");
  return items;
}
