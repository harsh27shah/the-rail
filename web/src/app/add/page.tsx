import { addItemAction } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

// The garment-extraction step (src/lib/gemini.ts) runs in the background via next/server's
// after() and can take up to ~15s. Give the function enough room to finish, or Vercel will
// kill it partway through and the item is left with its original (uncropped) photo.
export const maxDuration = 60;

export default function AddPage() {
  return (
    <div className="form-page">
      <h1>Add a piece</h1>
      <p className="hint">
        Upload a photo and it gets read and catalogued automatically. You can fix anything
        it gets wrong afterward.
      </p>
      <form action={addItemAction}>
        <label htmlFor="photo">Photo</label>
        <input id="photo" name="photo" type="file" accept="image/*" required />
        <div className="actions">
          <SubmitButton label="Read & hang on the rail" pendingLabel="Reading the garment…" />
        </div>
      </form>
    </div>
  );
}
