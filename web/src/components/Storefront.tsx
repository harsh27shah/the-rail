"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type Category, type Item } from "@/lib/types";
import { pairingsFor } from "@/lib/pairings";
import { coverageGap } from "@/lib/coverage";
import { ItemCard } from "./ItemCard";
import { bulkDeleteAction } from "@/app/actions";

const NEUTRALS = ["black", "white", "grey", "gray", "navy", "beige", "cream", "brown", "tan", "charcoal"];

export function Storefront({ items }: { items: Item[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Which category's coverage-gap popover is open (see lib/coverage.ts), and where to draw
  // it. Was a native `title` tooltip — too imprecise to hit and too slow to appear, and
  // doesn't exist at all on tap/mobile, which is this app's primary surface (PROJECT.md
  // §1). A real popover opens instantly on hover (desktop) and toggles on tap (mobile),
  // with a bigger hit area than the dot itself. Rendered via a portal at a computed fixed
  // position rather than inline — `.rail` has `overflow-x: auto`, which (per the CSS spec)
  // forces `overflow-y` to clip too, so an inline absolutely-positioned popover was
  // rendering but invisible, cut off by its own scrolling ancestor. Same class of bug as
  // the correction modal's containing-block issue; same fix (escape via portal).
  const [gapPopover, setGapPopover] = useState<{ category: Category; top: number; left: number } | null>(
    null
  );
  const railRef = useRef<HTMLDivElement>(null);

  const POPOVER_WIDTH = 220;
  const POPOVER_MARGIN = 8;

  function openGapPopover(category: Category, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    // Anchor the popover's right edge to the dot's, but clamp to the viewport — a chip near
    // the left edge (e.g. "Tops", right after "All") would otherwise push it off-screen.
    const left = Math.min(
      Math.max(rect.right - POPOVER_WIDTH, POPOVER_MARGIN),
      window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN
    );
    setGapPopover({ category, top: rect.bottom + 4, left });
  }

  useEffect(() => {
    if (!gapPopover) return;
    function handleOutsideClick(e: MouseEvent) {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setGapPopover(null);
      }
    }
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [gapPopover]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setDeleteError(null);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await bulkDeleteAction(Array.from(selected));
      exitSelectMode();
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not remove those pieces");
    } finally {
      setDeleting(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.category] = (c[it.category] ?? 0) + 1;
    return c;
  }, [items]);

  // A category with a defined coverage minimum (see lib/coverage.ts) surfaces in the filter
  // rail even at zero items, so a genuinely missing essential (e.g. no bottoms at all) still
  // gets its nudge — not just categories the owner happens to have already started.
  const presentCategories = CATEGORIES.filter((c) => counts[c] || coverageGap(c, 0));

  const visible = items.filter((it) => {
    if (filter !== "All" && it.category !== filter) return false;
    if (!query) return true;
    const haystack = `${it.name} ${it.color} ${it.category} ${it.notes}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const duplicateCount = items.filter((it) => it.duplicateOfId).length;

  const swatches = items.flatMap((it) => it.palette).slice(0, 14);
  const nonNeutralCount = items.filter(
    (it) => !NEUTRALS.some((n) => it.color.toLowerCase().includes(n))
  ).length;

  // The same coverage message as the filter pill's popover, surfaced again once the owner
  // has actually landed on that category — the moment they're looking right at how few
  // pieces are there, not something they have to notice a small dot to discover.
  const activeGap = filter !== "All" ? coverageGap(filter as Category, counts[filter] ?? 0) : null;

  return (
    <>
      <div className="strip">
        {items.length === 0 ? (
          <span>Nothing on the rail yet</span>
        ) : (
          <>
            <span>
              <b>{items.length}</b> pieces
            </span>
            <span>
              <b>{presentCategories.length}</b> of {CATEGORIES.length} categories
            </span>
            <span>
              <b>{Math.round((nonNeutralCount / items.length) * 100)}%</b> non-neutral
            </span>
            {swatches.length > 0 && (
              <span className="swatch-row">
                {swatches.map((h, i) => (
                  <span key={i} className="swatch" style={{ background: h }} />
                ))}
              </span>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {selectMode ? (
                <>
                  <button
                    className="btn ghost small"
                    onClick={handleBulkDelete}
                    disabled={selected.size === 0 || deleting}
                  >
                    {deleting ? "Removing…" : `Remove ${selected.size || ""}`.trim()}
                  </button>
                  <button className="btn ghost small" onClick={exitSelectMode} disabled={deleting}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn ghost small" onClick={() => setSelectMode(true)}>
                  Select
                </button>
              )}
            </span>
          </>
        )}
      </div>

      <div className="rail" ref={railRef}>
        {duplicateCount > 0 && (
          <Link href="/duplicates" className="chip chip-dupes">
            Review duplicates · {duplicateCount}
          </Link>
        )}
        {["All", ...presentCategories].map((c) => {
          const gap = c !== "All" ? coverageGap(c as Category, counts[c] ?? 0) : null;
          return (
            <button
              key={c}
              className={`chip${filter === c ? " active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {gap && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={gap.message}
                  className="chip-alert"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (gapPopover?.category === c) setGapPopover(null);
                    else openGapPopover(c as Category, e.currentTarget);
                  }}
                  onMouseEnter={(e) => openGapPopover(c as Category, e.currentTarget)}
                  onMouseLeave={() => setGapPopover((cur) => (cur?.category === c ? null : cur))}
                  onFocus={(e) => openGapPopover(c as Category, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      if (gapPopover?.category === c) setGapPopover(null);
                      else openGapPopover(c as Category, e.currentTarget);
                    }
                  }}
                >
                  <span className="chip-alert-dot" aria-hidden="true" />
                </span>
              )}
              {c}
              {c !== "All" ? ` · ${counts[c] ?? 0}` : ""}
            </button>
          );
        })}
        {gapPopover &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="chip-gap-popover"
              style={{ top: gapPopover.top, left: gapPopover.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {coverageGap(gapPopover.category, counts[gapPopover.category] ?? 0)?.message}
            </div>,
            document.body
          )}
        <input
          className="search"
          type="text"
          placeholder="Search the rail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {deleteError && (
        <div className="status err" style={{ padding: "0 24px" }}>
          {deleteError}
        </div>
      )}

      {activeGap && <div className="coverage-banner">{activeGap.message}</div>}

      <div className="grid">
        {visible.length === 0 ? (
          <div className="empty-state">
            <h2>{items.length ? "Nothing matches" : "The rail is empty"}</h2>
            <p>
              {items.length
                ? "Try a different category or search."
                : "Add your first piece and it gets read, tagged, and hung here."}
            </p>
            {!items.length && (
              <Link href="/add" className="btn">
                + Add a piece
              </Link>
            )}
          </div>
        ) : (
          visible.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              pairings={pairingsFor(it, items)}
              selectMode={selectMode}
              selected={selected.has(it.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>
    </>
  );
}
