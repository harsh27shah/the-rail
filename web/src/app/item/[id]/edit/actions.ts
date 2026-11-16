"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { deleteItems, getItem, updateItem } from "@/lib/items";
import { CATEGORIES, PATTERNS, type Category, type Pattern, type Season } from "@/lib/types";

function asCategory(value: FormDataEntryValue | null): Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "Tops";
}

function asPattern(value: FormDataEntryValue | null): Pattern {
  return typeof value === "string" && (PATTERNS as readonly string[]).includes(value)
    ? (value as Pattern)
    : "solid";
}

export async function updateItemAction(id: string, formData: FormData) {
  const user = await requireUser();
  const existing = await getItem(user.id, id);
  if (!existing) throw new Error("That piece isn't on the rail anymore");

  const seasons = String(formData.get("seasons") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as Season[];

  await updateItem(user.id, id, {
    name: String(formData.get("name") || "").trim() || "Untitled piece",
    category: asCategory(formData.get("category")),
    color: String(formData.get("color") || "").trim(),
    palette: existing.palette,
    pattern: asPattern(formData.get("pattern")),
    material: String(formData.get("material") || "").trim(),
    formality: Number(formData.get("formality")) || 3,
    seasons,
    notes: String(formData.get("notes") || "").trim(),
    source: existing.source,
  });

  redirect(`/item/${id}`);
}

export async function deleteItemAction(id: string) {
  const user = await requireUser();
  await deleteItems(user.id, [id]);
  redirect("/");
}
