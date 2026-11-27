"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GooglePhotosImport } from "@/components/GooglePhotosImport";
import type { AddPhotoResult, CreateUploadResult } from "@/lib/add-photo";
import type { PersonBox } from "@/lib/gemini";
import { afterUploadDestination } from "@/lib/onboarding";
import {
  UPLOAD_CONCURRENCY, applyCleaningStatus, estimateSecondsLeft, formatTimeLeft, isBusy, newRow, outcome, runPool, stageLabel,
  stepStates, summaryLine, type UploadRow,
} from "@/lib/upload-queue";

/**
 * Multi-photo ingestion. The person picks one photo or many; each becomes a row showing where it is up
 * to (Waiting, Uploading, Reading, Cleaning up, Done) next to its own thumbnail, and up to three are
 * worked on at once (lib/upload-queue.ts). A photo that fails doesn't stop the others.
 *
 * When a photo has more than one person in it, that photo's row waits with "tap which one is you" while
 * the rest carry on (nothing is guessed, nothing mixed into the wardrobe: see PROJECT.md §5). The
 * "which one is you?" picker appears above the list, one photo at a time.
 *
 * Where it ends: once every photo has been read it goes straight to the rail (the pieces' clean photos
 * keep arriving there as placeholders, see lib/cleaning.ts), except when something failed or was
 * skipped, when it stays so the person can see which (lib/onboarding.ts `afterUploadDestination`).
 *
 * All the server calls here are plain fetches to /api/add/*, not Server Actions: Next runs Server Actions
 * one at a time, which would have turned "three at once" back into one after another.
 */

type PickerChoice = { type: "box"; box: PersonBox["box"] } | { type: "skip" };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) throw new Error("you've been signed out, so sign in again and retry");
  if (!res.ok) throw new Error("the server had a problem with that photo, so try it again");
  return (await res.json()) as T;
}

/**
 * Sends one photo straight from the browser to temporary private storage, using a one-time link the
 * server hands out (see lib/incoming.ts). The server never receives the photo itself, which is what lets
 * a big camera or iPhone photo through: Vercel refuses any request body over about 4.5 MB. The server is
 * then given only the photo's storage path.
 */
async function uploadPhoto(file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const target = await postJson<CreateUploadResult>("/api/add/upload", { filename: file.name, type: file.type, size: file.size });
    if (!target.ok) return { ok: false, error: target.error };
    // The same shape Supabase's own upload helper sends. Some browsers report no type for a
    // perfectly good photo; storage only accepts images, so say it's one.
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([file], { type: file.type || "image/jpeg" }));
    const res = await fetch(target.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
    if (!res.ok) return { ok: false, error: "the upload didn't go through, so try it again" };
    return { ok: true, path: target.path };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.message.includes("signed out") ? e.message : "the upload didn't go through. Check your connection and try again" };
  }
}

/**
 * `showGoogleImport`: the "Import from Google Photos" button is hidden for everyone but the owner
 * until the Google app is published (see BACKLOG.md): while it is in Google's "Testing" status, only
 * listed test users (just the owner) can use it, so for anyone else it fails. Default off.
 */
