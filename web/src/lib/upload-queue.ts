/**
 * The Add page's multi-photo queue (components/AddPhotosForm.tsx): a few photos at a time, one row
 * per photo, each row showing where that photo is up to. Pure logic, no browser, tested in
 * scripts/test-upload-queue.ts.
 *
 * Why a queue and not "one after another": reading a photo takes 10 to 20 seconds, mostly waiting on
 * the AI, so doing three at once cuts a long batch to roughly a third. The server work per photo is
 * unchanged, so the cost is too.
 */

/** How many photos are uploaded and read at the same time. */
export const UPLOAD_CONCURRENCY = 3;

export type RowStage =
  | "waiting" // queued, not started
  | "uploading" // sending the photo to storage
  | "reading" // the AI is cataloguing it
  | "needs-you" // more than one person in it: waiting for "tap the one that's you"
  | "cleaning" // pieces exist, their clean photos are still being made
  | "done"
  | "failed"
  | "skipped";

export interface UploadRow {
  key: number;
  name: string;
  stage: RowStage;
  /** The pieces this photo became (known once it has been read). */
  pieces: { id: string; name: string }[];
  /** Why it failed, or a short note on a photo that gave nothing. */
  note: string | null;
  /** How long upload + reading took, once read. Feeds the time estimate. */
  readMs: number | null;
}

export function newRow(key: number, name: string): UploadRow {
  return { key, name, stage: "waiting", pieces: [], note: null, readMs: null };
}

/** Stages where the page still has work to do for this photo (or is waiting on the person). */
export function isBusy(stage: RowStage): boolean {
  return stage === "waiting" || stage === "uploading" || stage === "reading" || stage === "needs-you";
}

/**
 * Runs `worker` over every item with at most `limit` running at once, starting the next as soon as one
 * finishes. A worker that throws does not stop the others (the failure is the worker's to record).
 */
export async function runPool<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        await worker(items[index], index);
      } catch {
        // The worker owns its own error handling; never let one photo stop the rest.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line above the list: "3 of 12 photos read · 2 cleaning up". */
export function summaryLine(rows: UploadRow[]): string {
  const total = rows.length;
  const busy = rows.filter((r) => r.stage === "waiting" || r.stage === "uploading" || r.stage === "reading").length;
  const needs = rows.filter((r) => r.stage === "needs-you").length;
  const cleaning = rows.filter((r) => r.stage === "cleaning").length;
  const failed = rows.filter((r) => r.stage === "failed").length;
  const read = total - busy - needs;
  const finished = busy === 0 && needs === 0;

  const parts: string[] = [];
  if (finished && failed === total) parts.push(total === 1 ? "That photo could not be read" : `None of the ${total} photos could be read`);
  else if (finished && failed > 0) parts.push(`${total - failed} of ${plural(total, "photo", "photos")} read`);
  else if (finished) parts.push(`All ${plural(total, "photo", "photos")} read`);
  else parts.push(`${read} of ${plural(total, "photo", "photos")} read`);
  if (needs > 0) parts.push(`${needs} ${needs === 1 ? "needs" : "need"} you`);
  if (cleaning > 0) parts.push(`${cleaning} cleaning up`);
  return parts.join(" · ");
}

/**
 * A rough "how long left", from how long the photos finished so far actually took. Null until two
 * photos have finished (one is too little to trust) or when nothing is left to read. Photos waiting
 * on the person are not counted, since that wait is theirs.
 */
export function estimateSecondsLeft(rows: UploadRow[], limit: number = UPLOAD_CONCURRENCY): number | null {
  const times = rows.map((r) => r.readMs).filter((m): m is number => m != null);
  const remaining = rows.filter((r) => r.stage === "waiting" || r.stage === "uploading" || r.stage === "reading").length;
  if (times.length < 2 || remaining === 0) return null;
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  return Math.ceil((average * Math.ceil(remaining / limit)) / 1000);
}

/** "about 40 seconds left", "about 2 minutes left", "almost done". Rounded so it doesn't look falsely exact. */
export function formatTimeLeft(seconds: number): string {
  if (seconds <= 10) return "almost done";
  if (seconds < 90) return `about ${Math.round(seconds / 10) * 10} seconds left`;
  return `about ${Math.round(seconds / 60)} minutes left`;
}

/** What the run produced, in the shape `afterUploadDestination` (lib/onboarding.ts) wants. */
export function outcome(rows: UploadRow[]): { ids: string[]; failures: string[]; skipped: number } {
  return {
    ids: rows.flatMap((r) => r.pieces.map((p) => p.id)),
    failures: rows.filter((r) => r.stage === "failed").map((r) => `${r.name} — ${r.note ?? "failed"}`),
    skipped: rows.filter((r) => r.stage === "skipped").length,
  };
}

/**
 * Moves rows out of "cleaning" once none of their pieces is still being cleaned. `stillCleaning` is
 * the server's list of piece ids that are not finished yet; a piece missing from it (finished, failed
 * past the server's time limit, or deleted) counts as finished.
 */
export function applyCleaningStatus(rows: UploadRow[], stillCleaning: ReadonlySet<string>): UploadRow[] {
  return rows.map((r) =>
    r.stage === "cleaning" && !r.pieces.some((p) => stillCleaning.has(p.id)) ? { ...r, stage: "done" } : r
  );
}

/** Words for each stage, as shown on the row. */
export function stageLabel(row: UploadRow): string {
  switch (row.stage) {
    case "waiting":
      return "Waiting";
    case "uploading":
      return "Uploading";
    case "reading":
      return "Reading";
    case "needs-you":
      return "Needs you: tap which one is you";
    case "cleaning":
      return "Cleaning up";
    case "done":
      return "Done";
    case "failed":
      return "Couldn't read this one";
    case "skipped":
      return "Skipped";
  }
}

export type StepState = "off" | "active" | "on";

/**
 * The little three-segment bar on each row: Upload, Read, Clean up. A finished step is "on", the one in
 * progress is "active" (it pulses), later ones are "off". A failed or skipped photo shows nothing filled
 * beyond what it reached, so the bar never claims progress that didn't happen.
 */
export function stepStates(stage: RowStage): [StepState, StepState, StepState] {
  switch (stage) {
    case "waiting":
      return ["off", "off", "off"];
    case "uploading":
      return ["active", "off", "off"];
    case "reading":
    case "needs-you":
      return ["on", "active", "off"];
    case "cleaning":
      return ["on", "on", "active"];
    case "done":
      return ["on", "on", "on"];
    case "failed":
    case "skipped":
      return ["off", "off", "off"];
  }
}
