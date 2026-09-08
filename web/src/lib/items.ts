import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { MOCK_ITEMS } from "./mock-data";
import type { Category, Item, Pattern, Season } from "./types";

const BUCKET = "wardrobe-images";

type Row = {
  id: string;
  name: string;
  category: string;
  color: string;
  palette: string[];
  pattern: string;
  material: string;
  formality: number;
  seasons: string[];
  notes: string;
  image_path: string | null;
  source: string | null;
  added: string;
};

function rowToItem(row: Row): Item {
  const admin = getSupabaseAdmin();
  const imageUrl =
    row.image_path && admin
      ? admin.storage.from(BUCKET).getPublicUrl(row.image_path).data.publicUrl
      : null;
  return {
    id: row.id,
    name: row.name,
    category: row.category as Category,
    color: row.color,
    palette: row.palette ?? [],
    pattern: row.pattern as Pattern,
    material: row.material,
    formality: row.formality,
    seasons: (row.seasons ?? []) as Season[],
    notes: row.notes,
    imageUrl,
    source: row.source,
    added: new Date(row.added).getTime(),
  };
}

/** True once Supabase is wired up (env vars set) — used to show a setup notice instead
 * of silently running on mock data forever. */
export function isDatabaseConnected(): boolean {
  return getSupabaseAdmin() !== null;
}

export async function getItems(): Promise<Item[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return MOCK_ITEMS;

  const { data, error } = await admin.from("items").select("*").order("added", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(rowToItem);
}

export async function getItem(id: string): Promise<Item | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return MOCK_ITEMS.find((it) => it.id === id) ?? null;

  const { data, error } = await admin.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToItem(data as Row) : null;
}

export interface ItemInput {
  name: string;
  category: Category;
  color: string;
  palette: string[];
  pattern: Pattern;
  material: string;
  formality: number;
  seasons: Season[];
  notes: string;
  source?: string | null;
}

/** Uploads a photo to storage and inserts a new item row. Returns the new item's id. */
export async function createItem(input: ItemInput, photo?: File | null): Promise<string> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  let imagePath: string | null = null;
  if (photo && photo.size > 0) {
    const ext = photo.type === "image/png" ? "png" : "jpg";
    imagePath = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(imagePath, photo, { contentType: photo.type });
    if (uploadError) throw new Error(uploadError.message);
  }

  const { data, error } = await admin
    .from("items")
    .insert({
      name: input.name,
      category: input.category,
      color: input.color,
      palette: input.palette,
      pattern: input.pattern,
      material: input.material,
      formality: input.formality,
      seasons: input.seasons,
      notes: input.notes,
      image_path: imagePath,
      source: input.source ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateItem(id: string, input: ItemInput): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const { error } = await admin
    .from("items")
    .update({
      name: input.name,
      category: input.category,
      color: input.color,
      palette: input.palette,
      pattern: input.pattern,
      material: input.material,
      formality: input.formality,
      seasons: input.seasons,
      notes: input.notes,
      source: input.source ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Bulk delete — P0 in the PRD, so bad ingestions can be cleared quickly. */
export async function deleteItems(ids: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");
  if (ids.length === 0) return;

  const { error } = await admin.from("items").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
