/**
 * Finding a new piece's twin among the pieces already owned (PROJECT.md §5 item 38; BACKLOG.md,
 * "Duplicate checking: better recall, lower cost"). Pure logic with the AI passed in, so every rule is
 * testable with a fake (scripts/test-duplicates.ts). It never reads a database or calls an AI itself.
 *
 * What it does, and why (all measured, see eval-data/duplicates and PROJECT.md item 38):
 *
 *  1. RANK, don't filter. Every same-category piece is scored against the new one by main colour, name and
 *     colour words, pattern, material and formality, and only the closest few are looked at. The old rule kept
 *     pieces that shared a colour or name WORD, then took the first 5 in database order. Names are written by
 *     the AI per photo ("Cream zip sweatshirt" vs "Ivory quarter-zip"), so true twins were sometimes dropped
 *     before any comparison, and in a bigger wardrobe the first 5 were just the oldest. Ranked, the twin was in
 *     the top 2 in 12 of 12 test cases (the old way: 10 of 12 anywhere in its 5).
 *  2. CASCADE. Each shortlisted piece first gets a cheap look (the four photos shrunk to 640px, about a third of
 *     a cent). A confident "same" stops there. Only when the cheap look is UNSURE that it is different
 *     (confidence below `DUPLICATE_UNSURE_BELOW`) does the piece get a careful full-size look. The cheap look's
 *     wrong answers on real twins were all low confidence (0.68, 0.82); its answers on lookalikes were mostly
 *     confident, so most pieces never need the second look.
 *
 * Result on the test cases: 11 of 12 twins found (the old way: 9 of 12), no false alarms, and about 2.4 cents
 * per new piece with no twin (the old way: about 9 cents).
 */

/** The cheap look is only shown the top few; the twin was in the top 2 in every test case, 3 leaves margin. */
export const DUPLICATE_SHORTLIST = 3;
/** A "same" verdict below this confidence isn't flagged (the app's long-standing cut-off). */
export const DUPLICATE_CONFIDENCE_THRESHOLD = 0.6;
/** A cheap-look "different" below this confidence gets a careful full-size look. 0.85 to 0.95 all tested the same. */
export const DUPLICATE_UNSURE_BELOW = 0.9;
/** The cheap look sends photos this many pixels on the long side. */
export const DUPLICATE_SMALL_SIDE = 640;

/** What is known about a piece without looking at its photos (all set when it was catalogued). */
export interface PieceTags {
  name: string;
  color: string;
  palette: string[];
  pattern: string;
  material: string;
  formality: number;
}

const STOP_WORDS = new Set(["a", "an", "the", "and", "with", "for", "in", "on", "of", "to"]);
function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

/** Straight-line distance between two hex colours (0 to about 441); a missing or malformed one counts as far apart. */
function hexDistance(a?: string, b?: string): number {
  const rgb = (h: string) => {
    const s = h.replace("#", "");
    const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  try {
    const x = rgb(a!), y = rgb(b!);
    const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    return Number.isFinite(d) ? d : 200;
  } catch {
    return 200;
  }
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared / Math.max(1, a.size + b.size - shared);
}

/** How alike two pieces look from their tags alone. Higher is more alike. Only the ORDER matters. */
export function similarity(n: PieceTags, c: PieceTags): number {
  const color = Math.max(0, 1 - hexDistance(n.palette?.[0], c.palette?.[0]) / 150);
  const name = jaccard(words(`${n.name} ${n.color}`), words(`${c.name} ${c.color}`));
  return (
    2 * color +
    1.5 * name +
    (n.pattern === c.pattern ? 0.3 : 0) +
    (n.material && n.material === c.material ? 0.2 : 0) +
    (Math.abs((n.formality || 3) - (c.formality || 3)) <= 1 ? 0.1 : 0)
  );
}

/** The `k` pieces most like the new one, closest first. Ties keep the order given (stable), so results don't jump around. */
export function shortlist<T extends PieceTags>(newPiece: PieceTags, pool: T[], k: number = DUPLICATE_SHORTLIST): T[] {
  return pool
    .map((piece, i) => ({ piece, i, score: similarity(newPiece, piece) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, k)
    .map((x) => x.piece);
}

export interface Verdict {
  verdict: "same" | "different";
  confidence: number;
  why: string;
}
export type LookSize = "small" | "full";

export interface TwinResult<T> {
  match: T;
  verdict: Verdict;
  /** Which look settled it, for the log. */
  look: LookSize;
}

const isMatch = (v: Verdict) => v.verdict === "same" && v.confidence >= DUPLICATE_CONFIDENCE_THRESHOLD;

/**
 * Walks the shortlist in order and returns the first piece judged the same garment, or null. `look` makes one
 * AI comparison at the given size. A cheap look that throws counts as unsure and gets the careful look; a careful
 * look that throws is skipped (the next piece is still tried), so one bad answer doesn't abandon the rest.
 * `onLook` is told about every comparison made, for logging.
 */
export async function findTwin<T>(
  candidates: T[],
  look: (candidate: T, size: LookSize) => Promise<Verdict>,
  onLook?: (candidate: T, size: LookSize, v: Verdict | null) => void
): Promise<TwinResult<T> | null> {
  for (const candidate of candidates) {
    let small: Verdict | null = null;
    try {
      small = await look(candidate, "small");
      onLook?.(candidate, "small", small);
    } catch {
      onLook?.(candidate, "small", null); // no answer counts as unsure, so it gets the careful look below
    }
    if (small && isMatch(small)) return { match: candidate, verdict: small, look: "small" };
    // Unsure it is different (or no answer): look again, carefully. A "same" that was too weak to flag is not
    // escalated (that is exactly how it was tested).
    if (!small || (small.verdict === "different" && small.confidence < DUPLICATE_UNSURE_BELOW)) {
      try {
        const full = await look(candidate, "full");
        onLook?.(candidate, "full", full);
        if (isMatch(full)) return { match: candidate, verdict: full, look: "full" };
      } catch {
        onLook?.(candidate, "full", null);
      }
    }
  }
  return null;
}
