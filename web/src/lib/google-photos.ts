import "server-only";
import { loadTokens, saveTokens } from "./google-auth-store";

/**
 * Google Photos import (PROJECT.md §5) — lets the owner pick photos directly from their
 * Google Photos library instead of only from local device storage, via Google's own
 * **Photos Picker API**. Deliberately not the older Photos Library API: Google restricted
 * broad `photoslibrary.readonly`-style library scanning for new apps in 2025, so the Picker
 * API — where the owner picks specific photos on a page Google itself hosts, and the app
 * only ever sees exactly those photos — is the current, correct, and only realistically
 * available approach. This mirrors the project's existing stance on identity/consent from
 * the multi-person work: never broad access, only what's explicitly handed over.
 *
 * Two things happen here: the OAuth dance (getting and refreshing an access token for the
 * owner's Google account, scoped only to `photospicker.mediaitems.readonly`), and the
 * Picker API calls themselves (create a picking session, poll it, list what was picked,
 * download the actual bytes). Token persistence lives in google-auth-store.ts, kept
 * separate the same way lib/items.ts (DB) is kept separate from lib/anthropic.ts/gemini.ts
 * (the AI calls) — this file is pure API calls.
 */

const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const PICKER_API = "https://photospicker.googleapis.com/v1";

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — see .env.local.example");
  }
  return { clientId, clientSecret };
}

/** Must exactly match an authorized redirect URI on the OAuth client in Google Cloud
 * Console. Derived from the request origin rather than hardcoded so this keeps working
 * whether the app is running on localhost or its deployed URL. */
export function redirectUri(origin: string): string {
  return `${origin}/api/google-photos/callback`;
}

/** Step 1 of the OAuth dance: where to send the owner's browser to grant access.
 * `access_type=offline` + `prompt=consent` together guarantee a refresh token comes back
 * even on a repeat authorization, since Google only issues one on the very first consent
 * otherwise — convenient for a single-owner app that may need to reconnect while testing. */
export function getAuthUrl(origin: string, state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Step 2: exchange the one-time code Google's redirect carried back for real tokens. */
export async function exchangeCodeForTokens(code: string, origin: string): Promise<void> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as TokenResponse;
  if (!json.refresh_token) {
    // Shouldn't happen given prompt=consent above, but fail loudly rather than silently
    // storing a token we can never refresh.
    throw new Error("Google didn't return a refresh token — try disconnecting and reconnecting");
  }
  await saveTokens({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
}

async function refresh(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as TokenResponse;
  await saveTokens({ accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}

/** Returns a currently-valid access token, refreshing first if the stored one is expired
 * (or about to be, within a minute — avoids a request failing on a token that expires
 * mid-flight). Throws a clear, specific error if the owner has never connected an account,
 * so callers can tell "not connected yet" apart from "something broke". */
export async function getValidAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new Error("NOT_CONNECTED");
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  return refresh(tokens.refreshToken);
}

export interface PickerSession {
  id: string;
  pickerUri: string;
}

/** Creates a new Picker session — the `pickerUri` is where the owner's browser goes to
 * actually choose photos, on a page Google itself hosts and controls. */
export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const response = await fetch(`${PICKER_API}/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`Couldn't start a Google Photos picking session: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { id: string; pickerUri: string };
  return { id: json.id, pickerUri: json.pickerUri };
}

/** Polled from the client (src/components/GooglePhotosImport.tsx) while the owner is over
 * on Google's own picker page — `mediaItemsSet` flips true once they finish choosing.
 * Picking happens entirely outside this app's UI, so polling is the only way to notice. */
export async function getPickerSessionStatus(accessToken: string, sessionId: string): Promise<boolean> {
  const response = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Couldn't check the picking session: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { mediaItemsSet?: boolean };
  return json.mediaItemsSet === true;
}

export interface PickedPhoto {
  id: string;
  filename: string;
  mimeType: string;
  /** Temporary (~60 min), only fetchable with this same access token — see downloadPhoto. */
  baseUrl: string;
}

/** Lists what the owner actually picked. The Picker API's response nests the useful fields
 * under `mediaFile` (unlike the older Library API's flatter shape) — read defensively since
 * this is the one part of the integration that couldn't be tested against Google's real
 * response before the owner's own first live run. */
export async function listPickedPhotos(accessToken: string, sessionId: string): Promise<PickedPhoto[]> {
  const results: PickedPhoto[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ sessionId, pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${PICKER_API}/mediaItems?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Couldn't list picked photos: ${response.status} ${await response.text()}`);
    }
    const json = (await response.json()) as {
      mediaItems?: Array<{
        id: string;
        mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string };
      }>;
      nextPageToken?: string;
    };
    for (const item of json.mediaItems ?? []) {
      const baseUrl = item.mediaFile?.baseUrl;
      if (!baseUrl) continue; // not a downloadable photo (shouldn't happen, skip defensively)
      results.push({
        id: item.id,
        filename: item.mediaFile?.filename || `${item.id}.jpg`,
        mimeType: item.mediaFile?.mimeType || "image/jpeg",
        baseUrl,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return results;
}

/** Downloads one picked photo's actual bytes. `=d` requests the original file rather than
 * a resized preview. Must run server-side — the access token can never reach the browser. */
export async function downloadPhoto(accessToken: string, baseUrl: string): Promise<Buffer> {
  const response = await fetch(`${baseUrl}=d`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Couldn't download a picked photo: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Best-effort cleanup once a session's photos have been fetched — Google recommends not
 * leaving picking sessions around. Never worth failing the import over. */
export async function deletePickerSession(accessToken: string, sessionId: string): Promise<void> {
  try {
    await fetch(`${PICKER_API}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Non-fatal — an orphaned session just expires on its own (Picker sessions are
    // short-lived by default).
  }
}
