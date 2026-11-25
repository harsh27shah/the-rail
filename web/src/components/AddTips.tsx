import { STARTER_PLAN, STARTER_TOTAL } from "@/lib/coverage";

/**
 * Coaching for the Add page (src/app/add/page.tsx): what to aim for and how to take photos the
 * Rail reads well. Open by default for someone still building their first wardrobe, and folded
 * away (one click to reopen) once they have the starter set, so it never nags a regular user.
 * Every tip here describes what the app really does: keep it in step with lib/ingest.ts and the
 * tagging prompt (lib/anthropic.ts) if either changes.
 */
export function AddTips({ pieceCount }: { pieceCount: number }) {
  const building = pieceCount < STARTER_TOTAL;
  const plan = STARTER_PLAN.map((p) => `${p.min} ${p.category.toLowerCase()}`);
  const planText = `${plan.slice(0, -1).join(", ")} and ${plan[plan.length - 1]}`;

  return (
    <details className="add-tips" open={building}>
      <summary>{building ? "Tips for better photos" : "Tips for better photos (you can skip these)"}</summary>
      {building && (
        <p className="add-goal">
          Aim for about <b>{STARTER_TOTAL} pieces</b>: {planText}. That&rsquo;s when The Rail can start
          building outfits. Shoes are a bonus.
        </p>
      )}
      <ul>
        <li>
          <b>Mirror selfies work well.</b> One photo of an outfit can give you a top, trousers and shoes.
        </li>
        <li>
          <b>Photos of just you are quickest.</b> If someone else is in the shot, you&rsquo;ll be asked to
          tap which one is you.
        </li>
        <li>
          <b>Good light and the whole piece in view help.</b> If part of a piece is hidden, it&rsquo;s
          flagged for you to check.
        </li>
        <li>
          <b>Tops, bottoms, outerwear and shoes are catalogued.</b> Belts, watches, bags and jewellery are
          skipped.
        </li>
        <li>
          <b>Keep this page open while it reads.</b> Each photo takes a few seconds.
        </li>
      </ul>
    </details>
  );
}
