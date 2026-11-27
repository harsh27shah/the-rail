/**
 * "Is this piece still having its photo cleaned up?" (PROJECT.md §5, item 5 and the cleaning
 * placeholder). A new piece first shows the person's ORIGINAL photo (which may be a mirror selfie, a
 * messy background or a whole collage); a few seconds later a background job replaces it with the
 * clean catalogue photo. Until then the app shows a placeholder instead of the original and checks
 * back quietly (components/AutoRefresh.tsx).
 *
 * The test: the photo currently shown is still the original (the two paths are equal) AND the piece
 * was added only moments ago. The time limit matters: if cleaning fails or never finishes, the piece
 * would otherwise look "in progress" forever. After the window it falls back to showing the original,
 * exactly as before. Older pieces whose photo equals the original (cleaning failed, or they were reset
 * to the original) are never treated as in progress, because they were added long ago.
 *
 * Pure so it can be tested (scripts/test-cleaning.ts). The server decides, with the server's own
 * clock, so a phone with a wrong clock can't get it wrong.
 */

/** How long after a piece is added we expect its clean photo to appear. Cleaning usually takes 5 to 20 seconds. */
export const CLEANING_WINDOW_MS = 90_000;

export function isCleaning(p: {
  imagePath: string | null;
  originalImagePath: string | null;
  addedMs: number;
  now?: number;
}): boolean {
  if (!p.imagePath || !p.originalImagePath) return false;
  if (p.imagePath !== p.originalImagePath) return false; // already replaced by the clean photo
  const age = (p.now ?? Date.now()) - p.addedMs;
  return age >= 0 && age < CLEANING_WINDOW_MS;
}
