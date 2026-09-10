import { AddPhotosForm } from "@/components/AddPhotosForm";

// Each photo is its own request now (see addPhotoAction), so a function invocation only ever
// handles one photo's tagging + upload — background extraction still runs via after() and
// wants headroom. Keep the generous ceiling.
export const maxDuration = 60;

export default function AddPage() {
  return (
    <div className="form-page">
      <h1>Add pieces</h1>
      <p className="hint">
        Pick one photo or several at once — each gets read and catalogued automatically, and
        a photo showing more than one garment (a top and jeans, say) becomes its own entry
        per garment. You can fix anything it gets wrong afterward.
      </p>
      <AddPhotosForm />
    </div>
  );
}
