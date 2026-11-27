import "server-only";
import { after } from "next/server";
import { compareGarmentPhotos, tagPhoto, type TagPhotoResult, type TaggedFields } from "@/lib/anthropic";
import { cropToPersonBox } from "@/lib/crop";
import { DUPLICATE_SMALL_SIDE, findTwin, shortlist } from "@/lib/duplicates";
import { detectPeople, extractGarmentImage, type PersonBox } from "@/lib/gemini";
import { analysePhoto, BLANK_GARMENT, normalizeUpload, shrinkForAi } from "@/lib/ingest";
import { UploadRejected, createUploadTarget, discardUpload, isOwnUploadPath, readUpload } from "@/lib/incoming";
import { createItem, downloadImage, findDuplicateCandidates, flagDuplicate, getCleaningIds, replaceItemImage } from "@/lib/items";
import { asCategory, asPattern, asSeasons } from "@/lib/tag-fields";
import { trackUsageFor, withUsageUser } from "@/lib/usage";

/**
 * The Add page's server work, as plain functions that take the signed-in user's id. They are called by
 * the routes under src/app/api/add/*, each of which checks who is asking first.
 *
 * Why routes and not Server Actions: Next runs Server Actions from the browser one at a time, so three
 * photos "in parallel" would have lined up single file (and even the quick upload-link calls would have
 * waited behind a 15-second read). Plain fetch calls to routes really do run side by side.
 * Every function here is scoped to `userId`.
 */

export type AddPhotoResult =
  | { kind: "added"; ids: string[]; names: string[] }
  | { kind: "error"; error: string }
  | { kind: "needs-selection"; people: PersonBox[] };

export type CreateUploadResult =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

/**
 * Step zero: hands the browser a one-time link to upload one photo straight to storage (see
 * lib/incoming.ts for why it doesn't go through the server). The browser then passes the
 * returned `path` to addPhotoFor instead of the photo itself.
 */
export async function createUploadFor(userId: string, info: { filename: string; type: string; size: number }): Promise<CreateUploadResult> {
  try {
    const target = await createUploadTarget(userId, info);
    return { ok: true, ...target };
  } catch (e) {
    if (e instanceof UploadRejected) return { ok: false, error: e.message };
    console.error("[upload] couldn't create an upload link:", e);
    return { ok: false, error: "couldn't start that upload, so try again in a moment" };
  }
}

/**
 * Of the pieces just added, which are still having their clean photo made? The Add page asks every few
 * seconds so each photo's row can move from "Cleaning up" to "Done". Read-only, and only ever about the
 * caller's own pieces. Any failure answers "none", so a hiccup can't leave a row stuck.
 */
export async function cleaningStatusFor(userId: string, ids: string[]): Promise<string[]> {
  const clean = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 100);
  try {
    return await getCleaningIds(userId, clean);
  } catch (e) {
    console.error("[add] couldn't check cleaning status:", e);
    return [];
  }
}

/** Throws away an uploaded photo that won't be used (the owner skipped it, or something failed). */
export async function discardUploadFor(userId: string, path: string): Promise<void> {
  await discardUpload(userId, path);
}

/**
 * Catalogues ONE photo — which may still contain several distinct garments (see
 * catalogueGarments below). The Add flow (src/components/AddPhotosForm.tsx) calls this once
 * per selected photo, in sequence, rather than posting an entire multi-photo selection in a
 * single request: a batch of full-resolution phone photos would blow straight past the
 * request body-size limit — and Vercel's own request-body ceiling — in production,
 * even though it works locally. One photo per request keeps every request small and every
 * function invocation short (tagging only; the image extraction still runs in the background
 * via after()). The client drives the loop, the progress display, and the navigation.
 *
 * If the photo shows more than one person with visible clothing, nothing gets catalogued
 * automatically — that's how another person's clothes would silently end up in the owner's
 * wardrobe, confirmed as a real failure mode before this check existed (PROJECT.md §5).
 * Instead this returns `needs-selection` with each person's approximate location, and the
 * client asks "which one is you?" (src/components/AddPhotosForm.tsx) before calling
 * addPhotoWithPersonFor below with the answer. Purely spatial ("where is each body in
 * this one photo, right now") — nothing about what anyone looks like is ever stored or
 * reused across photos.
 */
