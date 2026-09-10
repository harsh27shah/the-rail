"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { correctImageAction } from "@/app/item/[id]/correct-actions";

/**
 * Free-form feedback is the whole interaction — no preset category buttons. Validated
 * directly (see PROJECT.md §5) that vague feedback ("something's off") barely changes the
 * result, while specific feedback ("too shiny, should be matte") measurably does. Rather
 * than guess at a fixed set of reasons, the field itself asks for specificity and the
 * placeholder shows what that level of detail actually looks like — the user drives it.
 */
const EXAMPLE_PLACEHOLDER =
  'e.g. "It\'s a deeper navy blue than this, and the material should look more matte, less shiny."';

export function ImageCorrection({
  itemId,
  originalImageUrl,
  variant = "text",
}: {
  itemId: string;
  originalImageUrl: string | null;
  /** "text" — full "Not quite right?" button, used on the item detail page.
   *  "icon" — small glyph-only trigger, used on the grid card's hover overlay. */
  variant?: "text" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal(e: React.MouseEvent) {
    e.stopPropagation(); // safe to always call — no-op when there's no parent card to affect
    setOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setFeedback("");
    setError(null);
  }

  async function submit() {
    if (!feedback.trim()) {
      setError("Describe what's wrong first");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await correctImageAction(itemId, feedback.trim());
    setSubmitting(false);
    if (result.ok) {
      closeModal();
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          className="card-flag"
          onClick={openModal}
          aria-label="Not quite right? Fix this photo"
          title="Not quite right? Fix this photo"
        >
          ↻
        </button>
      ) : (
        <button type="button" className="btn ghost" onClick={openModal}>
          Not quite right?
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="modal-veil" onClick={closeModal}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <h3>Not quite right?</h3>

              {originalImageUrl && (
                <>
                  <label>Your original photo</label>
                  <div className="correction-reference">
                    <img src={originalImageUrl} alt="Your original upload" />
                  </div>
                </>
              )}

              <label htmlFor="correction-feedback">What&rsquo;s off about the photo?</label>
              <p className="hint" style={{ margin: "0 0 8px" }}>
                Be as specific as you can — it makes a real difference to the result.
              </p>
              <textarea
                id="correction-feedback"
                rows={4}
                placeholder={EXAMPLE_PLACEHOLDER}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={submitting}
              />
              {error && <div className="status err">{error}</div>}
              <div className="actions">
                <button type="button" className="btn ghost" onClick={closeModal} disabled={submitting}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={submit} disabled={submitting}>
                  {submitting ? "Regenerating…" : "Regenerate photo"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
