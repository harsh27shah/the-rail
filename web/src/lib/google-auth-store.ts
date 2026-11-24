import "server-only";
import { getSupabaseAdmin } from "./supabase";

/**
 * Persistence for each signed-in user's own Google OAuth tokens (Google Photos import —
 * PROJECT.md §5). One row per user, keyed by their Supabase user id — never shared. (It was
 * a single fixed "owner" row while the app had no accounts; with real accounts that would
 * have let any user's "Import from Google Photos" open the owner's library.) Kept separate
 * from lib/google-photos.ts (the actual Google API calls) the same way lib/items.ts is kept
 * separate from lib/anthropic.ts/lib/gemini.ts — this file is the DB, that one is the API.
 */

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

export async function loadTokens(userId: string): Promise<StoredTokens | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("google_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
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

/** Forgets a user's stored Google connection, so the app treats them as "not connected"
 * and the next import sends them through Google's consent screen again. Used when Google
 * tells us the stored connection is dead (expired or revoked) — keeping it would just
 * repeat the same failure forever. */
export async function deleteTokens(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from("google_oauth_tokens").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** `refreshToken` is optional here because a refresh cycle only ever returns a new
 * access token — pass the existing refresh token through unchanged in that case. */
export async function saveTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  }
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");

  if (tokens.refreshToken) {
    const { error } = await admin.from("google_oauth_tokens").upsert({
      user_id: userId,
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
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
