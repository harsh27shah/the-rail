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

// Categories were deliberately reduced to Tops/Bottoms/Outerwear/Footwear (see PROJECT.md
// §5) — there's no separate bucket for knitwear (a fabric, not a layering role), suiting
// (out of scope — this app is positioned for casual/smart-casual, not black-tie or office
// suits), or activewear (out of scope — not a gym-log app). Every garment still gets
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

// Found in real use: a photo cropped down to one person at a hotpot table left almost
// nothing of their trousers visible above the table edge — no cut, hem, or texture, just a
// patch of dark fabric — and the tagger still confidently invented a material, pattern, and
// formality for it, which then got flagged as a false duplicate of an unrelated pair of
// trousers (the "match" was really just "both are black"). The OCCLUSION_NOTE mechanism
// below is the right tool when a garment is still identifiable despite some hidden part (see
// its own comment); it's the wrong tool when NOTHING distinctive is visible at all. This is
// a harder gate that runs first: below this bar, the garment is left out of the response
// entirely rather than catalogued with invented specifics. Deliberately stricter than
// OCCLUSION_NOTE, not a replacement for it — most partially-hidden garments (a tee under an
// open jacket, a cropped sleeve) still have a visible pattern/cut/neckline and should still
// be catalogued and flagged, just not invented from nothing.
const TOO_OCCLUDED_NOTE =
  `Before including a garment, check whether at least one defining detail of it is actually ` +
  `visible — its cut, hem, silhouette, closures, hardware, or pattern — not just a rough ` +
  `colour and category. If a garment is so hidden (behind furniture, another person, mostly ` +
  `out of frame, under a table) that all you could honestly say is something like "dark ` +
  `trousers" with nothing more specific, do NOT include it in "garments" at all — leave it ` +
  `out entirely rather than inventing a plausible-sounding material, pattern, or fit for it. ` +
  `This is a stricter bar than "occluded" below: "occluded" is for a garment you CAN still ` +
  `identify specifically (you can see its cut, fabric, or pattern) but with some part hidden ` +
  `(a sleeve length, a hem) that you have to infer — that garment should still be ` +
  `catalogued, just flagged. Only leave a garment out completely when nothing distinctive ` +
  `about it is visible at all.`;

// When a garment is only partly visible (a t-shirt mostly hidden under an overshirt, a
// cropped photo, a folded item) but still has enough visible to identify specifically, the
// model fills in the unseen parts — and gets them wrong in ways the owner would catch
// instantly (long sleeves on what's actually a short-sleeve tee). Have it flag that so the
// UI can nudge the owner to verify, rather than presenting a guess as fact. See
// TOO_OCCLUDED_NOTE above for the stricter bar that runs first and excludes a garment
// entirely when even this level of inference isn't possible.
const OCCLUSION_NOTE =
  `Set "occluded" to true when a meaningful part of the garment is NOT actually visible in ` +
  `the photo — hidden behind another layer, cropped out of frame, or folded/bunched so its ` +
  `shape can't be read — and you therefore had to infer details (sleeve length, hem, ` +
  `neckline, full cut) rather than see them. When it's true, put a short phrase in ` +
  `"occludedNote" naming what was inferred (e.g. "sleeve length hidden under jacket"). If ` +
  `the whole garment is clearly visible, set "occluded" to false and "occludedNote" to "".`;

// A photo with more than one person in it (a friend, a stranger in the background wearing
// a distinct outfit) shouldn't get its garments catalogued at all — see PROJECT.md §5 for
// why: it's how another person's clothes silently end up in the owner's wardrobe, confirmed
// directly against a real multi-person test photo before this was added. `peopleCount` rides
// along on this same call (no extra request, no extra latency on the common single-person
// case) — `src/app/add/actions.ts` only makes the separate, costlier per-person bounding-box
// call (see detectPeople in lib/gemini.ts) on the rarer photos that actually need it.
const PEOPLE_COUNT_NOTE =
  `Also count how many DIFFERENT people have clothing visible in the photo, as ` +
  `"peopleCount" — someone barely visible or heavily cropped in the background still ` +
  `counts if their clothing is identifiable. If peopleCount is more than 1, still return ` +
  `"garments" as an empty array — don't attempt to catalogue anyone's clothing in that ` +
  `case, since there's no reliable way to know which person's items should count.`;

