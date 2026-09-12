import "server-only";
import { getSupabaseAdmin } from "./supabase";

/**
 * Persistence for the owner's Google OAuth tokens (Google Photos import — PROJECT.md §5).
 * Single-owner mode, same as the rest of the app: one fixed row, no accounts. Kept separate
 * from lib/google-photos.ts (the actual Google API calls) the same way lib/items.ts is kept
 * separate from lib/anthropic.ts/lib/gemini.ts — this file is the DB, that one is the API.
 */

const ROW_ID = "owner";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

type Row = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export async function loadTokens(): Promise<StoredTokens | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Row;
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

/** `refreshToken` is optional here because a refresh cycle only ever returns a new
 * access token — pass the existing refresh token through unchanged in that case. */
export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  if (tokens.refreshToken) {
    const { error } = await admin.from("google_oauth_tokens").upsert({
      id: ROW_ID,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: new Date(tokens.expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return;
  }

  // Refresh-only update — don't clobber the stored refresh token with nothing.
  const { error } = await admin
    .from("google_oauth_tokens")
    .update({
      access_token: tokens.accessToken,
      expires_at: new Date(tokens.expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ROW_ID);
  if (error) throw new Error(error.message);
}
