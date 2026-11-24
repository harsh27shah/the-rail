import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { OUTFIT_ENGINE_VERSION, type Outfit } from "./outfits";

/**
 * Where worked-out outfits are kept (table `outfit_sets`, supabase/schema.sql). Like lib/items.ts,
 * every function takes a required `userId` and scopes by it, and anything that names an item
 * first checks that item belongs to that user, so one account can't read or write another's.
 */

export type SetStatus = "generating" | "ready" | "failed";

export interface StoredSet {
  status: SetStatus;
  outfits: Outfit[];
  wardrobeSize: number | null;
  engineVersion: string | null;
  error: string | null;
  startedAt: number | null;
  generatedAt: number | null;
}

type Row = {
  status: SetStatus;
  outfits: Outfit[] | null;
  wardrobe_size: number | null;
  engine_version: string | null;
  error: string | null;
  started_at: string | null;
  generated_at: string | null;
};

/** A "generating" claim older than this is treated as dead (the request that made it crashed or
 * timed out), so a later visit may try again instead of waiting forever. */
const CLAIM_TIMEOUT_MS = 3 * 60 * 1000;

function db() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");
  return admin;
}

async function assertOwnsItem(userId: string, itemId: string): Promise<void> {
  const { data, error } = await db().from("items").select("id").eq("id", itemId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That item isn't yours");
}

export async function loadSet(userId: string, heroItemId: string): Promise<StoredSet | null> {
  const { data, error } = await db()
    .from("outfit_sets")
    .select("status, outfits, wardrobe_size, engine_version, error, started_at, generated_at")
    .eq("user_id", userId)
    .eq("hero_item_id", heroItemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  return {
    status: r.status,
    outfits: Array.isArray(r.outfits) ? r.outfits : [],
    wardrobeSize: r.wardrobe_size,
    engineVersion: r.engine_version,
    error: r.error,
    startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
    generatedAt: r.generated_at ? new Date(r.generated_at).getTime() : null,
  };
}

/** Is someone (another tab, an earlier click) already generating this item's outfits? */
export function isBeingGenerated(set: StoredSet | null): boolean {
  return !!set && set.status === "generating" && !!set.startedAt && Date.now() - set.startedAt < CLAIM_TIMEOUT_MS;
}

/** Marks an item as "being generated" so two open tabs don't both pay for it. Returns false if a
 * live claim already exists. (A read-then-write, so two requests in the very same instant can both
 * win; that only costs one extra AI request, never wrong outfits.) */
export async function claimGeneration(userId: string, heroItemId: string): Promise<boolean> {
  await assertOwnsItem(userId, heroItemId);
  if (isBeingGenerated(await loadSet(userId, heroItemId))) return false;
  const { error } = await db().from("outfit_sets").upsert({
    user_id: userId,
    hero_item_id: heroItemId,
    status: "generating",
    started_at: new Date().toISOString(),
    error: null,
  });
  if (error) throw new Error(error.message);
  return true;
}

export async function saveReady(userId: string, heroItemId: string, outfits: Outfit[], wardrobeSize: number): Promise<void> {
  await assertOwnsItem(userId, heroItemId);
  const { error } = await db().from("outfit_sets").upsert({
    user_id: userId,
    hero_item_id: heroItemId,
    status: "ready",
    outfits,
    wardrobe_size: wardrobeSize,
    engine_version: OUTFIT_ENGINE_VERSION,
    error: null,
    generated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function saveFailed(userId: string, heroItemId: string, message: string): Promise<void> {
  await assertOwnsItem(userId, heroItemId);
  const { error } = await db().from("outfit_sets").upsert({
    user_id: userId,
    hero_item_id: heroItemId,
    status: "failed",
    error: message.slice(0, 300),
  });
  if (error) throw new Error(error.message);
}
