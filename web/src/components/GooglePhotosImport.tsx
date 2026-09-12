"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startGooglePhotosSession } from "@/app/add/google-photos-actions";

/**
 * "Import from Google Photos" — an alternative to the plain file input above it
 * (AddPhotosForm.tsx), for photos that live in Google Photos but not on whatever device is
 * doing the browsing (the main gap this closes; see PROJECT.md §5 — on a phone, the plain
 * file input already opens the OS's own picker, which usually reaches Google Photos/iCloud
 * directly). Picking happens entirely on a page Google itself hosts — this app never sees
 * anything beyond the specific photos chosen there, same "only what's explicitly handed
 * over" stance as the multi-person disambiguation work.
 *
 * Once photos are downloaded here, they're handed to the parent as ordinary `File` objects
 * via `onImported` — from that point on they go through the exact same upload pipeline as
 * a locally-chosen file. No changes needed anywhere else in the add flow.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "waiting"; sessionId: string }
  | { kind: "importing"; done: number; total: number }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — generous; picking on another tab/device can take a while

export function GooglePhotosImport({
  onImported,
  disabled = false,
}: {
  onImported: (files: File[]) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }, []);

  const finishImport = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(`/api/google-photos/media?sessionId=${encodeURIComponent(sessionId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Couldn't list the picked photos");

        const photos = json.photos as { filename: string; mimeType: string; baseUrl: string }[];
        if (photos.length === 0) {
          setPhase({ kind: "idle" });
          return;
        }

        setPhase({ kind: "importing", done: 0, total: photos.length });
        const files: File[] = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          const params = new URLSearchParams({ baseUrl: p.baseUrl, mimeType: p.mimeType });
          const dl = await fetch(`/api/google-photos/download?${params.toString()}`);
          if (!dl.ok) continue; // best-effort — one bad photo shouldn't lose the rest
          const blob = await dl.blob();
          files.push(new File([blob], p.filename, { type: p.mimeType }));
          setPhase({ kind: "importing", done: i + 1, total: photos.length });
        }

        onImported(files);
        setPhase({ kind: "idle" });
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : "Couldn't import those photos" });
      }
    },
    [onImported]
  );

  const beginWaiting = useCallback(
    (sessionId: string, pickerUri: string) => {
      window.open(pickerUri, "_blank", "noopener,noreferrer");
      setPhase({ kind: "waiting", sessionId });
      pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;

      pollHandle.current = setInterval(async () => {
        if (Date.now() > pollDeadline.current) {
          stopPolling();
          setPhase({ kind: "error", message: "Timed out waiting — reopen and try again when you're ready to pick." });
          return;
        }
        try {
          const res = await fetch(`/api/google-photos/status?sessionId=${encodeURIComponent(sessionId)}`);
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Couldn't check the picking session");
          if (json.done) {
            stopPolling();
            await finishImport(sessionId);
          }
        } catch (e) {
          stopPolling();
          setPhase({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong" });
        }
      }, POLL_INTERVAL_MS);
    },
    [finishImport, stopPolling]
  );

  // Resume where the OAuth callback left off (src/app/api/google-photos/callback/route.ts) —
  // it already created a session and redirected here with both ids, since the owner was
  // already mid-flow on Google's domain and didn't need a detour back through this app first.
  useEffect(() => {
    const gpError = searchParams.get("gpError");
    const gpSession = searchParams.get("gpSession");
    const gpPickerUri = searchParams.get("gpPickerUri");
    if (!gpError && !(gpSession && gpPickerUri)) return;

    router.replace("/add");
    // Deferred a tick rather than calling setPhase/beginWaiting directly in the effect body —
    // opening a new tab and starting polling are real side effects tied to a one-time mount
    // condition (not something to run on every render), but doing so synchronously inside the
    // effect trips react-hooks' "no setState during an effect" check. A zero-delay timer moves
    // it just far enough outside that without changing when the user actually sees anything.
    const timer = setTimeout(() => {
      if (gpError) {
        setPhase({ kind: "error", message: gpError });
      } else if (gpSession && gpPickerUri) {
        beginWaiting(gpSession, gpPickerUri);
      }
    }, 0);
    return () => clearTimeout(timer);
    // Intentionally only on mount — re-running this on every searchParams identity change
    // would re-trigger the picker after router.replace clears the query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  async function handleClick() {
    setPhase({ kind: "connecting" });
    const result = await startGooglePhotosSession();
    if (result.kind === "needs-auth") {
      // A genuine full-page navigation, not an in-app route — this leaves the app entirely
      // for Google's own OAuth consent screen (accounts.google.com), so router.push() (for
      // client-side transitions between this app's own pages) doesn't apply here.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/google-photos/authorize";
      return;
    }
    if (result.kind === "error") {
      setPhase({ kind: "error", message: result.error });
      return;
    }
    beginWaiting(result.sessionId, result.pickerUri);
  }

  function cancel() {
    stopPolling();
    setPhase({ kind: "idle" });
  }

  return (
    <div className="google-photos-import">
      {phase.kind === "idle" && (
        <button type="button" className="btn ghost" onClick={handleClick} disabled={disabled}>
          Import from Google Photos
        </button>
      )}
      {phase.kind === "connecting" && (
        <button type="button" className="btn ghost" disabled>
          Connecting…
        </button>
      )}
      {phase.kind === "waiting" && (
        <div className="google-photos-status">
          <span className="hint">Pick your photos in the Google Photos tab, then come back here…</span>
          <button type="button" className="btn ghost small" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {phase.kind === "importing" && (
        <p className="hint">
          Importing photo {phase.done} of {phase.total}…
        </p>
      )}
      {phase.kind === "error" && (
        <div className="google-photos-status">
          <span className="status err">{phase.message}</span>
          <button type="button" className="btn ghost small" onClick={() => setPhase({ kind: "idle" })}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
