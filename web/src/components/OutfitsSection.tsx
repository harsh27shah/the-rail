"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { generateOutfitsAction } from "@/app/item/[id]/outfit-actions";

/**
 * "Outfits" on an item's page (recommended outfits, milestone M1): up to four whole outfits
 * built around this piece, each shown as its pieces side by side with one line on why it works.
 * Replaces the old row of single "styles well with" items. See lib/outfits.ts for the rules.
 *
 * The server page decides what state to show; this component only does the two things that need
 * a browser: ask for outfits to be worked out when there are none saved (a few seconds, once per
 * item), and keep checking while another tab is already doing that.
 */

export interface OutfitTile {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  isHero: boolean;
}
export interface OutfitView {
  why: string;
  tiles: OutfitTile[];
}

export type OutfitsState =
  | { kind: "ready"; outfits: OutfitView[] }
  | { kind: "generate" } // none saved (or out of date): work them out now
  | { kind: "waiting" } // being worked out elsewhere: check back
  | { kind: "failed" }
  | { kind: "too-small"; tops: number; bottoms: number; minTops: number; minBottoms: number };

const POLL_MS = 4000;
const POLL_MAX = 30; // two minutes, then offer a manual retry

export function OutfitsSection({ itemId, state }: { itemId: string; state: OutfitsState }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"working" | "waiting" | "failed">(
    state.kind === "waiting" ? "waiting" : state.kind === "failed" ? "failed" : "working"
  );
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setPhase("working");
    setMessage(null);
    try {
      const result = await generateOutfitsAction(itemId);
      if (result.kind === "ready" || result.kind === "too-small") router.refresh();
      else if (result.kind === "busy") setPhase("waiting");
      else {
        setMessage(result.message);
        setPhase("failed");
      }
    } catch {
      setMessage("Couldn't put outfits together just now. Try again in a moment.");
      setPhase("failed");
    }
  }

  // Work outfits out once when the page finds none saved. The ref stops a double run (React runs
  // effects twice in development); the server also refuses a second live request for the same item.
  useEffect(() => {
    if (state.kind !== "generate" || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While another tab is generating, look again every few seconds.
  useEffect(() => {
    if (phase !== "waiting") return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (tries > POLL_MAX) {
        clearInterval(timer);
        setMessage("This is taking longer than usual.");
        setPhase("failed");
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, router]);

  return (
    <div className="outfits-section">
      <h3>Outfits</h3>

      {state.kind === "ready" && (
        <div className="outfit-list">
          {state.outfits.map((o, i) => (
            <div key={i} className="outfit">
              <div className="outfit-num">{String(i + 1).padStart(2, "0")}</div>
              <div className="outfit-body">
                <div className="outfit-tiles" style={{ ["--n" as string]: o.tiles.length }}>
                  {o.tiles.map((t) =>
                    t.isHero ? (
                      <div key={t.id} className="outfit-tile is-hero">
                        <div className="frame">{t.imageUrl && <img src={t.imageUrl} alt="" />}</div>
                        <div className="sub">This piece</div>
                      </div>
                    ) : (
                      <Link key={t.id} href={`/item/${t.id}`} className="outfit-tile">
                        <div className="frame">{t.imageUrl && <img src={t.imageUrl} alt="" />}</div>
                        <div className="name">{t.name}</div>
                        <div className="sub">{t.category}</div>
                      </Link>
                    )
                  )}
                </div>
                <p className="outfit-why">{o.why}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {state.kind === "too-small" && (
        <p className="outfits-note">
          Outfits need a little more to work with. Add at least {state.minTops} tops and{" "}
          {state.minBottoms} bottoms to the rail and they&rsquo;ll appear here. You have {state.tops}{" "}
          top{state.tops === 1 ? "" : "s"} and {state.bottoms} bottom{state.bottoms === 1 ? "" : "s"} so far.
        </p>
      )}

      {state.kind !== "ready" && state.kind !== "too-small" && phase !== "failed" && (
        <p className="outfits-note outfits-working" role="status">
          Putting outfits together for this piece. It takes a few seconds.
        </p>
      )}

      {state.kind !== "ready" && state.kind !== "too-small" && phase === "failed" && (
        <div className="outfits-note">
          <p style={{ margin: "0 0 12px" }}>{message ?? "Couldn't put outfits together just now. Try again in a moment."}</p>
          <button type="button" className="btn ghost" onClick={() => void run()}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
