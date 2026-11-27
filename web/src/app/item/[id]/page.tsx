import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getItem, getItems } from "@/lib/items";
import { pairingsFor } from "@/lib/pairings";
import { eligibleItems, isStale, wardrobeReadiness } from "@/lib/outfits";
import type { Item } from "@/lib/types";
import { isBeingGenerated, loadSet } from "@/lib/outfit-store";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ImageCorrection } from "@/components/ImageCorrection";
import { MarkDuplicate } from "@/components/MarkDuplicate";
import { OutfitsSection, type OutfitsState } from "@/components/OutfitsSection";

// Working out a piece's outfits happens from this page (see outfit-actions.ts) and takes
// several seconds, so give it room.
export const maxDuration = 60;

/** What the Outfits section should show for this item. Reads only: nothing is generated here. */
async function outfitsStateFor(userId: string, item: Item, allItems: Item[]): Promise<OutfitsState | null> {
  try {
    const eligible = eligibleItems(allItems);
    const readiness = wardrobeReadiness(eligible, item);
    if (readiness.kind === "too-small") return { ...readiness };

    const saved = await loadSet(userId, item.id);
    if (saved?.status === "ready" && !isStale(saved, eligible, item.id)) {
      const byId = new Map(allItems.map((i) => [i.id, i]));
      const outfits = saved.outfits
        .filter((o) => o.itemIds.every((id) => byId.has(id)))
        .map((o) => ({
          why: o.why,
          tiles: o.itemIds.map((id) => {
            const it = byId.get(id)!;
            return { id: it.id, name: it.name, category: it.category, imageUrl: it.imageUrl, isHero: it.id === item.id };
          }),
        }));
      if (outfits.length) return { kind: "ready", outfits };
    }
    if (isBeingGenerated(saved)) return { kind: "waiting" };
    if (saved?.status === "failed") return { kind: "failed" };
    return { kind: "generate" };
  } catch (e) {
    // Most likely the outfit_sets table hasn't been created yet. Fall back to the old
    // single-item suggestions rather than breaking the page.
    console.error("[outfits] couldn't read saved outfits:", e);
    return null;
  }
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const item = await getItem(user.id, id);
  if (!item) notFound();

  const allItems = await getItems(user.id);
  const outfitsState = await outfitsStateFor(user.id, item, allItems);
  const pairings = outfitsState ? [] : pairingsFor(item, allItems);
  const dots = "●".repeat(item.formality || 1) + "○".repeat(Math.max(0, 5 - (item.formality || 1)));

  return (
    <div className="detail">
      <Link href="/" className="detail-back">
        ← Back to the rail
      </Link>

      <div className="detail-top">
        <div className="detail-image">
          {item.cleaning ? (
            <div className="cleaning" role="status">
              <span>Cleaning up photo</span>
            </div>
          ) : (
            item.imageUrl && <img src={item.imageUrl} alt="" />
          )}
        </div>
        {/* Checks back by itself while the clean photo is on its way (lib/cleaning.ts). */}
        <AutoRefresh active={!!item.cleaning} />
        <div className="detail-info">
          <h2>{item.name}</h2>
          <div className="detail-sub">
            {item.category} · {item.color}
          </div>
          {item.needsReview && (
            <p className="review-note">
              Part of this piece was hidden in the photo, so some details are a best guess
              {item.reviewNote ? ` (${item.reviewNote})` : ""}. Worth a look — edit anything that&rsquo;s off.
            </p>
          )}
          {item.duplicateOfId && (
            <p className="review-note">
              This looks like it might be the same piece as something already on the rail.{" "}
              <Link href="/duplicates">Review it</Link>.
            </p>
          )}
          <div className="detail-facts">
            <div>
              Formality
              <b>{dots}</b>
            </div>
            <div>
              Pattern
              <b>{item.pattern || "—"}</b>
            </div>
            <div>
              Material
              <b>{item.material || "—"}</b>
            </div>
            <div>
              Seasons
              <b>{item.seasons.map((s) => s.slice(0, 2).toUpperCase()).join(" ") || "—"}</b>
            </div>
          </div>
          {item.notes && <p className="detail-notes">{item.notes}</p>}
          <div className="swatch-row" style={{ marginBottom: 22 }}>
            {item.palette.map((h, i) => (
              <span key={i} className="swatch" style={{ background: h }} />
            ))}
          </div>
          <div className="detail-actions">
            <Link href={`/item/${item.id}/edit`} className="btn ghost">
              Edit details
            </Link>
            {!item.cleaning && (
              <ImageCorrection
                itemId={item.id}
                originalImageUrl={item.originalImageUrl}
                canUndo={item.canUndo}
              />
            )}
            <MarkDuplicate
              itemId={item.id}
              category={item.category}
              candidates={allItems
                .filter((it) => it.id !== item.id)
                .map((it) => ({
                  id: it.id,
                  name: it.name,
                  category: it.category,
                  color: it.color,
                  imageUrl: it.imageUrl,
                }))}
            />
          </div>
        </div>
      </div>

      {item.cleaning ? (
        // Outfits are worked out from this piece's photo, so they wait for the clean one.
        <div className="pairing-section">
          <h3>Outfits</h3>
          <p className="pairing-empty">Outfits will appear once this photo is ready.</p>
        </div>
      ) : outfitsState ? (
        <OutfitsSection key={outfitsState.kind} itemId={item.id} state={outfitsState} />
      ) : (
        <div className="pairing-section">
          <h3>Styles well with</h3>
          {pairings.length ? (
            <div className="pairing-grid">
              {pairings.map((p) => (
                <Link key={p.id} href={`/item/${p.id}`} className="pairing-item">
                  <div className="frame">{p.imageUrl && <img src={p.imageUrl} alt="" />}</div>
                  <div className="name">{p.name}</div>
                  <div className="sub">
                    {p.category} · {p.color}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="pairing-empty">No pairing suggestions yet for this piece.</p>
          )}
        </div>
      )}
    </div>
  );
}
