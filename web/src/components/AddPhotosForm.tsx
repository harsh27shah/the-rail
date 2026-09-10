"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addPhotoAction } from "@/app/add/actions";

/**
 * Multi-photo ingestion. The owner picks one photo or many at once; this uploads them one
 * request at a time (see addPhotoAction's comment for why not all-in-one), shows progress,
 * and doesn't abort the run if a single photo fails. On success it navigates the same way
 * the old single-photo flow did: one new item → its detail page, anything else → the
 * storefront where they all appear together.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "done"; created: number; failures: string[] };

export function AddPhotosForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const working = phase.kind === "working";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || working) return;

    const allIds: string[] = [];
    const failures: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setPhase({ kind: "working", done: i, total: files.length });
      const fd = new FormData();
      fd.append("photo", files[i]);
      try {
        const result = await addPhotoAction(fd);
        if (result.ok) allIds.push(...result.ids);
        else failures.push(`${files[i].name} — ${result.error}`);
      } catch (err) {
        failures.push(`${files[i].name} — ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    if (allIds.length === 1 && failures.length === 0) {
      router.push(`/item/${allIds[0]}`);
      return;
    }

    router.refresh();
    if (failures.length === 0) {
      router.push("/");
    } else {
      // Keep the owner here so they can see which photos didn't take.
      setPhase({ kind: "done", created: allIds.length, failures });
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

      {working && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          Reading photo {phase.done + 1} of {phase.total}…
        </p>
      )}

      {phase.kind === "done" && (
        <div className="upload-report">
          {phase.created > 0 && (
            <div className="ok">
              Hung {phase.created} piece{phase.created === 1 ? "" : "s"} on the rail.
            </div>
          )}
          <div className="bad">
            {phase.failures.length} photo{phase.failures.length === 1 ? "" : "s"} couldn&rsquo;t be read:
            <ul>
              {phase.failures.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
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

      <div className="actions">
        <button type="submit" className="btn" disabled={working || files.length === 0}>
          {working
            ? `Reading ${phase.done + 1} of ${phase.total}…`
            : files.length > 1
              ? `Read & hang ${files.length} photos`
              : "Read & hang on the rail"}
        </button>
      </div>
    </form>
  );
}
