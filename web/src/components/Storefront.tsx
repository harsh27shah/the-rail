"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type Item } from "@/lib/types";
import { pairingsFor } from "@/lib/pairings";
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

  const presentCategories = CATEGORIES.filter((c) => counts[c]);

  const visible = items.filter((it) => {
    if (filter !== "All" && it.category !== filter) return false;
    if (!query) return true;
    const haystack = `${it.name} ${it.color} ${it.category} ${it.notes}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const swatches = items.flatMap((it) => it.palette).slice(0, 14);
  const nonNeutralCount = items.filter(
    (it) => !NEUTRALS.some((n) => it.color.toLowerCase().includes(n))
  ).length;

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
          </>
        )}
      </div>

      <div className="rail">
        {["All", ...presentCategories].map((c) => (
          <button
            key={c}
            className={`chip${filter === c ? " active" : ""}`}
            onClick={() => setFilter(c)}
          >
            {c}
            {c !== "All" ? ` · ${counts[c]}` : ""}
          </button>
        ))}
        <input
          className="search"
          type="text"
          placeholder="Search the rail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {items.length > 0 &&
          (selectMode ? (
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
          ))}
      </div>

      {deleteError && (
        <div className="status err" style={{ padding: "0 24px" }}>
          {deleteError}
        </div>
      )}

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
