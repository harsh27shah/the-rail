"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { resolveDuplicateAction, type ResolveDuplicateAction } from "@/app/duplicates/actions";
import type { DuplicatePair } from "@/lib/items";

/**
 * The whole duplicate-review queue as one scannable list, not a one-pair-at-a-time stepper —
 * with a wardrobe-sized batch of flagged pairs (a bulk upload can easily produce a dozen),
 * seeing the full scope and being able to work through it in any order beats a modal you have
 * to click through sequentially. Each row is self-contained: both photos, why the model
 * thinks they match, and three actions. Nothing is ever removed automatically.
 */
export function DuplicateQueue({ pairs }: { pairs: DuplicatePair[] }) {
  const router = useRouter();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function resolve(flaggedId: string, action: ResolveDuplicateAction) {
    setBusyId(flaggedId);
    setErrors((prev) => ({ ...prev, [flaggedId]: "" }));
    const result = await resolveDuplicateAction(flaggedId, action);
    setBusyId(null);
    if (result.ok) {
      setResolvedIds((prev) => new Set(prev).add(flaggedId));
      router.refresh();
    } else {
      setErrors((prev) => ({ ...prev, [flaggedId]: result.error }));
    }
  }

  const remaining = pairs.filter((p) => !resolvedIds.has(p.flagged.id));
  if (remaining.length === 0) return null;

  return (
    <div className="dup-list">
      {remaining.map(({ flagged, original }) => (
        <DuplicateRow
          key={flagged.id}
          flagged={flagged}
          original={original}
          busy={busyId === flagged.id}
          error={errors[flagged.id]}
          onResolve={(action) => resolve(flagged.id, action)}
        />
      ))}
    </div>
  );
}

function DuplicateRow({
  flagged,
  original,
  busy,
  error,
  onResolve,
}: {
  flagged: Item;
  original: Item;
  busy: boolean;
  error?: string;
  onResolve: (action: ResolveDuplicateAction) => void;
}) {
  return (
    <div className="dup-row">
      <div className="dup-pair">
        <DuplicateSide item={original} label="Already on the rail" />
        <div className="dup-vs">?</div>
        <DuplicateSide item={flagged} label="Just added" />
      </div>
      {flagged.duplicateNote && <p className="dup-note">&ldquo;{flagged.duplicateNote}&rdquo;</p>}
      {error && <div className="status err">{error}</div>}
      <div className="dup-actions">
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => onResolve("dismiss")}>
          Not the same — keep both
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => onResolve("remove-original")}
        >
          {busy ? "Removing…" : `Remove "${original.name}"`}
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={busy}
          onClick={() => onResolve("remove-flagged")}
        >
          {busy ? "Removing…" : `Remove "${flagged.name}"`}
        </button>
      </div>
    </div>
  );
}

function DuplicateSide({ item, label }: { item: Item; label: string }) {
  return (
    <div className="dup-side">
      <div className="dup-frame">{item.imageUrl && <img src={item.imageUrl} alt="" />}</div>
      <div className="dup-side-label">{label}</div>
      <div className="name">{item.name}</div>
      <div className="sub">
        {item.category} · {item.color}
      </div>
    </div>
  );
}
