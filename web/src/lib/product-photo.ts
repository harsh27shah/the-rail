import "server-only";
import sharp, { type Sharp } from "sharp";

// Every card thumbnail on the storefront (and the pairing pills, and the duplicate-review
// rows) displays at a fixed 3:4 with `object-fit: cover` (see globals.css) — the browser
// centre-crops whatever image it's handed to fill that box. Matching a generated product
// photo's own canvas to that same ratio means `cover` never needs to crop anything away.
const CARD_RATIO = 3 / 4;

/**
 * Samples the trimmed photo's own background colour (averaging a few points inset from each
 * corner, so one noisy pixel right at the trim boundary can't skew it) instead of using a
 * fixed pad colour. Found necessary in real use: Gemini's "plain, light neutral studio
 * background" isn't one consistent colour across generations — a warm cream in one photo, a
 * cooler grey in another — so a single fixed pad colour created a visibly different-toned
 * band exactly where our letterbox padding met the real generated background. Matching each
 * photo's own tone instead makes the seam disappear.
 */
async function sampleBackgroundColor(image: Sharp, width: number, height: number) {
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.01));
  const points: [number, number][] = [
    [inset, inset],
    [width - inset - 1, inset],
    [inset, height - inset - 1],
    [width - inset - 1, height - inset - 1],
  ];
  let r = 0,
    g = 0,
    b = 0;
  for (const [left, top] of points) {
    const pixel = await image.clone().extract({ left, top, width: 1, height: 1 }).raw().toBuffer();
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  return { r: Math.round(r / points.length), g: Math.round(g / points.length), b: Math.round(b / points.length) };
}

/**
 * Tightens an AI-generated product photo around its actual content, then letterboxes it to
 * the app's card aspect ratio using a background colour sampled from the photo itself. Found
 * necessary in real use (a two-person photo cropped down to one person via the multi-person
 * flow, PROJECT.md §5 item 18): Gemini's isolated product shots don't reliably fill their own
 * canvas or land on any particular aspect ratio — sometimes leaving the garment as a small
 * island in a mostly-blank, unusually tall canvas. Every card on the storefront displays at a
 * fixed 3:4 with `object-fit: cover`, which centre-crops whatever it's given — so a perfectly
 * fine generated photo could still render half cut-off in the UI purely because its canvas
 * shape didn't match the display box. `trim()` removes the excess plain background first;
 * the letterbox step then guarantees the final image's own ratio already matches the card's,
 * so `cover` never crops anything away — and sampling the pad colour from the photo itself
 * (rather than a fixed value, see sampleBackgroundColor above) means that letterboxing
 * doesn't introduce a visible seam of its own. Best-effort throughout: if trimming fails (no
 * uniform border to find), sampling fails, or dimensions can't be read, falls back to the
 * untouched image rather than failing the whole extraction over a cosmetic step.
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

  let background = { r: 247, g: 246, b: 242 }; // --card, used only if sampling fails
  try {
    background = await sampleBackgroundColor(sharp(working), width, height);
  } catch {
    // Fall back to the fixed neutral above.
  }

  const out = await sharp(working)
    .resize(targetWidth, targetHeight, { fit: "contain", background })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { data: out.toString("base64"), mimeType: "image/jpeg" };
}
