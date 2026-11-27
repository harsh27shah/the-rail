// The Add page's photo queue: three at a time, a failure not stopping the rest, the row summary line,
// the time estimate, and the cleaning hand-off. No database, no AI, no browser.
//   npx tsx scripts/test-upload-queue.ts

import {
  UPLOAD_CONCURRENCY, applyCleaningStatus, estimateSecondsLeft, formatTimeLeft, isBusy, newRow, outcome, runPool, stageLabel, stepStates, summaryLine,
  type RowStage, type UploadRow,
} from "@/lib/upload-queue";
import { afterUploadDestination } from "@/lib/onboarding";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const row = (key: number, stage: RowStage, extra: Partial<UploadRow> = {}): UploadRow => ({ ...newRow(key, `photo${key}.jpg`), stage, ...extra });

async function main() {
  // ── the pool ──
  check("three at a time is the setting", UPLOAD_CONCURRENCY === 3);

  {
    let running = 0, peak = 0;
    const done: number[] = [];
    await runPool([0, 1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++; peak = Math.max(peak, running);
      await sleep(10 + (n % 3) * 5);
      running--; done.push(n);
    });
    check("never more than 3 running at once", peak === 3, `peak ${peak}`);
    check("every photo is processed exactly once", done.length === 8 && new Set(done).size === 8, JSON.stringify(done));
  }
  {
    const started: number[] = [];
    await runPool([0, 1, 2, 3], 3, async (n) => { started.push(n); await sleep(5); });
    check("photos start in the order chosen", started.slice(0, 3).join() === "0,1,2" && started[3] === 3, started.join());
  }
  {
    const done: number[] = [];
    await runPool([0, 1, 2, 3, 4], 3, async (n) => {
      if (n === 1) throw new Error("boom");
      await sleep(5); done.push(n);
    });
    check("a worker that throws does not stop the others", done.sort().join() === "0,2,3,4", done.join());
  }
  {
    let calls = 0;
    await runPool([], 3, async () => { calls++; });
    check("an empty list does nothing and finishes", calls === 0);
    let peak = 0, running = 0;
    await runPool([1, 2], 3, async () => { running++; peak = Math.max(peak, running); await sleep(10); running--; });
    check("with fewer photos than lanes it only uses what it needs", peak === 2);
  }
  {
    // A slow photo does not hold up the queue: a lane frees up the moment a quick one ends.
    const startedAt: Record<number, number> = {};
    const t0 = Date.now();
    await runPool([0, 1, 2, 3], 2, async (n) => { startedAt[n] = Date.now() - t0; await sleep(n === 0 ? 120 : 20); });
    check("a slow photo does not block the lane next to it", startedAt[3] < 100, JSON.stringify(startedAt));
  }

  // ── busy stages ──
  check("waiting, uploading, reading and needs-you are busy", (["waiting", "uploading", "reading", "needs-you"] as RowStage[]).every(isBusy));
  check("cleaning, done, failed and skipped are not busy", (["cleaning", "done", "failed", "skipped"] as RowStage[]).every((s) => !isBusy(s)));

  // ── summary line ──
  check("summary while reading", summaryLine([row(0, "done"), row(1, "reading"), row(2, "waiting")]) === "1 of 3 photos read");
  check("summary counts cleaning", summaryLine([row(0, "cleaning"), row(1, "cleaning"), row(2, "reading"), row(3, "waiting")]) === "2 of 4 photos read · 2 cleaning up");
  check("summary says who needs the person", summaryLine([row(0, "done"), row(1, "needs-you"), row(2, "reading")]) === "1 of 3 photos read · 1 needs you");
  check("summary with several needing the person", summaryLine([row(0, "needs-you"), row(1, "needs-you")]) === "0 of 2 photos read · 2 need you");
  check("summary when all read and some cleaning", summaryLine([row(0, "done"), row(1, "cleaning")]) === "All 2 photos read · 1 cleaning up");
  check("summary when everything is finished and nothing failed", summaryLine([row(0, "done"), row(1, "skipped")]) === "All 2 photos read");
  check("summary when some failed counts only the ones that worked", summaryLine([row(0, "done"), row(1, "failed"), row(2, "skipped")]) === "2 of 3 photos read");
  check("summary when every photo failed says so plainly", summaryLine([row(0, "failed"), row(1, "failed")]) === "None of the 2 photos could be read" && summaryLine([row(0, "failed")]) === "That photo could not be read");
  check("summary for one photo is singular", summaryLine([row(0, "reading")]) === "0 of 1 photo read" && summaryLine([row(0, "done")]) === "All 1 photo read");
  check("failed and skipped count as handled, not as still to read", summaryLine([row(0, "failed"), row(1, "skipped"), row(2, "waiting")]) === "2 of 3 photos read");

  // ── time estimate ──
  const timed = (ms: number) => row(9, "cleaning", { readMs: ms });
  check("no estimate until two photos have finished", estimateSecondsLeft([timed(10000), row(1, "waiting"), row(2, "waiting")]) === null);
  check("no estimate when nothing is left to read", estimateSecondsLeft([timed(10000), timed(12000)]) === null);
  check("estimate = average time x rounds still to go (6 left, 3 at a time, 10s each = 20s)",
    estimateSecondsLeft([timed(10000), timed(10000), ...[1, 2, 3, 4, 5, 6].map((k) => row(k, "waiting"))]) === 20);
  check("a part-full last round still counts as a round (4 left = 2 rounds)",
    estimateSecondsLeft([timed(10000), timed(10000), ...[1, 2, 3, 4].map((k) => row(k, "waiting"))]) === 20);
  check("photos waiting on the person are not counted as time left",
    estimateSecondsLeft([timed(10000), timed(10000), row(1, "needs-you"), row(2, "needs-you")]) === null);
  check("wording: almost done / seconds / minutes",
    formatTimeLeft(4) === "almost done" && formatTimeLeft(10) === "almost done" && formatTimeLeft(41) === "about 40 seconds left" &&
    formatTimeLeft(89) === "about 90 seconds left" && formatTimeLeft(150) === "about 3 minutes left" && formatTimeLeft(120) === "about 2 minutes left");

  // ── cleaning hand-off ──
  {
    const rows = [
      row(0, "cleaning", { pieces: [{ id: "a", name: "Tee" }, { id: "b", name: "Jeans" }] }),
      row(1, "cleaning", { pieces: [{ id: "c", name: "Coat" }] }),
      row(2, "reading"),
    ];
    const next = applyCleaningStatus(rows, new Set(["b", "c"]));
    check("a row stays 'cleaning' while any of its pieces is still being cleaned", next[0].stage === "cleaning" && next[1].stage === "cleaning");
    const later = applyCleaningStatus(next, new Set(["c"]));
    check("a row finishes when none of its pieces is left", later[0].stage === "done" && later[1].stage === "cleaning");
    const end = applyCleaningStatus(later, new Set());
    check("everything finishes when the server lists nothing", end[1].stage === "done");
    check("rows that aren't cleaning are never touched", end[2].stage === "reading" && applyCleaningStatus(rows, new Set())[2] === rows[2]);
    check("the original rows are not changed in place", rows[0].stage === "cleaning");
  }

  // ── the outcome feeds the existing "where next" rule ──
  {
    const rows = [
      row(0, "cleaning", { pieces: [{ id: "a", name: "Tee" }, { id: "b", name: "Jeans" }] }),
      row(1, "done", { pieces: [{ id: "c", name: "Coat" }] }),
    ];
    const o = outcome(rows);
    check("outcome collects every piece id", o.ids.join() === "a,b,c" && o.failures.length === 0 && o.skipped === 0);
    const d = afterUploadDestination({ onboarding: true, ...o, failures: o.failures.length });
    check("clean run while onboarding goes to the rail with the count", d.kind === "go" && d.href === "/?hung=3");
  }
  {
    const rows = [
      row(0, "done", { pieces: [{ id: "a", name: "Tee" }] }),
      row(1, "failed", { note: "the upload didn't go through" }),
      row(2, "skipped"),
    ];
    const o = outcome(rows);
    check("outcome lists failures with the file name and reason", o.failures.length === 1 && o.failures[0] === "photo1.jpg — the upload didn't go through", JSON.stringify(o.failures));
    check("outcome counts skips", o.skipped === 1);
    const d = afterUploadDestination({ onboarding: true, ids: o.ids, failures: o.failures.length, skipped: o.skipped });
    check("a failed or skipped photo keeps the person on the page", d.kind === "stay");
  }
  check("a failed row with no note still reads sensibly", outcome([row(0, "failed")]).failures[0] === "photo0.jpg — failed");

  // ── labels ──
  check("the needs-you label tells the person what to do", stageLabel(row(0, "needs-you")) === "Needs you: tap which one is you");
  check("every stage has a label", (["waiting", "uploading", "reading", "needs-you", "cleaning", "done", "failed", "skipped"] as RowStage[]).every((s) => stageLabel(row(0, s)).length > 0));

  // ── progress bar ──
  const bar = (s: RowStage) => stepStates(s).join(",");
  check("bar: waiting is empty, uploading starts the first segment", bar("waiting") === "off,off,off" && bar("uploading") === "active,off,off");
  check("bar: reading fills upload and pulses read (also while waiting on the person)", bar("reading") === "on,active,off" && bar("needs-you") === "on,active,off");
  check("bar: cleaning fills two and pulses the last; done fills all", bar("cleaning") === "on,on,active" && bar("done") === "on,on,on");
  check("bar: failed and skipped claim no progress", bar("failed") === "off,off,off" && bar("skipped") === "off,off,off");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
