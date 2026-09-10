// Simplified from an original 8 categories (see PROJECT.md §5 decision log) — Knitwear,
// Suiting, and Activewear were dropped as top-level categories. Knitwear wasn't a real
// layering role, just a fabric construction (a jumper can be either a top or an outer
// layer); Suiting doesn't fit this app's casual/smart-casual positioning; Activewear isn't
// the target use case. A blazer/jumper/gym tee still gets catalogued — it's just classified
// by what it actually is (Tops/Bottoms/Outerwear), not given its own bucket.
export const CATEGORIES = ["Tops", "Bottoms", "Outerwear", "Footwear", "Accessories"] as const;

export type Category = (typeof CATEGORIES)[number];

export const PATTERNS = ["solid", "striped", "checked", "printed", "textured"] as const;
export type Pattern = (typeof PATTERNS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

/** A single wardrobe item. Mirrors the data model validated in the retired prototype
 * (see PROJECT.md §4) — kept intentionally the same shape for a smooth migration. */
export interface Item {
  id: string;
  name: string;
  category: Category;
  color: string;
  /** Hex colours, drives swatches + pairing colour logic. */
  palette: string[];
  pattern: Pattern;
  material: string;
  /** 1 (lounge) to 5 (formal). */
  formality: number;
  seasons: Season[];
  notes: string;
  /** Public URL of the item's photo (Supabase Storage, once wired up). This is whatever
   * should currently *display* — the original upload, or a cleaned-up/corrected version. */
  imageUrl: string | null;
  /** Public URL of the true original uploaded photo, never overwritten — shown during
   * correction so the user has something real to check their own feedback against. */
  originalImageUrl: string | null;
  /** True when there's a one-level undo available (the item has been corrected at least
   * once since it was last reset). Drives whether "Undo last correction" shows. */
  canUndo: boolean;
  /** The tagger inferred details it couldn't actually see in the photo (garment partly
   * hidden, cropped, folded). `reviewNote` is a short phrase on what was guessed. */
  needsReview: boolean;
  reviewNote: string | null;
  /** Originating product URL, if added via a link rather than a photo. */
  source: string | null;
  /** Epoch ms. */
  added: number;
}