// Used once the owner has already tapped "this one is me" on a cropped-down photo
// (src/app/add/actions.ts's addPhotoWithPersonAction). A tight crop around one person can
// still catch a sliver of whoever was standing next to them — confirmed directly: cropping
// to just the tapped person still had Claude reporting peopleCount 2 and (correctly, by the
// first-pass rule above) zeroing out the garments, silently cataloguing nothing at all.
// That rule is right for a fresh, un-disambiguated photo; it's wrong once the owner has
// already told us which person to focus on. This variant drops the peopleCount gate
// entirely and just tells it who to look at.
const FOCUS_MAIN_PERSON_NOTE =
  `This photo has already been cropped to focus on one specific person, but someone else ` +
  `may still be barely visible at the very edge of the frame. Ignore that person ` +
  `completely — only catalogue the clothing of the main person filling most of the frame.`;

function buildPrompt(mode: "detect-people" | "single-person"): string {
  const peopleHandling = mode === "detect-people" ? PEOPLE_COUNT_NOTE : FOCUS_MAIN_PERSON_NOTE;
  const schema =
    mode === "detect-people"
      ? `{"peopleCount": <integer>, "garments": [ /* one object per garment, each using ` +
        `this schema */ ${ITEM_SCHEMA} ]}`
      : `{"garments": [ /* one object per garment, each using this schema */ ${ITEM_SCHEMA} ]}`;
  return (
    `This photo may show a person wearing multiple distinct garments that should each ` +
    `become a separate wardrobe entry — most commonly a top and a bottom (e.g. a shirt and ` +
    `jeans), sometimes also a distinct third layer such as a jacket or cardigan. Identify ` +
    `every separately-catalogable main garment visible (tops, bottoms, outerwear, ` +
    `footwear) and catalogue each one individually and specifically — do not merge them ` +
    `into a single entry. Skip accessories entirely — jewellery, watches, bags, belts — ` +
    `even if one is clearly the main subject of the photo; this app doesn't catalogue ` +
    `those for now. If genuinely only one distinct garment is visible, return an array ` +
    `containing just that one object. ${BRITISH_ENGLISH_NOTE} ${PALETTE_NOTE} ` +
    `${CATEGORY_NOTE} ${TOO_OCCLUDED_NOTE} ${OCCLUSION_NOTE} ${peopleHandling}\n\n` +
    `Return ONLY a JSON object, no prose and no markdown fences, shaped exactly like:\n${schema}`
  );
}

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

