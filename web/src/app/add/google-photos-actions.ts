"use server";

import { createPickerSession, getValidAccessToken } from "@/lib/google-photos";

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
  try {
    const accessToken = await getValidAccessToken();
    const session = await createPickerSession(accessToken);
    return { kind: "session", sessionId: session.id, pickerUri: session.pickerUri };
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_CONNECTED") return { kind: "needs-auth" };
    return { kind: "error", error: e instanceof Error ? e.message : "Couldn't reach Google Photos" };
  }
}
