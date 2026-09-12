import "server-only";
import sharp from "sharp";

// Every card thumbnail on the storefront (and the pairing pills, and the duplicate-review
// rows) displays at a fixed 3:4 with `object-fit: cover` (see globals.css) — the browser
// centre-crops whatever image it's handed to fill that box. Matching a generated product
// photo's own canvas to that same ratio means `cover` never needs to crop anything away.
const CARD_RATIO = 3 / 4;

// Matches --card in globals.css. Gemini's extraction prompt already asks for "a plain,
// light neutral studio background", so padding with this exact tone reads as a seamless
// continuation of that background rather than a visible letterbox bar.
const PAD_BACKGROUND = { r: 247, g: 246, b: 242 };

/**
 * Tightens an AI-generated product photo around its actual content, then letterboxes it to
 * the app's card aspect ratio. Found necessary in real use (a two-person photo cropped down
 * to one person via the multi-person flow, PROJECT.md §5 item 18): Gemini's isolated product
 * shots don't reliably fill their own canvas or land on any particular aspect ratio —
 * sometimes leaving the garment as a small island in a mostly-blank, unusually tall canvas.
 * Every card on the storefront displays at a fixed 3:4 with `object-fit: cover`, which
 * centre-crops whatever it's given — so a perfectly fine generated photo could still render
 * half cut-off in the UI purely because its canvas shape didn't match the display box.
 * `trim()` removes the excess plain background first; the letterbox step then guarantees the
 * final image's own ratio already matches the card's, so `cover` never crops anything away.
 * Best-effort: if trimming fails (no uniform border to find) or dimensions can't be read,
 * falls back to the untouched image rather than failing the whole extraction over a
 * cosmetic step.
 */
export async function normalizeProductPhoto(
  base64: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  const buffer = Buffer.from(base64, "base64");

  let working = buffer;
  try {
    working = await sharp(buffer).trim({ threshold: 12 }).toBuffer();
  } catch {
    // No uniform border to trim, or trim otherwise failed — proceed untrimmed.
  }

  const meta = await sharp(working).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { data: base64, mimeType };

  const ratio = width / height;
  const targetWidth = ratio > CARD_RATIO ? width : Math.round(height * CARD_RATIO);
  const targetHeight = ratio > CARD_RATIO ? Math.round(width / CARD_RATIO) : height;

  const out = await sharp(working)
    .resize(targetWidth, targetHeight, { fit: "contain", background: PAD_BACKGROUND })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { data: out.toString("base64"), mimeType: "image/jpeg" };
}
