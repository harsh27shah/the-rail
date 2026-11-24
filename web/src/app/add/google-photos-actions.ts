"use server";

import { requireUser } from "@/lib/auth";
import { deleteTokens } from "@/lib/google-auth-store";
import { createPickerSession, getValidAccessToken, GoogleReconnectNeeded } from "@/lib/google-photos";

export type StartGooglePhotosResult =
  | { kind: "session"; sessionId: string; pickerUri: string }
  | { kind: "needs-auth" }
  | { kind: "error"; error: string };

/**
 * Starts a new Google Photos picking session for an owner who's already connected (so no
 * OAuth redirect is needed — that only happens once, or after disconnecting). Returns
 * "needs-auth" rather than throwing when there's no stored connection yet, so the button in
 * GooglePhotosImport.tsx can send the browser to /api/google-photos/authorize instead of
 * showing a raw error for what's actually just "not connected yet".
 */
export async function startGooglePhotosSession(): Promise<StartGooglePhotosResult> {
  const user = await requireUser();
  try {
    const accessToken = await getValidAccessToken(user.id);
    const session = await createPickerSession(accessToken);
    return { kind: "session", sessionId: session.id, pickerUri: session.pickerUri };
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_CONNECTED") return { kind: "needs-auth" };
    if (e instanceof GoogleReconnectNeeded) {
      // The connection is dead (expired or revoked). Forget it and send them back through
      // Google's consent screen — the same route as a first-time connect. (A refresh that
      // fails with invalid_grant has already cleared it; a rejected access token hasn't.)
      await deleteTokens(user.id);
      return { kind: "needs-auth" };
    }
    return { kind: "error", error: e instanceof Error ? e.message : "Couldn't reach Google Photos" };
  }
}
