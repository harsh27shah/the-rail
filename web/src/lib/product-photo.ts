import "server-only";
import sharp, { type Sharp } from "sharp";

// Every card thumbnail on the storefront (and the pairing pills, and the duplicate-review
// rows) displays at a fixed 3:4 with `object-fit: cover` (see globals.css) — the browser
// centre-crops whatever image it's handed to fill that box. Matching a generated product
// photo's own canvas to that same ratio means `cover` never needs to crop anything away.
const CARD_RATIO = 3 / 4;

/**
 * Finds the tight bounding box of actual garment content in a generated product photo, by
 * comparing every pixel (on a small downscaled raster, for speed) against the photo's own
 * corner colour and keeping whichever rows/columns have enough pixels that differ from it.
 *
 * Replaced an earlier version of this file that used `sharp`'s built-in `trim()` for this.
 * Found in real use to be unreliable in both directions: on one real item it left the
 * garment occupying well under 70% of the frame (compared to ~90%+ for a normally-composed
 * item) while `trim()` reported nothing left to trim; escalating `trim()`'s threshold to
 * compensate helped that image but changed non-monotonically photo to photo — a threshold
 * that fixed one item's excess margin either did nothing or overshot on another, so there
 * was no single safe fixed (or even escalating) threshold. Comparing every pixel's actual
 * distance from the photo's own background colour, rather than trusting `trim()`'s internal
 * flood-fill heuristic, gave a tight, correct crop across every real case tried — including
 * near-white garments (a white sneaker, a white sweatshirt) against a similarly pale
 * background, which is the case most likely to be over-trimmed by an aggressive threshold.
 */
async function findContentBBox(
  buffer: Buffer,
  width: number,
  height: number
): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
  const RASTER = 300; // downscaled raster used for the pixel scan; scaled back up after
  const scale = RASTER / Math.max(width, height);
  const rasterWidth = Math.max(1, Math.round(width * scale));
  const rasterHeight = Math.max(1, Math.round(height * scale));

  const { data, info } = await sharp(buffer)
    .resize(rasterWidth, rasterHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;

  function pixelAt(x: number, y: number): [number, number, number] {
    const i = (y * rasterWidth + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  }
  const corners = [
    pixelAt(0, 0),
    pixelAt(rasterWidth - 1, 0),
    pixelAt(0, rasterHeight - 1),
    pixelAt(rasterWidth - 1, rasterHeight - 1),
  ];
  const bg = [0, 1, 2].map((c) => Math.round(corners.reduce((sum, p) => sum + p[c], 0) / corners.length));

  const DIST_THRESHOLD = 28; // per-pixel RGB distance to count as "different from background"
  const LINE_FRACTION = 0.015; // a row/column counts as "content" once >1.5% of it qualifies

  function distFromBg(p: [number, number, number]) {
    return Math.sqrt((p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2);
  }

  const colHits = new Array(rasterWidth).fill(0);
  const rowHits = new Array(rasterHeight).fill(0);
  for (let y = 0; y < rasterHeight; y++) {
    for (let x = 0; x < rasterWidth; x++) {
      if (distFromBg(pixelAt(x, y)) > DIST_THRESHOLD) {
        colHits[x]++;
        rowHits[y]++;
      }
    }
  }

  let left = 0;
  let right = rasterWidth - 1;
  let top = 0;
  let bottom = rasterHeight - 1;
  while (left < rasterWidth && colHits[left] / rasterHeight < LINE_FRACTION) left++;
  while (right > left && colHits[right] / rasterHeight < LINE_FRACTION) right--;
  while (top < rasterHeight && rowHits[top] / rasterWidth < LINE_FRACTION) top++;
  while (bottom > top && rowHits[bottom] / rasterWidth < LINE_FRACTION) bottom--;

  if (left >= right || top >= bottom) return null; // no content found — leave untouched

  // Scale the raster bbox back up to full resolution, with a small margin so the crop
  // doesn't hug the garment's edge exactly.
  const marginFraction = 0.04;
  const fullLeft = left / scale;
  const fullRight = (right + 1) / scale;
  const fullTop = top / scale;
  const fullBottom = (bottom + 1) / scale;
  const marginX = (fullRight - fullLeft) * marginFraction;
  const marginY = (fullBottom - fullTop) * marginFraction;
  return {
    left: Math.max(0, Math.round(fullLeft - marginX)),
    top: Math.max(0, Math.round(fullTop - marginY)),
    right: Math.min(width, Math.round(fullRight + marginX)),
    bottom: Math.min(height, Math.round(fullBottom + marginY)),
  };
}

/**
 * Samples the cropped photo's own background colour (averaging a few points inset from each
 * corner, so one noisy pixel right at the crop boundary can't skew it) instead of using a
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

  const sourceMeta = await sharp(buffer).metadata();
  let working = buffer;
  if (sourceMeta.width && sourceMeta.height) {
    try {
      const bbox = await findContentBBox(buffer, sourceMeta.width, sourceMeta.height);
      if (bbox) {
        working = await sharp(buffer)
          .extract({ left: bbox.left, top: bbox.top, width: bbox.right - bbox.left, height: bbox.bottom - bbox.top })
          .toBuffer();
      }
    } catch {
      // Bounding-box detection failed for some reason — proceed with the untouched image.
    }
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
