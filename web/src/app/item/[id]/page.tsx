import Link from "next/link";
import { notFound } from "next/navigation";
import { getItem, getItems } from "@/lib/items";
import { pairingsFor } from "@/lib/pairings";
import { ImageCorrection } from "@/components/ImageCorrection";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const allItems = await getItems();
  const pairings = pairingsFor(item, allItems);
  const dots = "●".repeat(item.formality || 1) + "○".repeat(Math.max(0, 5 - (item.formality || 1)));

  return (
    <div className="detail">
      <Link href="/" className="detail-back">
        ← Back to the rail
      </Link>

      <div className="detail-top">
        <div className="detail-image">
          {item.imageUrl && <img src={item.imageUrl} alt="" />}
        </div>
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
            <ImageCorrection
              itemId={item.id}
              originalImageUrl={item.originalImageUrl}
              canUndo={item.canUndo}
            />
          </div>
        </div>
      </div>

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
    </div>
  );
}