export async function addPhotoFor(userId: string, uploadPath: string): Promise<AddPhotoResult> {
  trackUsageFor(userId);
  if (!isOwnUploadPath(userId, uploadPath)) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  // The photo waits in temporary private storage (lib/incoming.ts) and is deleted as soon as
  // this finishes. The one exception is a photo with several people: it is kept, still private,
  // while the owner picks which one is them, and deleted at the next step (or swept after two hours).
  let keepForSelection = false;
  try {
    const photo = await readUpload(userId, uploadPath);
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

    return await catalogueGarments(userId, analysis.garments, file, base64, mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong reading that photo" };
  } finally {
    if (!keepForSelection) await discardUpload(userId, uploadPath);
  }
}

/**
 * Step two of the multi-person flow: the owner tapped the box that's them in
 * addPhotoFor's "needs-selection" response. Crops the ORIGINAL photo down to that one
 * region — a real pixel crop (lib/crop.ts), not a Gemini regeneration, deliberately, so
 * nothing about the garment can drift the way a regeneration sometimes does (see the
 * duplicate-detection saga in PROJECT.md §5 for why that's a real risk) — then runs the
 * crop through the exact same pipeline as any solo photo. The full multi-person photo is
 * never stored; only the crop becomes this item's photo, so whoever else was in the
 * original frame never touches storage at all.
 */
export async function addPhotoWithPersonFor(userId: string, uploadPath: string, boxRaw: unknown): Promise<AddPhotoResult> {
  trackUsageFor(userId);
  if (!isOwnUploadPath(userId, uploadPath)) {
    return { kind: "error", error: "that photo didn't come through" };
  }

  let box: PersonBox["box"];
  try {
    const parsed = boxRaw;
    if (!Array.isArray(parsed) || parsed.length !== 4 || !parsed.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("bad shape");
    box = parsed as PersonBox["box"];
  } catch {
    // The Add flow moves on to the next photo after an error, so nothing will use this one again.
    await discardUpload(userId, uploadPath);
    return { kind: "error", error: "That selection didn't come through right — try again" };
  }

  try {
    const photo = await readUpload(userId, uploadPath);
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
    return await catalogueGarments(userId, tagResult.garments, croppedFile, croppedAi.base64, croppedAi.mimeType);
  } catch (e) {
    return { kind: "error", error: e instanceof Error ? e.message : "something went wrong with that selection" };
  } finally {
    // The full multi-person photo's job is done; only the single-person crop lives on.
    await discardUpload(userId, uploadPath);
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
  const names: string[] = [];
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
    names.push(name);

    const description = [color, name].filter(Boolean).join(" ") || "garment";
    after(() => withUsageUser(userId, async () => {
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
        // Rank every same-category piece by how alike it looks from its tags, look at the closest few
        // cheaply first and carefully only when unsure (lib/duplicates.ts explains why and shows the numbers).
        const pool = await findDuplicateCandidates(userId, category, id);
        const near = shortlist(
          { name, color, palette: t.palette || [], pattern: asPattern(t.pattern), material: t.material || "", formality: t.formality || 3 },
          pool
        );
        if (near.length === 0) return;

        type Photos = { original: { base64: string; mimeType: string }; extracted: { base64: string; mimeType: string } };
        const shrinkPair = async (p: Photos, side: number): Promise<Photos> => ({
          original: await shrinkForAi(p.original, side),
          extracted: await shrinkForAi(p.extracted, side),
        });
        // This piece's own photos, at both sizes (the small pair only if a cheap look happens at all).
        const mineFull: Photos = { original: { base64, mimeType }, extracted: { base64: extracted.data, mimeType: extracted.mimeType } };
        let mineSmall: Promise<Photos> | null = null;
        // A candidate's photos are downloaded once and reused for both sizes. Stored originals are full
        // resolution and can be too big for Claude, so the "full" copy is already shrunk to the AI's limit.
        const theirs = new Map<string, Promise<{ full: Photos; small: Promise<Photos> | null }>>();
        const theirPhotos = (c: (typeof near)[number]) => {
          if (!theirs.has(c.id)) {
            theirs.set(
              c.id,
              Promise.all([downloadImage(c.originalImagePath).then((p) => shrinkForAi(p)), downloadImage(c.imagePath).then((p) => shrinkForAi(p))]).then(
                ([original, extractedPhoto]) => ({ full: { original, extracted: extractedPhoto }, small: null })
              )
            );
          }
          return theirs.get(c.id)!;
        };

        const counts = { small: 0, full: 0, failed: 0 };
        const twin = await findTwin(
          near,
          async (candidate, size) => {
            const their = await theirPhotos(candidate);
            if (size === "full") return compareGarmentPhotos(mineFull, their.full);
            mineSmall ??= shrinkPair(mineFull, DUPLICATE_SMALL_SIDE);
            their.small ??= shrinkPair(their.full, DUPLICATE_SMALL_SIDE);
            return compareGarmentPhotos(await mineSmall, await their.small);
          },
          (candidate, size, v) => {
            if (v) counts[size]++; else counts.failed++;
          }
        );
        console.log(
          `[duplicates] ${id}: ${pool.length} same-category pieces, looked at ${near.length}, ` +
            `${counts.small} cheap + ${counts.full} full-size comparisons${counts.failed ? `, ${counts.failed} failed` : ""}, ` +
            (twin ? `twin found (${twin.look} look, ${twin.verdict.confidence})` : "no twin")
        );
        if (twin) await flagDuplicate(userId, id, twin.match.id, twin.verdict.why, twin.verdict.confidence);
      } catch (e) {
        console.error("Duplicate check failed for item", id, e);
      }
    }));
  }

  return { kind: "added", ids, names };
}
