import { garmentIllustration } from "./illustration";
import type { Category, Item, Pattern, Season } from "./types";

/**
 * Placeholder wardrobe used until Supabase is connected (see .env.local.example).
 * Once SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set, `src/lib/items.ts` reads from
 * the real database instead — nothing else in the app needs to change.
 */
const RAW: [string, Category, string, string[], Pattern, string, number, Season[], string][] = [
  ["White tee", "Tops", "white", ["#F5F5F0"], "solid", "cotton", 1, ["spring", "summer"], "The reset piece — pairs with everything."],
  ["Black tee", "Tops", "black", ["#1A1A1A"], "solid", "cotton", 1, ["spring", "summer"], "Heavier weight than the white one, drapes better."],
  ["Striped linen shirt", "Tops", "navy stripe", ["#1B2A4A", "#FFFFFF"], "striped", "linen", 2, ["summer"], "Breathable, slightly oversized fit."],
  ["Flannel shirt", "Tops", "red check", ["#8C2B2B", "#1A1A1A"], "checked", "cotton flannel", 2, ["autumn", "winter"], "Overshirt weight, good third layer."],
  ["Merino crewneck", "Tops", "charcoal", ["#3A3B3C"], "solid", "merino wool", 3, ["autumn", "winter"], "Thin enough to layer under a jacket."],
  ["Cable knit sweater", "Tops", "cream", ["#EDE6D6"], "textured", "wool", 2, ["winter"], "Chunky, statement piece on its own."],
  ["Cardigan", "Outerwear", "camel", ["#C19A6B"], "solid", "wool blend", 3, ["autumn", "winter"], "Layers over shirts, reads a little dressier."],
  ["Half-zip sweater", "Tops", "navy", ["#1B2A4A"], "solid", "cotton", 3, ["autumn"], "Smart-casual middle ground."],
  ["Selvedge jeans", "Bottoms", "indigo", ["#2B3A67"], "solid", "denim", 2, ["spring", "autumn"], "Straight leg, holds its shape."],
  ["Chinos", "Bottoms", "stone", ["#C7BCA8"], "solid", "cotton twill", 3, ["spring", "autumn"], "Goes under the blazer or with the tees."],
  ["Black trousers", "Bottoms", "black", ["#1A1A1A"], "solid", "wool", 4, ["autumn", "winter"], "The dressiest bottom in rotation."],
  ["Cargo pants", "Bottoms", "olive", ["#5C5F3A"], "solid", "cotton", 1, ["spring", "summer"], "Off-duty, roomy fit."],
  ["Wool overcoat", "Outerwear", "charcoal", ["#3A3B3C"], "solid", "wool", 4, ["winter"], "Long line, worn over suiting."],
  ["Denim jacket", "Outerwear", "indigo", ["#2B3A67"], "solid", "denim", 2, ["spring", "autumn"], "Light layer, worn open over tees."],
  ["Field jacket", "Outerwear", "olive", ["#5C5F3A"], "solid", "cotton", 2, ["autumn"], "Utility pockets, casual weekend piece."],
  ["Navy blazer", "Outerwear", "navy", ["#14213D"], "solid", "wool", 5, ["spring", "autumn", "winter"], "Dresses up chinos or jeans instantly."],
  ["White sneakers", "Footwear", "white", ["#F2F2F2"], "solid", "leather", 2, ["spring", "summer"], "Clean minimal silhouette, easy to match."],
  ["Chelsea boots", "Footwear", "brown", ["#5C3A21"], "solid", "leather", 3, ["autumn", "winter"], "Dresses down a suit, dresses up jeans."],
  ["Leather belt", "Accessories", "brown", ["#5C3A21"], "solid", "leather", 3, ["spring", "summer", "autumn", "winter"], "Matches the boots, worn most days."],
];

export const MOCK_ITEMS: Item[] = RAW.map(
  ([name, category, color, palette, pattern, material, formality, seasons, notes], i) => {
    const id = "mock" + (i + 1).toString().padStart(2, "0");
    return {
      id,
      name,
      category,
      color,
      palette,
      pattern,
      material,
      formality,
      seasons,
      notes,
      imageUrl: garmentIllustration(id, category, palette, pattern),
      originalImageUrl: null, // mock data has no distinct "original" photo
      canUndo: false,
      needsReview: false,
      reviewNote: null,
      source: null,
      added: Date.now() - i * 3600_000,
    };
  }
);
