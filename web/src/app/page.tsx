import { getItems, isDatabaseConnected } from "@/lib/items";
import { Storefront } from "@/components/Storefront";

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
