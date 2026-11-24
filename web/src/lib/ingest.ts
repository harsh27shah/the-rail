import "server-only";
import sharp from "sharp";
import type { TagPhotoResult, TaggedFields } from "./anthropic";
import type { PersonBox } from "./gemini";

/**
 * The two steps that decide what an uploaded photo turns into, pulled out of the Server
 * Actions (src/app/add/actions.ts) so each branch can be tested without any AI calls —
 * scripts/test-ingest.ts drives them with fake dependencies.
 *
 * Both exist because of one real report (PROJECT.md §5 item 24): a Google Photos import
 * silently catalogued the owner's girlfriend's coat without ever asking "which one is you?",
 * and gave another item the name "Untitled piece". Both traced back to the same chain —
 * a wrong image label made tagging fail, and a failed tag was quietly treated as "one
 * person, nothing known" — which is what these two functions now rule out.
 */

// ── 1. Trust the bytes, not the label ────────────────────────────────────────────────────

export interface NormalizedPhoto {
  base64: string;
  mimeType: string;
  /** The same bytes as a File carrying the *true* type — what gets stored, at full resolution. */
  file: File;
  /** What to send to the AI models: the same photo, shrunk if it is too big for them. */
  ai: { base64: string; mimeType: string };
}

/** The most the AI models will be sent: longest side in pixels, and bytes. Claude rejects any
 * single image over about 5 MB (and downsizes anything past ~1600 px itself, so nothing is lost
 * by shrinking first); Gemini takes more but is slower and dearer the bigger it is. */
const AI_MAX_SIDE = 2048;
const AI_MAX_BYTES = 3_500_000;

/**
 * A copy of a photo that is safe to send to the AI models. Photos already small enough come back
 * untouched (same bytes, same label). Bigger ones are shrunk and re-saved as JPEG, upright
 * (the orientation tag baked in, as everywhere else in the app: see lib/crop.ts). The wardrobe
 * keeps the full-resolution original either way; this copy is only ever sent for analysis.
 *
 * Found while fixing the 4.5 MB upload limit: a big photo that finally reached the server would
 * have been refused by Claude's 5 MB image limit, and the app would have quietly treated that as
 * "couldn't read it". The limit was always there, just never reached.
 */
export async function shrinkForAi(
  photo: { base64: string; mimeType: string },
  maxSide = AI_MAX_SIDE,
  maxBytes = AI_MAX_BYTES
): Promise<{ base64: string; mimeType: string }> {
  const buffer = Buffer.from(photo.base64, "base64");
  const meta = await sharp(buffer).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (buffer.length <= maxBytes && longest <= maxSide && (meta.orientation ?? 1) === 1) return photo;

  for (const quality of [85, 75, 65, 55]) {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.length <= maxBytes || quality === 55) return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  }
  return photo; // unreachable: the loop always returns on its last pass
}

const CLAUDE_FORMATS: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Works out what an upload really is from its bytes. Google Photos' Picker reports iPhone
 * photos as `image/heif` even when the file it hands back is plain JPEG; the upload used to
 * trust that label, and Claude rejects any media type outside jpeg/png/webp/gif with a 400 —
 * so every such photo failed tagging. Formats Claude can read are passed through untouched
 * (full resolution, original bytes) with the correct label; anything else sharp can decode
 * (real HEIC/AVIF/TIFF) is converted to a high-quality JPEG. Something that isn't an image
 * at all gets a plain-language error rather than a downstream failure.
 */
export async function normalizeUpload(photo: File): Promise<NormalizedPhoto> {
  const buffer = Buffer.from(await photo.arrayBuffer());

  let format: string | undefined;
  try {
    format = (await sharp(buffer).metadata()).format;
  } catch {
    throw new Error("that file isn't a photo we can read");
  }

  const known = format ? CLAUDE_FORMATS[format] : undefined;
  if (known) {
    const base64 = buffer.toString("base64");
    return { base64, mimeType: known, file: asFile(buffer, photo.name, known), ai: await shrinkForAi({ base64, mimeType: known }) };
  }

  try {
    // .rotate() bakes any EXIF orientation into the pixels, so nothing downstream (the
    // person-box crop especially — see lib/crop.ts) has to know the tag ever existed.
    const jpeg = await sharp(buffer).rotate().jpeg({ quality: 92 }).toBuffer();
    const base64 = jpeg.toString("base64");
    return { base64, mimeType: "image/jpeg", file: asFile(jpeg, photo.name, "image/jpeg"), ai: await shrinkForAi({ base64, mimeType: "image/jpeg" }) };
  } catch {
    throw new Error(`couldn't read that ${format ?? "image"} photo — try saving it as a JPEG first`);
  }
}

