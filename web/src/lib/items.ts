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
  original_image_path: string | null;
  previous_state: PreviousState | null;
  needs_review: boolean | null;
  review_note: string | null;
  source: string | null;
  added: string;
};

/** Snapshot of an item's full catalogued state taken right before a correction, so the
 * correction can be undone in one step. Stored in `items.previous_state` (jsonb). */
export interface PreviousState {
  name: string;
  category: string;
  color: string;
  palette: string[];
  pattern: string;
  material: string;
  formality: number;
  seasons: string[];
  notes: string;
  needs_review: boolean;
  review_note: string | null;
  image_path: string | null;
}

function rowToItem(row: Row): Item {
  const admin = getSupabaseAdmin();
  const imageUrl =
    row.image_path && admin
      ? admin.storage.from(BUCKET).getPublicUrl(row.image_path).data.publicUrl
      : null;
  const originalImageUrl =
    row.original_image_path && admin
      ? admin.storage.from(BUCKET).getPublicUrl(row.original_image_path).data.publicUrl
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
    originalImageUrl,
    canUndo: row.previous_state != null,
    needsReview: row.needs_review ?? false,
    reviewNote: row.review_note,
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
  /** Set at ingestion when the tagger had to infer hidden/occluded details. */
  needsReview?: boolean;
  reviewNote?: string | null;
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
      // Set once, here, and never touched again — the ground truth later corrections
      // and re-extractions get checked against, even after image_path is replaced.
      original_image_path: imagePath,
      needs_review: input.needsReview ?? false,
      review_note: input.reviewNote ?? null,
      source: input.source ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * `clearReview` (default true) wipes the "check this" flag — a manual edit counts as the
 * owner having reviewed the item. The post-correction re-tag path passes `false` and sets
 * the flag itself from the fresh tagging result instead.
 */
export async function updateItem(
  id: string,
  input: ItemInput,
  { clearReview = true }: { clearReview?: boolean } = {}
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const patch: Record<string, unknown> = {
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
  };
  if (clearReview) {
    patch.needs_review = false;
    patch.review_note = null;
  } else if (input.needsReview !== undefined) {
    patch.needs_review = input.needsReview;
    patch.review_note = input.reviewNote ?? null;
  }

  const { error } = await admin.from("items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Uploads a new image for an already-existing item and points it at that image, leaving
 * the original photo's file untouched in storage (just no longer referenced). Used for the
 * background garment-extraction step after upload, and for the one-off backfill script —
 * see PROJECT.md §5.
 */
export async function replaceItemImage(
  id: string,
  base64Data: string,
  mimeType: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const imagePath = `${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(base64Data, "base64");
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(imagePath, buffer, { contentType: mimeType });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await admin.from("items").update({ image_path: imagePath }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Records the item's current catalogued state into `previous_state` so the correction about
 * to happen can be undone in one step. Call this immediately before a correction mutates
 * anything. Overwrites any prior snapshot — undo is one level deep, on purpose ("simple
 * undo", per PROJECT.md §5).
 */
export async function snapshotForUndo(id: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const { data, error } = await admin
    .from("items")
    .select(
      "name, category, color, palette, pattern, material, formality, seasons, notes, needs_review, review_note, image_path"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  const snapshot: PreviousState = {
    name: data.name,
    category: data.category,
    color: data.color,
    palette: data.palette ?? [],
    pattern: data.pattern,
    material: data.material,
    formality: data.formality,
    seasons: data.seasons ?? [],
    notes: data.notes,
    needs_review: data.needs_review ?? false,
    review_note: data.review_note ?? null,
    image_path: data.image_path,
  };
  const { error: updateError } = await admin
    .from("items")
    .update({ previous_state: snapshot })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
}

/** Restores the snapshot taken before the last correction (fields + which image is shown)
 * and clears it. Returns false if there was nothing to undo. */
export async function revertLastCorrection(id: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const { data, error } = await admin
    .from("items")
    .select("previous_state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const prev = data?.previous_state as PreviousState | null | undefined;
  if (!prev) return false;

  const { error: updateError } = await admin
    .from("items")
    .update({
      name: prev.name,
      category: prev.category,
      color: prev.color,
      palette: prev.palette,
      pattern: prev.pattern,
      material: prev.material,
      formality: prev.formality,
      seasons: prev.seasons,
      notes: prev.notes,
      needs_review: prev.needs_review,
      review_note: prev.review_note,
      image_path: prev.image_path,
      previous_state: null,
    })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
  return true;
}

/** Points the item's shown image back at the untouched original upload. Always safe — the
 * original is immutable — so this doesn't write an undo snapshot. Returns false if there's
 * no distinct original to go back to. */
export async function resetToOriginalImage(id: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const { data, error } = await admin
    .from("items")
    .select("image_path, original_image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.original_image_path || data.original_image_path === data.image_path) return false;

  const { error: updateError } = await admin
    .from("items")
    .update({ image_path: data.original_image_path })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);
  return true;
}

export interface ItemImagePaths {
  currentPath: string | null;
  originalPath: string | null;
}

/** Fetches the two storage paths a correction needs: what's currently shown, and the true
 * source photo it should be checked against. */
export async function getItemImagePaths(id: string): Promise<ItemImagePaths | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("items")
    .select("image_path, original_image_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { currentPath: data.image_path, originalPath: data.original_image_path };
}

export interface DownloadedImage {
  base64: string;
  mimeType: string;
}

/** Downloads a stored image's bytes, for feeding back into Gemini (extraction/correction
 * both need to read an image out of storage, not just write one). */
export async function downloadImage(path: string): Promise<DownloadedImage> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message);
  const buffer = Buffer.from(await data.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: data.type || "image/jpeg" };
}

/** Bulk delete — P0 in the PRD, so bad ingestions can be cleared quickly. */
export async function deleteItems(ids: string[]): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");
  if (ids.length === 0) return;

  const { error } = await admin.from("items").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
