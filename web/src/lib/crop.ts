import "server-only";
import sharp from "sharp";
import type { PersonBox } from "./gemini";

export interface CroppedImage {
  data: string; // base64
  mimeType: string;
}

/**
 * Crops a photo down to one person's region, given a normalized (0-1000) bounding box from
 * detectPeople (lib/gemini.ts) — turns "tap the box that's you" (src/app/add/actions.ts)
 * into an ordinary single-person photo that flows through the ordinary tagging/extraction
 * pipeline unchanged. A real pixel crop, not a Gemini re-generation — deliberately, so
 * nothing about the garment can drift the way a regeneration sometimes does (see the
 * duplicate-detection saga in PROJECT.md §5 for why that's a real risk, not a theoretical
 * one). Pads generously around the detected box (bounding boxes are approximate, not
 * pixel-exact, and a tight crop risks slicing off a sleeve or a shoe) and clamps to the
 * image's real bounds.
 */
export async function cropToPersonBox(
  base64Image: string,
  mimeType: string,
  box: PersonBox["box"],
  paddingFraction = 0.15
): Promise<CroppedImage> {
  // A phone photo taken in portrait is very often stored as raw landscape pixel data plus
  // an EXIF orientation tag telling a viewer to rotate it — sharp's own metadata()/extract()
  // read that raw, unrotated pixel grid unless told otherwise. detectPeople's box (Gemini),
  // like any normal image viewer, is computed against the photo the way a person actually
  // sees it — the *oriented* view — so applying its percentages to the raw grid silently
  // crops the wrong region entirely. Confirmed directly: a real multi-person photo with this
  // kind of EXIF tag produced a crop containing only the tapped person's head and torso, with
  // their trousers and shoes (fully visible in the real photo) cut off outside the wrongly-
  // computed region — matching a real report before this fix. `.rotate()` with no arguments
  // bakes the EXIF rotation into the actual pixel data (and clears the tag), so every
  // calculation below and the final extract both operate on the same, correctly-oriented
  // image that produced the box in the first place.
  const buffer = await sharp(Buffer.from(base64Image, "base64")).rotate().toBuffer();
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("Could not read the photo's dimensions");

  const [ymin, xmin, ymax, xmax] = box;
  const boxLeft = (xmin / 1000) * width;
  const boxTop = (ymin / 1000) * height;
  const boxWidth = ((xmax - xmin) / 1000) * width;
  const boxHeight = ((ymax - ymin) / 1000) * height;

  const padX = boxWidth * paddingFraction;
  const padY = boxHeight * paddingFraction;

  const left = Math.max(0, Math.round(boxLeft - padX));
  const top = Math.max(0, Math.round(boxTop - padY));
  const right = Math.min(width, Math.round(boxLeft + boxWidth + padX));
  const bottom = Math.min(height, Math.round(boxTop + boxHeight + padY));

  const cropped = await sharp(buffer)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .jpeg({ quality: 92 })
    .toBuffer();

  return { data: cropped.toString("base64"), mimeType: "image/jpeg" };
}
