import Link from "next/link";
import { getDuplicateQueue } from "@/lib/items";
import { DuplicateQueue } from "@/components/DuplicateQueue";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const pairs = await getDuplicateQueue();

  return (
    <div className="form-page" style={{ maxWidth: 720 }}>
      <Link href="/" className="detail-back">
        ← Back to the rail
      </Link>
      <h1>Review duplicates</h1>
      <p className="hint">
        {pairs.length === 0
          ? "Nothing to review right now — flagged as new photos come in."
          : `${pairs.length} pair${pairs.length === 1 ? "" : "s"} look${pairs.length === 1 ? "s" : ""} like they might be the same physical piece. Nothing is removed until you say so.`}
      </p>
      <DuplicateQueue pairs={pairs} />
    </div>
  );
}
