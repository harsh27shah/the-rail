import { CATEGORIES, PATTERNS, SEASONS, type Category, type Pattern, type Season } from "./types";

/**
 * Shared normalizers for turning a model's free-text guess at these fields into a value
 * that actually satisfies our fixed enums — used both when tagging a brand-new item
 * (src/app/add/actions.ts) and when re-tagging after a photo correction
 * (src/app/item/[id]/correct-actions.ts).
 */

export function asCategory(value: unknown): Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
    ? (value as Category)
    : "Tops";
}

export function asPattern(value: unknown): Pattern {
  return typeof value === "string" && (PATTERNS as readonly string[]).includes(value)
    ? (value as Pattern)
    : "solid";
}

export function asSeasons(value: unknown): Season[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is Season => (SEASONS as readonly string[]).includes(s));
}
