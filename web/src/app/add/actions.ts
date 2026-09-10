"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { tagPhoto, type TaggedFields } from "@/lib/anthropic";
import { extractGarmentImage } from "@/lib/gemini";
import { createItem, replaceItemImage } from "@/lib/items";
import { CATEGORIES, PATTERNS, SEASONS, type Category, type Pattern, type Season } from "@/lib/types";

function asCategory(value: unknown): Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "Tops";
}

function asPattern(value: unknown): Pattern {
  return typeof value === "string" && (PATTERNS as readonly string[]).includes(value)
    ? (value as Pattern)
    : "solid";
}

function asSeasons(value: unknown): Season[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is Season => (SEASONS as readonly string[]).includes(s));
}

export async function addItemAction(formData: FormData) {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    throw new Error("Choose a photo first");
  }

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

  // A single garment lands on its own detail page, same as before; multiple garments land
  // on the storefront, where all of them show up together (sorted most-recent-first).
  redirect(ids.length === 1 ? `/item/${ids[0]}` : "/");
}
