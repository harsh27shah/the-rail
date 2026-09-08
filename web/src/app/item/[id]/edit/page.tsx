import { notFound } from "next/navigation";
import { getItem } from "@/lib/items";
import { CATEGORIES, PATTERNS } from "@/lib/types";
import { deleteItemAction, updateItemAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const updateWithId = updateItemAction.bind(null, id);
  const deleteWithId = deleteItemAction.bind(null, id);

  return (
    <div className="form-page">
      <h1>Edit piece</h1>
      <p className="hint">Auto-tagging will get things wrong sometimes — fix anything here.</p>

      <form action={updateWithId}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" defaultValue={item.name} />

        <div className="row">
          <div>
            <label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={item.category}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="color">Primary colour</label>
            <input id="color" name="color" type="text" defaultValue={item.color} />
          </div>
        </div>

        <div className="row">
          <div>
            <label htmlFor="formality">Formality</label>
            <select id="formality" name="formality" defaultValue={String(item.formality)}>
              <option value="1">1 — Lounge</option>
              <option value="2">2 — Casual</option>
              <option value="3">3 — Smart casual</option>
              <option value="4">4 — Business</option>
              <option value="5">5 — Formal</option>
            </select>
          </div>
          <div>
            <label htmlFor="pattern">Pattern</label>
            <select id="pattern" name="pattern" defaultValue={item.pattern}>
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label htmlFor="material">Material</label>
        <input id="material" name="material" type="text" defaultValue={item.material} />

        <label htmlFor="seasons">Seasons</label>
        <input
          id="seasons"
          name="seasons"
          type="text"
          placeholder="spring, summer"
          defaultValue={item.seasons.join(", ")}
        />

        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={item.notes} />

        <div className="actions">
          <SubmitButton label="Save changes" pendingLabel="Saving…" />
        </div>
      </form>

      <form action={deleteWithId} style={{ marginTop: 12 }}>
        <button type="submit" className="btn ghost" style={{ width: "100%" }}>
          Remove from the rail
        </button>
      </form>
    </div>
  );
}