function asFile(buffer: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buffer)], name, { type });
}

// ── 2. Never guess "one person" ──────────────────────────────────────────────────────────

export type Analysis =
  | { kind: "garments"; garments: TaggedFields[] }
  | { kind: "needs-selection"; people: PersonBox[] }
  | { kind: "error"; error: string };

export interface AnalyseDeps {
  tag: (base64: string, mimeType: string) => Promise<TagPhotoResult>;
  detect: (base64: string, mimeType: string) => Promise<PersonBox[]>;
}

export const BLANK_GARMENT: TaggedFields = {
  name: "",
  category: "",
  color: "",
  palette: [],
  pattern: "",
  material: "",
  formality: 0,
  seasons: [],
  notes: "",
};

/**
 * Person detection is a generative call and varies run to run (2–6 boxes on the same real
 * photo), so one empty or thin answer isn't conclusive — try twice, stop early once there's
 * enough to ask "which one is you?", and keep the fuller answer. `null` means both attempts
 * threw, i.e. we genuinely don't know.
 */
async function detectWithRetry(
  detect: AnalyseDeps["detect"],
  base64: string,
  mimeType: string
): Promise<PersonBox[] | null> {
  let best: PersonBox[] | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const people = await detect(base64, mimeType);
      if (!best || people.length > best.length) best = people;
      if (best.length >= 2) break;
    } catch (e) {
      console.error(`Person detection attempt ${attempt} failed`, e);
    }
  }
  return best;
}

/**
 * Decides what one uploaded photo yields: garments to catalogue, a "which one is you?"
 * question, or an honest error.
 *
 * The rule that matters: **an unknown is never treated as "one person".** Before, a failed
 * tagging call fell back to "one person, blank garment", which skipped the multi-person check
 * entirely and handed the whole photo — everyone in it — to the extractor with nothing but
 * the words "Untitled piece" to say whose clothes to pick. Now a failed tag falls back to
 * person detection, and only a photo confirmed to have at most one person gets a blank
 * (editable) item. If the tagger says several people but detection can't locate two of them,
 * that's an error, not a guess — cataloguing from a photo we know contains someone else's
 * clothes is the one outcome this check exists to prevent.
 */
export async function analysePhoto(
  photo: { base64: string; mimeType: string },
  deps: AnalyseDeps
): Promise<Analysis> {
  let tagged: TagPhotoResult | null = null;
  try {
    tagged = await deps.tag(photo.base64, photo.mimeType);
  } catch (e) {
    console.error("Tagging failed", e);
  }

  if (tagged && tagged.peopleCount <= 1) {
    return { kind: "garments", garments: tagged.garments };
  }

  // Either several people, or tagging failed outright — in both cases we can't assume one.
  const people = await detectWithRetry(deps.detect, photo.base64, photo.mimeType);

  if (people && people.length >= 2) {
    return { kind: "needs-selection", people };
  }

  if (!tagged) {
    // Tagging failed. If detection ran and found at most one person, this is safely a
    // single-person (or no-person, e.g. flat-lay) photo: hang a blank piece to fill in.
    if (people) return { kind: "garments", garments: [BLANK_GARMENT] };
    return {
      kind: "error",
      error: "couldn't read that photo just now — nothing was added, try it again",
    };
  }

  // Tagger saw several people, detection couldn't find two.
  return {
    kind: "error",
    error: "there look to be several people in that photo but we couldn't tell them apart — nothing was added; try a photo of just you, or crop it first",
  };
}
