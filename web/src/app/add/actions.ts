"use server";

import { after } from "next/server";
import { compareGarmentPhotos, tagPhoto, type TagPhotoResult, type TaggedFields } from "@/lib/anthropic";
import { cropToPersonBox } from "@/lib/crop";
import { detectPeople, extractGarmentImage, type PersonBox } from "@/lib/gemini";
import { createItem, downloadImage, findDuplicateCandidates, flagDuplicate, replaceItemImage } from "@/lib/items";
import { asCategory, asPattern, asSeasons } from "@/lib/tag-fields";

// A "same" verdict below this confidence isn't flagged — Claude's own calibration puts
// genuine matches at 0.75+ and confidently-different pairs at 0.98+ (see PROJECT.md §5's
// spike notes), so this is a wide safety margin, not a tight threshold.
const DUPLICATE_CONFIDENCE_THRESHOLD = 0.6;

export type AddPhotoResult =
  | { kind: "added"; ids: string[] }
  | { kind: "error"; error: string }
  | { kind: "needs-selection"; people: PersonBox[] };

const BLANK_FALLBACK: TaggedFields = {
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
 * Catalogues ONE photo — which may still contain several distinct garments (see
 * catalogueGarments below). The Add flow (src/components/AddPhotosForm.tsx) calls this once
 * per selected photo, in sequence, rather than posting an entire multi-photo selection in a
 * single request: a batch of full-resolution phone photos would blow straight past the
 * Server Action body-size limit — and Vercel's own request-body ceiling — in production,
 * even though it works locally. One photo per request keeps every request small and every
 * function invocation short (tagging only; the image extraction still runs in the background
 * via after()). The client drives the loop, the progress display, and the navigation.
 *
 * If the photo shows more than one person with visible clothing, nothing gets catalogued
 * automatically — that's how another person's clothes would silently end up in the owner's
 * wardrobe, confirmed as a real failure mode before this check existed (PROJECT.md §5).
 * Instead this returns `needs-selection` with each person's approximate location, and the
 * client asks "which one is you?" (src/components/AddPhotosForm.tsx) before calling
 * addPhotoWithPersonAction below with the answer. Purely spatial ("where is each body in
 * this one photo, right now") — nothing about what anyone looks like is ever stored or
 * reused across photos.
 */
export async function addPhotoAction(formData: FormData): Promise<AddPhotoResult> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = photo.type || "image/jpeg";

    // Tagging is best-effort — if it fails, one untitled piece still gets hung on the rail
    // with the original photo, and the owner can fill it in from the edit page. Matches the
    // retired prototype's stance that auto-tagging will get things wrong sometimes, and the
    // edit path is never optional (PROJECT.md §4).
    let tagResult: TagPhotoResult;
    try {
      tagResult = await tagPhoto(base64, mimeType);
    } catch {
      tagResult = { peopleCount: 1, garments: [BLANK_FALLBACK] };
    }

    if (tagResult.peopleCount > 1) {
      try {
        const people = await detectPeople(base64, mimeType);
        if (people.length > 0) {
          return { kind: "needs-selection", people };
        }
        // Detection itself found nobody usable — fall through and try a normal single pass
        // rather than dead-ending the upload entirely.
      } catch (e) {
        console.error("Person detection failed", e);
      }
    }

    return await catalogueGarments(tagResult.garments, photo, base64, mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong reading that photo" };
  }
}

/**
 * Step two of the multi-person flow: the owner tapped the box that's them in
 * addPhotoAction's "needs-selection" response. Crops the ORIGINAL photo down to that one
 * region — a real pixel crop (lib/crop.ts), not a Gemini regeneration, deliberately, so
 * nothing about the garment can drift the way a regeneration sometimes does (see the
 * duplicate-detection saga in PROJECT.md §5 for why that's a real risk) — then runs the
 * crop through the exact same pipeline as any solo photo. The full multi-person photo is
 * never stored; only the crop becomes this item's photo, so whoever else was in the
 * original frame never touches storage at all.
 */
export async function addPhotoWithPersonAction(formData: FormData): Promise<AddPhotoResult> {
  const photo = formData.get("photo");
  const boxRaw = formData.get("box");
  if (!(photo instanceof File) || photo.size === 0) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  let box: PersonBox["box"];
  try {
    const parsed = JSON.parse(String(boxRaw));
    if (!Array.isArray(parsed) || parsed.length !== 4) throw new Error("bad shape");
    box = parsed as PersonBox["box"];
  } catch {
    return { kind: "error", error: "That selection didn't come through right — try again" };
  }

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const originalBase64 = buffer.toString("base64");
    const originalMimeType = photo.type || "image/jpeg";
    const cropped = await cropToPersonBox(originalBase64, originalMimeType, box);

    let tagResult: TagPhotoResult;
    try {
      tagResult = await tagPhoto(cropped.data, cropped.mimeType, "single-person");
    } catch {
      tagResult = { peopleCount: 1, garments: [BLANK_FALLBACK] };
    }
    // "single-person" mode (see tagPhoto's comment) is what actually makes this safe: a
    // tight crop around one person can still catch a sliver of whoever was next to them
    // (confirmed directly), and the normal peopleCount gate would otherwise silently
    // catalogue nothing at all a second time. This mode tells it to ignore that instead.

    const croppedFile = new File([Buffer.from(cropped.data, "base64")], "cropped.jpg", {
      type: cropped.mimeType,
    });
    return await catalogueGarments(tagResult.garments, croppedFile, cropped.data, cropped.mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong with that selection" };
  }
}

/**
 * Shared by both entry points above: creates one item per detected garment (a single photo
 * can show several — a top and a bottom, sometimes a third layer — see PROJECT.md §5), and
 * schedules each one's background extraction + duplicate check.
 */
async function catalogueGarments(
  tagged: TaggedFields[],
  photo: File,
  base64: string,
  mimeType: string
): Promise<AddPhotoResult> {
  const ids: string[] = [];
  for (const t of tagged) {
    const category = asCategory(t.category);
    const name = t.name || "Untitled piece";
    const color = t.color || "";

    const id = await createItem(
      {
        name,
        category,
        color,
        palette: t.palette || [],
        pattern: asPattern(t.pattern),
        material: t.material || "",
        formality: t.formality || 3,
        seasons: asSeasons(t.seasons),
        notes: t.notes || "",
        needsReview: t.occluded === true,
        reviewNote: t.occluded === true ? t.occludedNote || "some details were inferred" : null,
      },
      photo
    );
    ids.push(id);

    const description = [color, name].filter(Boolean).join(" ") || "garment";
    after(async () => {
      // Extraction first — the duplicate check wants this item's isolated product photo
      // alongside its raw upload (see compareGarmentPhotos' comment for why it uses both).
      let extracted: { data: string; mimeType: string } | null = null;
      try {
        extracted = await extractGarmentImage(base64, mimeType, description);
        if (extracted) await replaceItemImage(id, extracted.data, extracted.mimeType);
      } catch (e) {
        console.error("Garment extraction failed for item", id, e);
      }

      // Duplicate check — best-effort, never blocks or fails the upload. Skipped entirely
      // if extraction failed: there's nothing reliable yet to compare. Only checks against
      // candidates whose own extraction has already finished (findDuplicateCandidates) —
      // a same-batch upload still mid-extraction is simply not compared against right now;
      // the periodic backfill script catches it once it's ready.
      if (!extracted) return;
      try {
        const candidates = await findDuplicateCandidates(category, color, name, id);
        for (const candidate of candidates) {
          try {
            const [candidateExtracted, candidateOriginal] = await Promise.all([
              downloadImage(candidate.imagePath),
              downloadImage(candidate.originalImagePath),
            ]);
            const result = await compareGarmentPhotos(
              { original: { base64, mimeType }, extracted: { base64: extracted.data, mimeType: extracted.mimeType } },
              { original: candidateOriginal, extracted: candidateExtracted }
            );
            if (result.verdict === "same" && result.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD) {
              await flagDuplicate(id, candidate.id, result.why, result.confidence);
              break; // one flagged match is enough to surface for review
            }
          } catch (e) {
            console.error("Duplicate comparison failed for item", id, "vs", candidate.id, e);
          }
        }
      } catch (e) {
        console.error("Duplicate check failed for item", id, e);
      }
    });
  }

  return { kind: "added", ids };
}
