export const CATEGORIES = [
  "Tops",
  "Knitwear",
  "Bottoms",
  "Outerwear",
  "Suiting",
  "Footwear",
  "Activewear",
  "Accessories",
] as const;

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
  /** Hex colors, drives swatches + pairing color logic. */
  palette: string[];
  pattern: Pattern;
  material: string;
  /** 1 (lounge) to 5 (formal). */
  formality: number;
  seasons: Season[];
  notes: string;
  /** Public URL of the item's photo (Supabase Storage, once wired up). */
  imageUrl: string | null;
  /** Originating product URL, if added via a link rather than a photo. */
  source: string | null;
  /** Epoch ms. */
  added: number;
}
