"use server";

import { after } from "next/server";
import { compareGarmentPhotos, tagPhoto, type TaggedFields } from "@/lib/anthropic";
import { extractGarmentImage } from "@/lib/gemini";
import { createItem, downloadImage, findDuplicateCandidates, flagDuplicate, replaceItemImage } from "@/lib/items";
import { asCategory, asPattern, asSeasons } from "@/lib/tag-fields";

// A "same" verdict below this confidence isn't flagged — Claude's own calibration puts
// genuine matches at 0.75+ and confidently-different pairs at 0.98+ (see PROJECT.md §5's
// spike notes), so this is a wide safety margin, not a tight threshold.
const DUPLICATE_CONFIDENCE_THRESHOLD = 0.6;

export type AddPhotoResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Catalogues ONE photo — which may still contain several distinct garments (see the
 * multi-garment loop below). The Add flow (src/components/AddPhotosForm.tsx) calls this once
 * per selected photo, in sequence, rather than posting an entire multi-photo selection in a
 * single request: a batch of full-resolution phone photos would blow straight past the
 * Server Action body-size limit — and Vercel's own request-body ceiling — in production,
 * even though it works locally. One photo per request keeps every request small and every
 * function invocation short (tagging only; the image extraction still runs in the background
 * via after()). The client drives the loop, the progress display, and the navigation.
 */
export async function addPhotoAction(formData: FormData): Promise<AddPhotoResult> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: "that photo didn't come through" };
  }

  try {
    const buffer = Buffer.from(await photo.arrayBuffer());
    const base64 = buffer.toString("base64");

    // Tagging is best-effort — if it fails, one untitled piece still gets hung on the rail
    // with the original photo, and the owner can fill it in from the edit page. Matches the
    // retired prototype's stance that auto-tagging will get things wrong sometimes, and the
    // edit path is never optional (PROJECT.md §4).
    let tagged: TaggedFields[];
    try {
      tagged = await tagPhoto(base64, photo.type || "image/jpeg");
    } catch {
      tagged = [{ name: "", category: "", color: "", palette: [], pattern: "", material: "", formality: 0, seasons: [], notes: "" }];
    }

    // One photo can contain several distinct garments (a top and a bottom, sometimes a third
    // layer) — each becomes its own item, each gets its own background extraction using its
    // own description, so a jacket-and-jeans photo produces two clean, separately-cropped
    // photos rather than one item with both garments still in frame. See PROJECT.md §5.
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
        // Extraction first — the duplicate check below prefers comparing two clean product
        // shots over a raw photo against a clean one, matching how it was validated.
        let extracted: { data: string; mimeType: string } | null = null;
        try {
          extracted = await extractGarmentImage(base64, photo.type || "image/jpeg", description);
          if (extracted) await replaceItemImage(id, extracted.data, extracted.mimeType);
        } catch (e) {
          console.error("Garment extraction failed for item", id, e);
        }

        // Duplicate check — best-effort, never blocks or fails the upload. Only compares
        // against a handful of plausible same-category candidates (see
        // findDuplicateCandidates), not the whole wardrobe.
        try {
          const candidates = await findDuplicateCandidates(category, color, name, id);
          const newImage = extracted ?? { data: base64, mimeType: photo.type || "image/jpeg" };
          for (const candidate of candidates) {
            const candidateImage = await downloadImage(candidate.imagePath);
            const result = await compareGarmentPhotos(
              { base64: newImage.data, mimeType: newImage.mimeType },
              { base64: candidateImage.base64, mimeType: candidateImage.mimeType }
            );
            if (result.verdict === "same" && result.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD) {
              await flagDuplicate(id, candidate.id, result.why, result.confidence);
              break; // one flagged match is enough to surface for review
            }
          }
        } catch (e) {
          console.error("Duplicate check failed for item", id, e);
        }
      });
    }

    return { ok: true, ids };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "something went wrong reading that photo" };
  }
}