export function AddPhotosForm({
  showGoogleImport = false,
  onboarding = false,
}: {
  showGoogleImport?: boolean;
  /** Still getting set up (hasn't seen outfits): after an upload, land on the rail with the "Hung N pieces" note. */
  onboarding?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [people, setPeople] = useState<Record<number, PersonBox[]>>({});
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  // Per-run bookkeeping that never needs to cause a redraw.
  const runFiles = useRef<File[]>([]);
  const paths = useRef<Record<number, string>>({});
  const startedAt = useRef<Record<number, number>>({});
  const allThumbs = useRef<string[]>([]);
  const navigated = useRef(false);
  const queueRef = useRef<HTMLDivElement>(null);

  // Free the thumbnails' memory when the page goes away.
  useEffect(() => {
    const urls = allThumbs.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const settled = rows.length > 0 && !rows.some((r) => isBusy(r.stage));
  const running = rows.length > 0 && !settled;
  const result = settled ? outcome(rows) : null;
  const dest = result
    ? afterUploadDestination({ onboarding, ids: result.ids, failures: result.failures.length, skipped: result.skipped })
    : null;
  const goHref = dest?.kind === "go" ? dest.href : null;

  // When a run starts, bring the list into view: on a phone the tips and file picker above it fill the screen.
  const started = rows.length > 0;
  useEffect(() => {
    if (!started) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    queueRef.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  }, [started]);

  // Every photo has been read: off to the rail (once).
  useEffect(() => {
    if (!goHref || navigated.current) return;
    navigated.current = true;
    router.refresh();
    router.push(goHref);
  }, [goHref, router]);

  // While any photo's pieces are still being cleaned, ask the server every few seconds so its row can
  // move on to "Done". Paused while the tab is hidden, and checks the moment the person comes back
  // (iPhones pause background tabs).
  const cleaningKey = rows.filter((r) => r.stage === "cleaning").flatMap((r) => r.pieces.map((p) => p.id)).join(",");
  useEffect(() => {
    if (!cleaningKey) return;
    const ids = cleaningKey.split(",");
    let inFlight = false;
    let checks = 0;
    const check = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const { ids: still } = await postJson<{ ids: string[] }>("/api/add/cleaning", { ids });
        setRows((prev) => applyCleaningStatus(prev, new Set(still)));
      } catch {
        // A failed check changes nothing; the next one tries again.
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => {
      checks++;
      void check();
      if (checks >= 40) clearInterval(timer);
    }, 3000);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cleaningKey]);

  const patch = (key: number, p: Partial<UploadRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const discard = (key: number) => {
    if (paths.current[key]) void postJson("/api/add/discard", { path: paths.current[key] }).catch(() => {});
  };
  const fail = (key: number, err: unknown) => {
    patch(key, { stage: "failed", note: err instanceof Error ? err.message : "failed" });
    discard(key);
  };

  /** What the server said about a photo. `timed`: this was the straight read (not one that waited on the person), so its duration counts towards the time estimate. */
  function applyResult(key: number, res: AddPhotoResult, timed: boolean) {
    if (res.kind === "added") {
      const pieces = res.ids.map((id, i) => ({ id, name: res.names[i] || "Untitled piece" }));
      patch(key, {
        pieces,
        stage: pieces.length > 0 ? "cleaning" : "done",
        note: pieces.length > 0 ? null : "No clothing found in this photo",
        readMs: timed ? Date.now() - startedAt.current[key] : null,
      });
    } else if (res.kind === "needs-selection") {
      setPeople((p) => ({ ...p, [key]: res.people }));
      patch(key, { stage: "needs-you" });
    } else {
      patch(key, { stage: "failed", note: res.error });
    }
  }

  async function processRow(key: number) {
    startedAt.current[key] = Date.now();
    try {
      patch(key, { stage: "uploading" });
      const up = await uploadPhoto(runFiles.current[key]);
      if (!up.ok) {
        patch(key, { stage: "failed", note: up.error });
        return;
      }
      paths.current[key] = up.path;
      patch(key, { stage: "reading" });
      applyResult(key, await postJson<AddPhotoResult>("/api/add/photo", { uploadPath: up.path }), true);
    } catch (err) {
      fail(key, err);
    }
  }

  async function choose(key: number, choice: PickerChoice) {
    setPeople((p) => {
      const { [key]: _gone, ...rest } = p;
      void _gone;
      return rest;
    });
    if (choice.type === "skip") {
      patch(key, { stage: "skipped" });
      // The full photo, with other people in it, is no longer needed: delete it now.
      discard(key);
      return;
    }
    patch(key, { stage: "reading" });
    try {
      applyResult(key, await postJson<AddPhotoResult>("/api/add/photo", { uploadPath: paths.current[key], box: choice.box }), false);
    } catch (err) {
      fail(key, err);
    }
  }

  function resetRun() {
    // Emptied in place (not replaced), so the unmount cleanup above always sees the same list.
    allThumbs.current.splice(0).forEach((u) => URL.revokeObjectURL(u));
    setRows([]);
    setPeople({});
    setThumbs({});
    paths.current = {};
    startedAt.current = {};
    navigated.current = false;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || running) return;

    resetRun();
    const batch = files;
    runFiles.current = batch;
    const urls: Record<number, string> = {};
    batch.forEach((f, i) => {
      urls[i] = URL.createObjectURL(f);
      allThumbs.current.push(urls[i]);
    });
    setThumbs(urls);
    setRows(batch.map((f, i) => newRow(i, f.name)));
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";

    void runPool(
      batch.map((_, i) => i),
      UPLOAD_CONCURRENCY,
      processRow
    );
  }

  const pickRow = rows.find((r) => r.stage === "needs-you");
  const pickPeople = pickRow ? people[pickRow.key] : undefined;
  const secondsLeft = running ? estimateSecondsLeft(rows) : null;
  const staying = settled && dest?.kind === "stay";

  return (
    <form onSubmit={handleSubmit}>
      {/* Hidden (not removed) while a run is going: the list below takes over the screen. */}
      <div hidden={running}>
        <label htmlFor="photos">{files.length > 1 ? "Photos" : "Photo"}</label>
        <input
          ref={inputRef}
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          multiple
          disabled={running}
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            resetRun();
          }}
        />
      </div>

      {!running && files.length > 0 && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          {files.length} photo{files.length === 1 ? "" : "s"} selected.
        </p>
      )}

      {showGoogleImport && !running && (
        <div className="add-alt-source">
          <span className="hint">or</span>
          <GooglePhotosImport
            disabled={running}
            onImported={(imported) => {
              setFiles((prev) => [...prev, ...imported]);
              resetRun();
            }}
          />
        </div>
      )}

      {rows.length > 0 && (
        <div className="upload-queue" ref={queueRef}>
          <p className="upload-summary" role="status" aria-live="polite">
            {summaryLine(rows)}
            {secondsLeft != null ? ` · ${formatTimeLeft(secondsLeft)}` : ""}
          </p>

          {pickRow && pickPeople && (
            <div className="person-picker">
              <p className="hint" style={{ margin: "8px 0 10px" }}>
                <strong>{pickRow.name}</strong> has more than one person in it. Tap the one that&rsquo;s you.
              </p>
              <div className="person-picker-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbs[pickRow.key]} alt="" />
                {pickPeople.map((p, idx) => {
                  const [ymin, xmin, ymax, xmax] = p.box;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="person-picker-box"
                      style={{
                        left: `${xmin / 10}%`,
                        top: `${ymin / 10}%`,
                        width: `${(xmax - xmin) / 10}%`,
                        height: `${(ymax - ymin) / 10}%`,
                      }}
                      onClick={() => void choose(pickRow.key, { type: "box", box: p.box })}
                      aria-label={`This is me — ${p.label}`}
                    >
                      <span className="person-picker-label">{p.label}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn ghost small" style={{ marginTop: 10 }} onClick={() => void choose(pickRow.key, { type: "skip" })}>
                None of these are me — skip this photo
              </button>
            </div>
          )}

          <ul className="upload-list">
            {rows.map((r) => (
              <li key={r.key} className={`upload-row stage-${r.stage}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="upload-thumb" src={thumbs[r.key]} alt="" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                <div className="upload-main">
                  <div className="upload-name">{r.name}</div>
                  <div className="upload-stage">{stageLabel(r)}</div>
                  {r.stage === "failed" && r.note && <div className="upload-note bad">{r.note}</div>}
                  {r.stage === "done" && r.pieces.length === 0 && r.note && <div className="upload-note">{r.note}</div>}
                  {r.pieces.length > 0 && <div className="upload-pieces">{r.pieces.map((p) => p.name).join(", ")}</div>}
                  <div className="upload-steps" aria-hidden="true">
                    {stepStates(r.stage).map((s, i) => (
                      <span key={i} className={`upload-step ${s}`} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {running && <p className="hint upload-keep-open">Keep this page open while your photos are read.</p>}
        </div>
      )}

      {staying && result && (
        <div className="upload-report">
          {result.ids.length > 0 && (
            <div className="ok">
              Hung {result.ids.length} piece{result.ids.length === 1 ? "" : "s"} on the rail.
            </div>
          )}
          {result.skipped > 0 && (
            <div className="ok">
              Skipped {result.skipped} photo{result.skipped === 1 ? "" : "s"} with more than one person in them.
            </div>
          )}
          {result.failures.length > 0 && (
            <div className="bad">
              {result.failures.length} photo{result.failures.length === 1 ? "" : "s"} couldn&rsquo;t be read. The reason is shown on each one above.
            </div>
          )}
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => router.push(onboarding && result.ids.length > 0 ? `/?hung=${result.ids.length}` : "/")}
          >
            Go to the rail
          </button>
        </div>
      )}

      {!running && (
        <div className="actions">
          <button type="submit" className="btn" disabled={files.length === 0}>
            {files.length > 1 ? `Read & hang ${files.length} photos` : "Read & hang on the rail"}
          </button>
        </div>
      )}
    </form>
  );
}
