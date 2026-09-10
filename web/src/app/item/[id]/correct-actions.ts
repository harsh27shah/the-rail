"use server";

import { correctGarmentImage } from "@/lib/gemini";
import { downloadImage, getItem, getItemImagePaths, replaceItemImage } from "@/lib/items";

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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
