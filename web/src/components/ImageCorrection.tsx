"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctImageAction } from "@/app/item/[id]/correct-actions";

/**
 * Quick-select reasons map to specific, concrete feedback text — not just the button's own
 * label — because vague feedback measurably doesn't work (verified directly: "something's
 * off" produced almost no change, while a specific complaint did). These give people who
 * don't know fashion vocabulary a way to point at *something specific* without having to
 * write it themselves. See PROJECT.md §5.
 */
const REASONS: { label: string; feedback: string }[] = [
  {
    label: "Wrong color",
    feedback:
      "The color is wrong. Look at the original photo again and match the true color more closely.",
  },
  {
    label: "Too shiny — should be matte",
    feedback:
      "The material looks too shiny/glossy, like polished leather. It should look more matte, soft, and textured.",
  },
  {
    label: "Wrong pattern",
    feedback:
      "The pattern is wrong. Check the original photo again and reproduce its actual pattern (stripes, checks, print, etc.) faithfully.",
  },
  {
    label: "Doesn't look like mine",
    feedback:
      "This doesn't resemble the garment in the original photo. Look at the original very carefully and match its true shape, color, and details.",
  },
];

export function ImageCorrection({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const reason = REASONS.find((r) => r.label === selected)?.feedback;
    const feedback = [reason, detail.trim()].filter(Boolean).join(" ");
    if (!feedback) {
      setError("Pick a reason or describe what's wrong first");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await correctImageAction(itemId, feedback);
    setSubmitting(false);
    if (result.ok) {
      setOpen(false);
      setSelected(null);
      setDetail("");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        Not quite right?
      </button>
    );
  }

  return (
    <div className="correction-panel">
      <p className="hint" style={{ margin: "0 0 10px" }}>
        What&rsquo;s off about the photo?
      </p>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {REASONS.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`chip${selected === r.label ? " active" : ""}`}
            onClick={() => setSelected(r.label === selected ? null : r.label)}
            disabled={submitting}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Add detail (optional)"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        disabled={submitting}
      />
      {error && <div className="status err">{error}</div>}
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={submit} disabled={submitting}>
          {submitting ? "Regenerating…" : "Regenerate photo"}
        </button>
      </div>
    </div>
  );
}
