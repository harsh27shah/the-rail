import { Suspense } from "react";
import { AddPhotosForm } from "@/components/AddPhotosForm";
import { AddTips } from "@/components/AddTips";
import { requireUser } from "@/lib/auth";
import { getItems } from "@/lib/items";
import { userHasSeenOutfits } from "@/lib/outfit-store";

// Each photo is its own request now (see addPhotoAction), so a function invocation only ever
// handles one photo's tagging + upload — background extraction still runs via after() and
// wants headroom. Keep the generous ceiling.
export const maxDuration = 60;

// The tips fold away once someone has their starter wardrobe, which depends on who is asking.
export const dynamic = "force-dynamic";

export default async function AddPage() {
  const user = await requireUser();
  const [items, seenOutfits] = await Promise.all([getItems(user.id), userHasSeenOutfits(user.id)]);
  const pieceCount = items.length;
  return (
    <div className="form-page">
      <h1>Add pieces</h1>
      <p className="hint">
        Pick as many photos as you like. Each one is read and catalogued automatically, and a photo
        showing more than one garment (a top and jeans, say) becomes its own entry per garment. You can
        fix anything it gets wrong afterwards.
      </p>
      <AddTips pieceCount={pieceCount} />
      {/* Suspense boundary for GooglePhotosImport's useSearchParams() (it reads gpSession/
          gpPickerUri/gpError coming back from the OAuth callback redirect) — Next.js
          requires one around any client-side use of that hook. */}
      <Suspense fallback={null}>
        {/* Google import: owner only until the Google app is published (see AddPhotosForm).
            `onboarding`: still getting set up (hasn't seen outfits), so after an upload they land on the
            rail, where the progress card is (see lib/onboarding.ts, afterUploadDestination). */}
        <AddPhotosForm showGoogleImport={user.isOwner} onboarding={!seenOutfits} />
      </Suspense>
    </div>
  );
}
