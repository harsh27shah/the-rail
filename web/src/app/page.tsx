import { requireUser } from "@/lib/auth";
import { getItems, isDatabaseConnected } from "@/lib/items";
import { onboardingProgress } from "@/lib/onboarding";
import { userHasSeenOutfits } from "@/lib/outfit-store";
import { Storefront } from "@/components/Storefront";

// Without this, Next.js pre-renders this page once at build/deploy time and serves that
// frozen snapshot to everyone — new items saved afterward wouldn't show up here until the
// next deploy. Always fetch fresh from the database instead.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const [items, seenOutfits] = await Promise.all([getItems(user.id), userHasSeenOutfits(user.id)]);
  const connected = isDatabaseConnected();
  // The first-run progress panel: null for an empty rail (the welcome covers it) and for anyone
  // who has already seen outfits.
  const progress = onboardingProgress(items, seenOutfits);

  return (
    <>
      {!connected && (
        <div
          className="strip"
          style={{ background: "var(--accent-soft)", color: "var(--ink)" }}
        >
          <span>
            Showing placeholder pieces — connect Supabase (see .env.local.example) to
            catalogue your real wardrobe.
          </span>
        </div>
      )}
      <Storefront items={items} progress={progress} />
    </>
  );
}
