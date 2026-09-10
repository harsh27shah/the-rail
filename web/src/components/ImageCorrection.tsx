"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  correctImageAction,
  resetToOriginalAction,
  undoCorrectionAction,
} from "@/app/item/[id]/correct-actions";

/**
 * Free-form feedback is the whole interaction — no preset category buttons. Validated
 * directly (see PROJECT.md §5) that vague feedback ("something's off") barely changes the
 * result, while specific feedback ("too shiny, should be matte") measurably does. Rather
 * than guess at a fixed set of reasons, the field itself asks for specificity and the
 * placeholder shows what that level of detail actually looks like — the user drives it.
 *
 * Also the escape hatch when a regeneration comes out worse than what it replaced: undo the
 * last correction (fields + photo), or go all the way back to the untouched original.
 */
const EXAMPLE_PLACEHOLDER =
  'e.g. "It\'s a deeper navy blue than this, and the material should look more matte, less shiny."';

export function ImageCorrection({
  itemId,
  originalImageUrl,
  canUndo = false,
  variant = "text",
}: {
  itemId: string;
  originalImageUrl: string | null;
  /** True when the last correction can still be undone (see PROJECT.md §5). */
  canUndo?: boolean;
  /** "text" — full "Not quite right?" button, used on the item detail page.
   *  "icon" — small glyph-only trigger, used on the grid card's hover overlay. */
  variant?: "text" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<null | "correct" | "undo" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  function openModal(e: React.MouseEvent) {
    e.stopPropagation(); // safe to always call — no-op when there's no parent card to affect
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setFeedback("");
    setError(null);
  }

  async function submit() {
    if (!feedback.trim()) {
      setError("Describe what's wrong first");
      return;
    }
    setBusy("correct");
    setError(null);
    const result = await correctImageAction(itemId, feedback.trim());
    setBusy(null);
    if (result.ok) {
      closeModal();
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  async function runRevert(kind: "undo" | "reset") {
    setBusy(kind);
    setError(null);
    const result =
      kind === "undo" ? await undoCorrectionAction(itemId) : await resetToOriginalAction(itemId);
    setBusy(null);
    if (result.ok) {
      closeModal();
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  const working = busy !== null;

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

              {(canUndo || originalImageUrl) && (
                <div className="correction-reverts">
                  <p className="hint" style={{ margin: "0 0 6px" }}>
                    Last try came out worse?
                  </p>
                  {canUndo && (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => runRevert("undo")}
                      disabled={working}
                    >
                      {busy === "undo" ? "Undoing…" : "Undo last correction"}
                    </button>
                  )}
                  {originalImageUrl && (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => runRevert("reset")}
                      disabled={working}
                    >
                      {busy === "reset" ? "Resetting…" : "Reset to original photo"}
                    </button>
                  )}
                </div>
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
                disabled={working}
              />
              {error && <div className="status err">{error}</div>}
              <div className="actions">
                <button type="button" className="btn ghost" onClick={closeModal} disabled={working}>
                  Cancel
                </button>
                <button type="button" className="btn" onClick={submit} disabled={working}>
                  {busy === "correct" ? "Regenerating…" : "Regenerate photo"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