export interface TagPhotoResult {
  peopleCount: number;
  garments: TaggedFields[];
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set — see .env.local.example");
  return new Anthropic({ apiKey });
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

function parseTagPhotoReply(text: string): TagPhotoResult {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model didn't return a JSON object");
  const parsed = JSON.parse(clean.slice(start, end + 1));
  return {
    peopleCount: typeof parsed.peopleCount === "number" ? parsed.peopleCount : 1,
    garments: Array.isArray(parsed.garments) ? parsed.garments : [],
  };
}

/**
 * Tags every distinct garment in a photo, and (in "detect-people" mode) reports how many
 * different people have clothing visible — `garments` is deliberately empty when
 * `peopleCount` is more than 1 in that mode (see PEOPLE_COUNT_NOTE above). `base64` is raw
 * base64 image data (no data: prefix).
 *
 * `mode` defaults to `"detect-people"` — the normal path for a fresh upload
 * (src/app/add/actions.ts's addPhotoAction). Pass `"single-person"` once the owner has
 * already tapped "this one is me" on a cropped photo (addPhotoWithPersonAction) — that
 * mode ignores anyone else who might still be barely visible at the crop's edge instead of
 * re-triggering the peopleCount gate, which would otherwise silently catalogue nothing at
 * all a second time (confirmed as a real failure mode before this mode existed — a tight
 * crop around one person can still catch a sliver of whoever was next to them).
 *
 * Always returns at least one entry in `garments` on success when a result would otherwise
 * be non-empty — falls back to a single best-effort entry if the model can't confidently
 * separate multiple garments.
 */
export async function tagPhoto(
  base64: string,
  mediaType: string,
  mode: "detect-people" | "single-person" = "detect-people"
): Promise<TagPhotoResult> {
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
          { type: "text", text: buildPrompt(mode) },
        ],
      },
    ],
  });
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const result = parseTagPhotoReply(text);
  if (result.peopleCount <= 1 && result.garments.length === 0) {
    throw new Error("No garments found in the photo");
  }
  return result;
}

// Duplicate detection (PROJECT.md §5) — went through three designs before landing here,
// each validated empirically against the owner's real wardrobe before shipping:
//   1. Compare each item's current `image_path` (whatever it happens to be right now).
//      Missed several genuine duplicates from one bulk upload: a candidate created moments
//      earlier can still be mid-extraction when this runs, so a fresh isolated photo got
//      compared against another item's still-raw upload.
//   2. Compare `original_image_path` on both sides instead — always available, never
//      changes. Worse, not better: a photo showing several garments (an ordinary mirror-
//      selfie upload) gives every garment detected in it its own copy of that same multi-
//      subject scene as its "original", so comparing two items' originals often compares
//      whichever garment is most visually prominent in each scene, not the one in question.
//      Confirmed directly: it flagged a t-shirt as a duplicate of an unrelated jacket because
//      both original photos happened to feature a similar-looking coat elsewhere in frame.
//   3. Compare only the extracted (isolated single-garment) photos — correctly avoids the
//      wrong-subject problem, but under-detects: two independent Gemini generations of the
//      same real garment can render it differently enough (crop, exact shade, a logo detail)
//      that the comparison misses confirmed real duplicates.
// Landed on: send BOTH photos for BOTH items (original for true context + ground truth,
// isolated for a clean single-garment view) and ask for one verdict, explicitly told to
// trust the original when they seem to disagree. Re-validated against the same real pairs:
// caught every confirmed duplicate the first two designs individually missed, at 0.85-0.98
// confidence, while still correctly calling the t-shirt/jacket pair "different" (0.98).
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

export interface GarmentComparison {
  verdict: "same" | "different";
  confidence: number;
  why: string;
}

export interface GarmentPhotoPair {
  /** The true upload — may show a person wearing several garments at once. */
  original: { base64: string; mimeType: string };
  /** The cleaned-up, isolated single-garment shot. */
  extracted: { base64: string; mimeType: string };
}

function imageBlock(image: { base64: string; mimeType: string }) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: image.base64,
    },
  };
}

/** Asks whether two garments — each represented by its original upload plus its isolated
 * product shot — are the same physical item. Used to flag suspected duplicates for review
 * (src/app/duplicates) — never to auto-delete anything. */
export async function compareGarmentPhotos(a: GarmentPhotoPair, b: GarmentPhotoPair): Promise<GarmentComparison> {
  const message = await client().messages.create({
    model: "claude-sonnet-5",
    // 300 was too tight for this richer 4-image prompt — it sometimes reasons at more
    // length before the JSON and got cut off mid-object often enough to matter (4 of 27
    // comparisons truncated in the backfill that validated this design).
    max_tokens: 600,
    messages: [
      {
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
      },
    ],
  });
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model didn't return a JSON object");
  return JSON.parse(text.slice(start, end + 1));
}
