"use server";

import { retagItem } from "@/lib/anthropic";
import { correctGarmentImage } from "@/lib/gemini";
import { downloadImage, getItem, getItemImagePaths, replaceItemImage, updateItem } from "@/lib/items";
import { asCategory, asPattern, asSeasons } from "@/lib/tag-fields";

/**
 * Regenerates an item's photo based on feedback about what's wrong with the current one.
 * Synchronous (unlike the initial extraction) — this is a deliberate action the owner just
 * clicked, so waiting through the ~5-15s while watching for the result is the right UX here,
 * not something to hide in the background. See PROJECT.md §5.
 */
export async function correctImageAction(
  id: string,
  feedback: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!feedback.trim()) return { ok: false, error: "Add a note about what's wrong first" };

  const item = await getItem(id);
  if (!item) return { ok: false, error: "That piece isn't on the rail anymore" };

  const paths = await getItemImagePaths(id);
  if (!paths?.currentPath || !paths.originalPath) {
    return { ok: false, error: "No photo to correct for this piece" };
  }

  try {
    const [current, original] = await Promise.all([
      downloadImage(paths.currentPath),
      downloadImage(paths.originalPath),
    ]);
    const description = [item.color, item.name].filter(Boolean).join(" ") || "garment";

    const corrected = await correctGarmentImage(
      { base64: original.base64, mimeType: original.mimeType },
      { base64: current.base64, mimeType: current.mimeType },
      feedback,
      description
    );
    if (!corrected) return { ok: false, error: "Couldn't generate a corrected version — try rephrasing" };

    await replaceItemImage(id, corrected.data, corrected.mimeType);

    // The feedback that fixed the photo often also invalidates what's catalogued about it
    // (e.g. "it's not a sweatshirt, it's a t-shirt" — that's a name/category fix, not just a
    // visual one). Re-tag from the corrected photo + the feedback and merge the result in.
    // Best-effort: if this step fails, the photo fix still stands — only the text lags.
    try {
      const retagged = await retagItem(corrected.data, corrected.mimeType, feedback);
      await updateItem(id, {
        name: retagged.name || item.name,
        category: retagged.category ? asCategory(retagged.category) : item.category,
        color: retagged.color || item.color,
        palette: retagged.palette?.length ? retagged.palette : item.palette,
        pattern: retagged.pattern ? asPattern(retagged.pattern) : item.pattern,
        material: retagged.material || item.material,
        formality: retagged.formality || item.formality,
        seasons: retagged.seasons?.length ? asSeasons(retagged.seasons) : item.seasons,
        notes: retagged.notes || item.notes,
        source: item.source,
      });
    } catch (e) {
      console.error("Re-tagging failed after photo correction for item", id, e);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
