"use server";

import { after } from "next/server";
import { tagPhoto, type TaggedFields } from "@/lib/anthropic";
import { extractGarmentImage } from "@/lib/gemini";
import { createItem, replaceItemImage } from "@/lib/items";
import { asCategory, asPattern, asSeasons } from "@/lib/tag-fields";

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
      const id = await createItem(
        {
          name: t.name || "Untitled piece",
          category: asCategory(t.category),
          color: t.color || "",
          palette: t.palette || [],
          pattern: asPattern(t.pattern),
          material: t.material || "",
          formality: t.formality || 3,
          seasons: asSeasons(t.seasons),
          notes: t.notes || "",
        },
        photo
      );
      ids.push(id);

      const description = [t.color, t.name].filter(Boolean).join(" ") || "garment";
      after(async () => {
        try {
          const extracted = await extractGarmentImage(base64, photo.type || "image/jpeg", description);
          if (extracted) await replaceItemImage(id, extracted.data, extracted.mimeType);
        } catch (e) {
          console.error("Garment extraction failed for item", id, e);
        }
      });
    }

    return { ok: true, ids };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "something went wrong reading that photo" };
  }
}
