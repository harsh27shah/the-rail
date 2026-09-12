"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { markDuplicateAction } from "@/app/item/[id]/duplicate-actions";

export interface DuplicateCandidateItem {
  id: string;
  name: string;
  category: string;
  color: string;
  imageUrl: string | null;
}

/**
 * The owner's own "I know these are the same piece" call — automatic detection
 * (src/app/add/actions.ts) will never be foolproof: an occluded photo doesn't give it
 * enough to compare, and two independent AI-generated shots of the same real garment can
 * render differently enough to miss each other (see PROJECT.md §5). Rather than wait on a
 * match that might never come, the owner can search the rest of the wardrobe from here and
 * point straight at the other item. Same-category items are listed first since that's the
 * overwhelmingly common case, but the search box reaches everything in case a garment was
 * ever miscategorised.
 */
export function MarkDuplicate({
  itemId,
  category,
  candidates,
}: {
  itemId: string;
  category: string;
  candidates: DuplicateCandidateItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function openModal(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(true);
  }

  function closeModal() {
    if (busyId) return;
    setOpen(false);
    setQuery("");
    setError(null);
    setDone(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? candidates.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q) ||
            c.color.toLowerCase().includes(q)
        )
      : candidates;
    // Same category first — a duplicate is almost always the same category, but a search
    // query can still surface a miscategorised match further down rather than hiding it.
    return [...matches].sort((a, b) => {
      const aSame = a.category === category ? 0 : 1;
      const bSame = b.category === category ? 0 : 1;
      return aSame - bSame;
    });
  }, [candidates, query, category]);

  async function pick(candidate: DuplicateCandidateItem) {
    setBusyId(candidate.id);
    setError(null);
    const result = await markDuplicateAction(itemId, candidate.id);
    setBusyId(null);
    if (result.ok) {
      setDone(candidate.name);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <button type="button" className="btn ghost" onClick={openModal}>
        Mark as duplicate
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="modal-veil" onClick={closeModal}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>Mark as duplicate</h3>

              {done ? (
                <>
                  <p className="hint" style={{ margin: "8px 0 18px" }}>
                    Linked to &ldquo;{done}&rdquo; — it&rsquo;ll show up next time you review
                    duplicates. Nothing&rsquo;s been removed yet.
                  </p>
                  <div className="actions">
                    <button type="button" className="btn" onClick={closeModal}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint" style={{ margin: "0 0 12px" }}>
                    Which piece already on the rail is this the same as?
                  </p>
                  <input
                    type="text"
                    placeholder="Search by name, colour, or category…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                  {error && <div className="status err">{error}</div>}
                  <div className="dup-picker-list">
                    {filtered.length === 0 && (
                      <p className="hint" style={{ margin: "12px 0" }}>
                        Nothing matches that search.
                      </p>
                    )}
                    {filtered.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="dup-picker-row"
                        disabled={busyId !== null}
                        onClick={() => pick(c)}
                      >
                        <span className="dup-picker-frame">
                          {c.imageUrl && <img src={c.imageUrl} alt="" />}
                        </span>
                        <span className="dup-picker-info">
                          <span className="name">{c.name}</span>
                          <span className="sub">
                            {c.category} · {c.color}
                          </span>
                        </span>
                        {busyId === c.id && <span className="hint">Linking…</span>}
                      </button>
                    ))}
                  </div>
                  <div className="actions">
                    <button type="button" className="btn ghost" onClick={closeModal}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
