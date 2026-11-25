import Link from "next/link";
import { STARTER_PLAN, STARTER_TOTAL } from "@/lib/coverage";

/**
 * What a brand-new person sees on an empty rail (src/components/Storefront.tsx): what the goal is,
 * what to do, and what will happen. Replaces the bare "The rail is empty". The goal (12 pieces:
 * tops, bottoms, outerwear) comes from lib/coverage.ts so it always matches what the app needs
 * before it can build outfits. Phone first: it stacks to one column.
 */
export function Welcome() {
  return (
    <section className="welcome">
      <p className="welcome-eyebrow">Welcome to The Rail</p>
      <h2>Hang your first {STARTER_TOTAL} pieces</h2>
      <p className="welcome-lede">
        Add about a dozen pieces and The Rail starts putting outfits together from them. Pick photos from
        your phone and it does the rest.
      </p>

      <div className="welcome-goal">
        <span className="welcome-label">What to aim for</span>
        <div className="welcome-goal-row">
          {STARTER_PLAN.map((p) => (
            <div className="welcome-goal-item" key={p.category}>
              <b>{p.min}</b>
              <span>{p.category}</span>
            </div>
          ))}
        </div>
        <p className="welcome-note">Shoes are a bonus. Outfits look more complete with them.</p>
      </div>

      <ol className="welcome-steps">
        <li>
          <span className="welcome-num">01</span>
          <h3>Pick photos</h3>
          <p>Mirror selfies work well. One photo of an outfit can give you a top, trousers and shoes.</p>
        </li>
        <li>
          <span className="welcome-num">02</span>
          <h3>It reads each piece</h3>
          <p>Every piece is redrawn as a clean catalogue photo and tagged. Fix anything it gets wrong.</p>
        </li>
        <li>
          <span className="welcome-num">03</span>
          <h3>Open any piece</h3>
          <p>Once you have enough, every piece comes with outfits built from what you own.</p>
        </li>
      </ol>

      <Link href="/add" className="btn welcome-cta">
        + Add pieces
      </Link>

      <p className="welcome-fine">
        Only you can see your wardrobe. Photos are read by AI (Anthropic and Google) so they can be tagged.
        If someone else is in a photo, you choose which one is you.
      </p>
    </section>
  );
}
