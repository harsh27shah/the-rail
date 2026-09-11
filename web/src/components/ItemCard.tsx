"use client";

import { useRouter } from "next/navigation";
import type { Item } from "@/lib/types";
import { ImageCorrection } from "./ImageCorrection";

function seasonCode(s: string) {
  return s.slice(0, 2).toUpperCase();
}

export function ItemCard({
  item,
  pairings,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: Item;
  pairings: Item[];
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const router = useRouter();

  function handleActivate() {
    if (selectMode) onToggleSelect?.(item.id);
    else router.push(`/item/${item.id}`);
  }

  return (
    <div
      className="card"
      data-id={item.id}
      tabIndex={0}
      role={selectMode ? "checkbox" : "link"}
      aria-checked={selectMode ? selected : undefined}
      aria-label={selectMode ? `Select ${item.name}` : `View ${item.name}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleActivate();
      }}
      style={selectMode ? { opacity: selected ? 1 : 0.55 } : undefined}
    >
      <div className={`frame${item.imageUrl ? "" : " empty"}`}>
        {item.imageUrl && <img src={item.imageUrl} alt="" />}
        {!selectMode && (item.needsReview || item.duplicateOfId) && (
          <div className="card-badges">
            {item.duplicateOfId && (
              <span
                className="review-badge badge-dupe"
                title={item.duplicateNote ?? "This might be the same piece as something already on the rail"}
              >
                Possible dupe
              </span>
            )}
            {item.needsReview && (
              <span
                className="review-badge badge-check"
                title={item.reviewNote ?? "Some details were inferred from the photo — worth a check"}
              >
                Check
              </span>
            )}
          </div>
        )}
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            readOnly
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              width: 18,
              height: 18,
              zIndex: 2,
              accentColor: "var(--accent)",
            }}
          />
        )}
        <div className="overlay">
          {!selectMode && (
            <div className="card-top-actions">
              <button
                type="button"
                className="card-edit"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/item/${item.id}/edit`);
                }}
              >
                Edit
              </button>
              <ImageCorrection
                itemId={item.id}
                originalImageUrl={item.originalImageUrl}
                canUndo={item.canUndo}
                variant="icon"
              />
            </div>
          )}
          <div className="overlay-info">
            <div className="name">{item.name}</div>
            <div>
              <span className="k">FRM</span> {"●".repeat(item.formality || 1)}
            </div>
            <div>
              <span className="k">PAT</span> {(item.pattern || "—").slice(0, 8)}
            </div>
            <div>
              <span className="k">MAT</span> {(item.material || "—").slice(0, 16)}
            </div>
            <div>
              <span className="k">SSN</span> {item.seasons.map(seasonCode).join(" ") || "—"}
            </div>
            <div className="swatch-row" style={{ marginTop: 5 }}>
              {item.palette.slice(0, 4).map((h, i) => (
                <span key={i} className="swatch" style={{ background: h }} />
              ))}
            </div>
          </div>
          <div className="pair-pills">
            {pairings.length ? (
              pairings.map((p) => (
                <span key={p.id} className="pair-pill">
                  {p.name}
                </span>
              ))
            ) : (
              <span className="pair-pills-empty">No pairings yet</span>
            )}
          </div>
        </div>
      </div>
      <div className="meta">
        <div className="name">{item.name}</div>
        <div className="sub">
          {item.category} · {item.color}
        </div>
      </div>
    </div>
  );
}
