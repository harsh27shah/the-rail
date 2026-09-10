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
 "notes":"one short line on styling character",
 "occluded":true or false,
 "occludedNote":"if occluded is true, one short phrase naming what you had to infer rather than see; otherwise empty string"}`;

// The app is British-English throughout (a deliberate design choice, see PROJECT.md) — every
// free-text field below is rendered straight into the UI, so the model needs to be told
// explicitly, not just shown "colour" once in the schema key description above.
const BRITISH_ENGLISH_NOTE =
  `Write every text value in British English spelling (e.g. "grey" not "gray", "colour" ` +
  `not "color"), not American.`;

// The palette swatches render directly in the UI (the small colour chips under each item's
// hover card, and will eventually drive colour-based sorting/filtering) — they should match
// how a person would actually describe the garment's colour, not a literal pixel survey.
// Two failure modes found in real use: (1) a solid-coloured garment tagged with two
// near-identical hexes, because the schema's own array shape nudges the model toward always
// filling two slots; (2) small incidental details — a jacket's brass rivets, a jumper's tiny
// embroidered logo — counted as a genuine second "colour" of the garment, which is technically
// true but not what anyone means by "what colour is this". Both are addressed below.
const PALETTE_NOTE =
  `For "palette": list only the colour(s) a person would actually use to describe this ` +
  `garment at a glance — not a literal survey of every pixel. Ignore small hardware and ` +
  `trim details entirely, even if they're a technically different colour: buttons, rivets, ` +
  `zips, zip pulls, snaps, drawstrings, stitching thread, and small embroidered logos or ` +
  `brand marks never count as a garment colour. A plain solid-coloured garment should have ` +
  `exactly ONE hex code — never add a second, slightly different shade of the same colour ` +
  `just to fill the array. Only include a second or third hex when there's a real, ` +
  `substantial second colour covering a meaningful part of the garment (e.g. a contrast ` +
  `collar/panel, colour-blocking, stripes, or a print) — and even then, list at most the 2-3 ` +
  `most dominant colours, ordered by how much of the garment they cover; skip minor accent ` +
  `flecks or thin lines in a pattern that a person wouldn't mention when describing it (e.g. ` +
  `an orange-and-black check with a few thin yellow lines is "orange, black", not "orange, ` +
  `black, yellow").`;

// Categories were deliberately reduced to Tops/Bottoms/Outerwear/Footwear/Accessories (see
// PROJECT.md §5) — there's no separate bucket for knitwear (a fabric, not a layering role),
// suiting (out of scope — this app is positioned for casual/smart-casual, not black-tie or
// office suits), or activewear (out of scope — not a gym-log app). Every garment still gets
// catalogued; it's just classified by what it actually is.
const CATEGORY_NOTE =
  `For "category", choose only from the schema's fixed list — there is no separate ` +
  `"knitwear", "suiting", or "activewear" category. For a knit garment (jumper, cardigan, ` +
  `quarter-zip, sweatshirt), decide by how it's actually worn: if it's typically the ` +
  `outermost layer over another top (a chunky cardigan, a heavy overshirt), it's ` +
  `"Outerwear"; if it typically functions as the top itself (worn alone or as the main ` +
  `layer), it's "Tops". A blazer or suit jacket is "Outerwear"; suit trousers are ` +
  `"Bottoms" — formality captures how dressy it is, not a separate category. Gym-specific ` +
  `pieces (athletic tee, leggings, running shorts) are catalogued the same as any other ` +
  `garment — "Tops" or "Bottoms" by ordinary function, not a separate category.`;

// When a garment is only partly visible (a t-shirt mostly hidden under an overshirt, a
// cropped photo, a folded item), the model fills in the unseen parts — and gets them wrong
// in ways the owner would catch instantly (long sleeves on what's actually a short-sleeve
// tee). Have it flag that so the UI can nudge the owner to verify, rather than presenting a
// guess as fact.
const OCCLUSION_NOTE =
  `Set "occluded" to true when a meaningful part of the garment is NOT actually visible in ` +
  `the photo — hidden behind another layer, cropped out of frame, or folded/bunched so its ` +
  `shape can't be read — and you therefore had to infer details (sleeve length, hem, ` +
  `neckline, full cut) rather than see them. When it's true, put a short phrase in ` +
  `"occludedNote" naming what was inferred (e.g. "sleeve length hidden under jacket"). If ` +
  `the whole garment is clearly visible, set "occluded" to false and "occludedNote" to "".`;

const PROMPT =
  `This photo may show a person wearing multiple distinct garments that should each become ` +
  `a separate wardrobe entry — most commonly a top and a bottom (e.g. a shirt and jeans), ` +
  `sometimes also a distinct third layer such as a jacket or cardigan. Identify every ` +
  `separately-catalogable main garment visible (tops, bottoms, outerwear, footwear) and ` +
  `catalogue each one individually and specifically — do not merge them into a single ` +
  `entry. Skip minor accessories (jewellery, watches, bags) unless one is clearly the main ` +
  `subject of the photo. If genuinely only one distinct garment is visible, return an ` +
  `array containing just that one object. ${BRITISH_ENGLISH_NOTE} ${PALETTE_NOTE} ` +
  `${CATEGORY_NOTE} ${OCCLUSION_NOTE}\n\n` +
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
  occluded?: boolean;
  occludedNote?: string;
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
  `sweatshirt, catalogue it as a t-shirt). ${BRITISH_ENGLISH_NOTE} ${PALETTE_NOTE} ` +
  `${CATEGORY_NOTE} ${OCCLUSION_NOTE} Return ONLY a single JSON object (not an array), no ` +
  `prose and no markdown fences, using this schema:\n${ITEM_SCHEMA}`;

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
