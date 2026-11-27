"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OnboardingProgress } from "@/lib/onboarding";

/**
 * The first-run progress panel at the top of the rail (PROJECT.md §5, onboarding step 2). Two
 * looks, chosen by lib/onboarding.ts: "building" (what's still needed for outfits) and "ready"
 * (outfits are possible: open this piece). It disappears on its own once the person has seen
 * outfits (decided on the server from saved outfits, so it's right on phone and computer), and can
 * be hidden by hand: that is remembered on this device only, per look, so the move from "building"
 * to "ready" is a fresh moment and shows again. Phone first: no hover, thumb-sized buttons.
 */

const KEY = "rail-onboarding-hidden";

export function OnboardingPanel({ progress }: { progress: OnboardingProgress }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === progress.kind);
    } catch {
      // storage unavailable (private window): just show it
    }
  }, [progress.kind]);

  if (hidden) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, progress.kind);
    } catch {
      // not remembered: fine
    }
  };

  return (
    <section className="onb-panel" aria-label="Getting started">
      <div className="onb-head">
        <span className="onb-eyebrow">Getting started</span>
        <button type="button" className="onb-hide" onClick={hide}>
          Hide
        </button>
      </div>

      {progress.kind === "building" ? (
        <>
          <h2 className="onb-title">
            <b>{progress.total}</b> of {progress.target} pieces
          </h2>
          <p className="onb-message">{progress.message}</p>
          <ul className="onb-rows">
            {progress.rows.map((r) => (
              <li key={r.category}>
                <span className="onb-cat">{r.category}</span>
                <span className="onb-segs" aria-hidden="true">
                  {Array.from({ length: r.target }, (_, i) => (
                    <i key={i} className={i < r.have ? "on" : ""} />
                  ))}
                </span>
                <span className="onb-num">
                  {Math.min(r.have, r.target)}/{r.target}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/add" className="btn onb-cta">
            + Add more pieces
          </Link>
        </>
      ) : (
        <>
          <h2 className="onb-title">Your outfits are ready</h2>
          <div className="onb-ready">
            <img className="onb-piece" src={progress.piece.imageUrl} alt="" width={72} height={96} />
            <p className="onb-message">
              Open any piece to see outfits built from what you own. The first one can take up to half a
              minute.
            </p>
          </div>
          <Link href={`/item/${progress.piece.id}`} className="btn onb-cta">
            See outfits for this piece
          </Link>
          {progress.roundOut && <p className="onb-quiet">{progress.roundOut}</p>}
        </>
      )}
    </section>
  );
}
