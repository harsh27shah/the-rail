"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPhotoAction, addPhotoWithPersonAction } from "@/app/add/actions";
import { GooglePhotosImport } from "@/components/GooglePhotosImport";
import type { PersonBox } from "@/lib/gemini";

/**
 * Multi-photo ingestion. The owner picks one photo or many at once; this uploads them one
 * request at a time (see addPhotoAction's comment for why not all-in-one), shows progress,
 * and doesn't abort the run if a single photo fails. On success it navigates the same way
 * the old single-photo flow did: one new item → its detail page, anything else → the
 * storefront where they all appear together.
 *
 * When a photo has more than one person in it, the loop pauses on that photo and shows a
 * "which one is you?" picker instead of guessing or silently mixing two wardrobes together
 * (see addPhotoAction's comment, and PROJECT.md §5). The pause is implemented as a promise
 * the loop awaits and a ref holds the resolver for — the tap (or "skip this photo") handler
 * resolves it, and the loop picks back up from there.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "needs-selection"; done: number; total: number; previewUrl: string; people: PersonBox[] }
  | { kind: "done"; created: number; skipped: number; failures: string[] };

type SelectionChoice = { type: "box"; box: PersonBox["box"] } | { type: "skip" };

export function AddPhotosForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const selectionResolver = useRef<((choice: SelectionChoice) => void) | null>(null);

  const working = phase.kind === "working" || phase.kind === "needs-selection";

  function waitForSelection(): Promise<SelectionChoice> {
    return new Promise((resolve) => {
      selectionResolver.current = resolve;
    });
  }

  function resolveSelection(choice: SelectionChoice) {
    selectionResolver.current?.(choice);
    selectionResolver.current = null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || working) return;

    const allIds: string[] = [];
    const failures: string[] = [];
    let skipped = 0;

    for (let i = 0; i < files.length; i++) {
      setPhase({ kind: "working", done: i, total: files.length });
      const fd = new FormData();
      fd.append("photo", files[i]);

      let result;
      try {
        result = await addPhotoAction(fd);
      } catch (err) {
        failures.push(`${files[i].name} — ${err instanceof Error ? err.message : "failed"}`);
        continue;
      }

      if (result.kind === "needs-selection") {
        const previewUrl = URL.createObjectURL(files[i]);
        setPhase({ kind: "needs-selection", done: i, total: files.length, previewUrl, people: result.people });
        const choice = await waitForSelection();
        URL.revokeObjectURL(previewUrl);

        if (choice.type === "skip") {
          skipped++;
          continue;
        }

        setPhase({ kind: "working", done: i, total: files.length });
        const fd2 = new FormData();
        fd2.append("photo", files[i]);
        fd2.append("box", JSON.stringify(choice.box));
        try {
          result = await addPhotoWithPersonAction(fd2);
        } catch (err) {
          failures.push(`${files[i].name} — ${err instanceof Error ? err.message : "failed"}`);
          continue;
        }
      }

      if (result.kind === "added") allIds.push(...result.ids);
      else if (result.kind === "error") failures.push(`${files[i].name} — ${result.error}`);
    }

    if (allIds.length === 1 && failures.length === 0 && skipped === 0) {
      router.push(`/item/${allIds[0]}`);
      return;
    }

    router.refresh();
    if (failures.length === 0 && skipped === 0) {
      router.push("/");
    } else {
      // Keep the owner here so they can see which photos didn't take or were skipped.
      setPhase({ kind: "done", created: allIds.length, skipped, failures });
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="photos">{files.length > 1 ? "Photos" : "Photo"}</label>
      <input
        ref={inputRef}
        id="photos"
        name="photos"
        type="file"
        accept="image/*"
        multiple
        disabled={working}
        onChange={(e) => {
          setFiles(Array.from(e.target.files ?? []));
          setPhase({ kind: "idle" });
        }}
      />

      {phase.kind === "idle" && files.length > 0 && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          {files.length} photo{files.length === 1 ? "" : "s"} selected.
        </p>
      )}

      {phase.kind !== "needs-selection" && (
        <div className="add-alt-source">
          <span className="hint">or</span>
          <GooglePhotosImport
            disabled={working}
            onImported={(imported) => {
              setFiles((prev) => [...prev, ...imported]);
              setPhase({ kind: "idle" });
            }}
          />
        </div>
      )}

      {phase.kind === "working" && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          Reading photo {phase.done + 1} of {phase.total}…
        </p>
      )}

      {phase.kind === "needs-selection" && (
        <div className="person-picker">
          <p className="hint" style={{ margin: "8px 0 10px" }}>
            Photo {phase.done + 1} of {phase.total} has more than one person in it. Tap the
            one that&rsquo;s you.
          </p>
          <div className="person-picker-frame">
            <img src={phase.previewUrl} alt="" />
            {phase.people.map((p, idx) => {
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
                  onClick={() => resolveSelection({ type: "box", box: p.box })}
                  aria-label={`This is me — ${p.label}`}
                >
                  <span className="person-picker-label">{p.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn ghost small"
            style={{ marginTop: 10 }}
            onClick={() => resolveSelection({ type: "skip" })}
          >
            None of these are me — skip this photo
          </button>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="upload-report">
          {phase.created > 0 && (
            <div className="ok">
              Hung {phase.created} piece{phase.created === 1 ? "" : "s"} on the rail.
            </div>
          )}
          {phase.skipped > 0 && (
            <div className="ok">
              Skipped {phase.skipped} photo{phase.skipped === 1 ? "" : "s"} with more than one
              person in them.
            </div>
          )}
          {phase.failures.length > 0 && (
            <div className="bad">
              {phase.failures.length} photo{phase.failures.length === 1 ? "" : "s"} couldn&rsquo;t be read:
              <ul>
                {phase.failures.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => router.push("/")}
          >
            Go to the rail
          </button>
        </div>
      )}

      {phase.kind !== "needs-selection" && (
        <div className="actions">
          <button type="submit" className="btn" disabled={working || files.length === 0}>
            {phase.kind === "working"
              ? `Reading ${phase.done + 1} of ${phase.total}…`
              : files.length > 1
                ? `Read & hang ${files.length} photos`
                : "Read & hang on the rail"}
          </button>
        </div>
      )}
    </form>
  );
}
