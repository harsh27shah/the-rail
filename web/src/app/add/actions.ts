"use server";

import { redirect } from "next/navigation";
import { tagPhoto } from "@/lib/anthropic";
import { createItem } from "@/lib/items";
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

  // Tagging is best-effort — if it fails, the piece still gets hung on the rail with
  // placeholder fields, and the owner can fill them in from the edit page. Matches the
  // retired prototype's stance that auto-tagging will get things wrong sometimes, and the
  // edit path is never optional (PROJECT.md §4).
  let tagged;
  try {
    tagged = await tagPhoto(base64, photo.type || "image/jpeg");
  } catch {
    tagged = null;
  }

  const id = await createItem(
    {
      name: tagged?.name || "Untitled piece",
      category: asCategory(tagged?.category),
      color: tagged?.color || "",
      palette: tagged?.palette || [],
      pattern: asPattern(tagged?.pattern),
      material: tagged?.material || "",
      formality: tagged?.formality || 3,
      seasons: asSeasons(tagged?.seasons),
      notes: tagged?.notes || "",
    },
    photo
  );

  redirect(`/item/${id}`);
}
