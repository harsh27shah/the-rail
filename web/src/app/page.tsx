import { getItems, isDatabaseConnected } from "@/lib/items";
import { Storefront } from "@/components/Storefront";

// Without this, Next.js pre-renders this page once at build/deploy time and serves that
// frozen snapshot to everyone — new items saved afterward wouldn't show up here until the
// next deploy. Always fetch fresh from the database instead.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const items = await getItems();
  const connected = isDatabaseConnected();

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
      <Storefront items={items} />
    </>
  );
}
