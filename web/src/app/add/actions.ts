"use server";

import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { compareGarmentPhotos, tagPhoto, type TagPhotoResult, type TaggedFields } from "@/lib/anthropic";
import { cropToPersonBox } from "@/lib/crop";
import { detectPeople, extractGarmentImage, type PersonBox } from "@/lib/gemini";
import { analysePhoto, BLANK_GARMENT, normalizeUpload, shrinkForAi } from "@/lib/ingest";
import { UploadRejected, createUploadTarget, discardUpload, isOwnUploadPath, readUpload } from "@/lib/incoming";
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

export type CreateUploadResult =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

/**
 * Step zero: hands the browser a one-time link to upload one photo straight to storage (see
 * lib/incoming.ts for why it doesn't go through the server). The browser then passes the
 * returned `path` to addPhotoAction instead of the photo itself.
 */
export async function createUploadAction(info: { filename: string; type: string; size: number }): Promise<CreateUploadResult> {
  const user = await requireUser();
  try {
    const target = await createUploadTarget(user.id, info);
    return { ok: true, ...target };
  } catch (e) {
    if (e instanceof UploadRejected) return { ok: false, error: e.message };
    console.error("[upload] couldn't create an upload link:", e);
    return { ok: false, error: "couldn't start that upload, so try again in a moment" };
  }
}

/** Throws away an uploaded photo that won't be used (the owner skipped it, or something failed). */
export async function discardUploadAction(path: string): Promise<void> {
  const user = await requireUser();
  await discardUpload(user.id, path);
}

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
  const user = await requireUser();
  const uploadPath = String(formData.get("uploadPath") ?? "");
  if (!isOwnUploadPath(user.id, uploadPath)) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  // The photo waits in temporary private storage (lib/incoming.ts) and is deleted as soon as
  // this finishes. The one exception is a photo with several people: it is kept, still private,
  // while the owner picks which one is them, and deleted at the next step (or swept after two hours).
  let keepForSelection = false;
  try {
    const photo = await readUpload(user.id, uploadPath);
    // Trust the bytes, not the browser's/Google's label — see normalizeUpload.
    const normalized = await normalizeUpload(photo);
    // `file` (full resolution) is what gets stored; `base64`/`mimeType` below are the copy sent
    // to the AI models, shrunk if the photo is too big for them (see shrinkForAi).
    const { file } = normalized;
    const { base64, mimeType } = normalized.ai;

    // Tagging is best-effort — if it fails, one untitled piece still gets hung on the rail
    // with the original photo, and the owner can fill it in from the edit page (PROJECT.md
    // §4) — but ONLY once we know the photo has at most one person in it. A failed tag is
    // never read as "one person": analysePhoto falls back to person detection, and if that
    // can't settle it either, nothing is added. See lib/ingest.ts.
    const analysis = await analysePhoto(
      { base64, mimeType },
      { tag: (b, m) => tagPhoto(b, m), detect: detectPeople }
    );
    if (analysis.kind === "needs-selection") {
      keepForSelection = true;
      return { kind: "needs-selection", people: analysis.people };
    }
    if (analysis.kind === "error") return { kind: "error", error: analysis.error };

    return await catalogueGarments(user.id, analysis.garments, file, base64, mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong reading that photo" };
  } finally {
    if (!keepForSelection) await discardUpload(user.id, uploadPath);
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
  const user = await requireUser();
  const uploadPath = String(formData.get("uploadPath") ?? "");
  const boxRaw = formData.get("box");
  if (!isOwnUploadPath(user.id, uploadPath)) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  let box: PersonBox["box"];
  try {
    const parsed = JSON.parse(String(boxRaw));
    if (!Array.isArray(parsed) || parsed.length !== 4) throw new Error("bad shape");
    box = parsed as PersonBox["box"];
  } catch {
    // The Add flow moves on to the next photo after an error, so nothing will use this one again.
    await discardUpload(user.id, uploadPath);
    return { kind: "error", error: "That selection didn't come through right — try again" };
  }

  try {
    const photo = await readUpload(user.id, uploadPath);
    const original = await normalizeUpload(photo);
    const cropped = await cropToPersonBox(original.base64, original.mimeType, box);
    const croppedAi = await shrinkForAi({ base64: cropped.data, mimeType: cropped.mimeType });

    let tagResult: TagPhotoResult;
    try {
      tagResult = await tagPhoto(croppedAi.base64, croppedAi.mimeType, "single-person");
    } catch {
      tagResult = { peopleCount: 1, garments: [BLANK_GARMENT] };
    }
    // "single-person" mode (see tagPhoto's comment) is what actually makes this safe: a
    // tight crop around one person can still catch a sliver of whoever was next to them
    // (confirmed directly), and the normal peopleCount gate would otherwise silently
    // catalogue nothing at all a second time. This mode tells it to ignore that instead.

    const croppedFile = new File([Buffer.from(cropped.data, "base64")], "cropped.jpg", {
      type: cropped.mimeType,
    });
    return await catalogueGarments(user.id, tagResult.garments, croppedFile, croppedAi.base64, croppedAi.mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong with that selection" };
  } finally {
    // The full multi-person photo's job is done; only the single-person crop lives on.
    await discardUpload(user.id, uploadPath);
  }
}

/**
 * Shared by both entry points above: creates one item per detected garment (a single photo
 * can show several — a top and a bottom, sometimes a third layer — see PROJECT.md §5), and
 * schedules each one's background extraction + duplicate check.
 */
async function catalogueGarments(
  userId: string,
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
      userId,
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
        if (extracted) await replaceItemImage(userId, id, extracted.data, extracted.mimeType);
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
        const candidates = await findDuplicateCandidates(userId, category, color, name, id);
        for (const candidate of candidates) {
          try {
            // Stored originals are full resolution and can be too big for Claude: shrink for the comparison.
            const [candidateExtracted, candidateOriginal] = await Promise.all([
              downloadImage(candidate.imagePath).then(shrinkForAi),
              downloadImage(candidate.originalImagePath).then(shrinkForAi),
            ]);
            const result = await compareGarmentPhotos(
              { original: { base64, mimeType }, extracted: { base64: extracted.data, mimeType: extracted.mimeType } },
              { original: candidateOriginal, extracted: candidateExtracted }
            );
            if (result.verdict === "same" && result.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD) {
              await flagDuplicate(userId, id, candidate.id, result.why, result.confidence);
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
