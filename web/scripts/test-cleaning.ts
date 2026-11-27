// Tests for "is this piece still having its photo cleaned up?" (lib/cleaning.ts). No database, no AI.
//   npx tsx scripts/test-cleaning.ts

import { CLEANING_WINDOW_MS, isCleaning } from "@/lib/cleaning";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const NOW = 1_000_000_000_000;
const same = "u/photo-1.jpg";
const clean = "u/clean-1.png";
const base = { imagePath: same, originalImagePath: same, addedMs: NOW - 5_000, now: NOW };

check("a brand-new piece still showing its original is being cleaned", isCleaning(base));
check("once the clean photo has replaced the original, it is not", !isCleaning({ ...base, imagePath: clean }));
check("a piece added a minute ago is still within the window", isCleaning({ ...base, addedMs: NOW - 60_000 }));
check("just inside the window still counts", isCleaning({ ...base, addedMs: NOW - (CLEANING_WINDOW_MS - 1) }));
check("exactly at the window it gives up (shows the original, as before)", !isCleaning({ ...base, addedMs: NOW - CLEANING_WINDOW_MS }));
check("an old piece that never got cleaned (failed) is never 'in progress'", !isCleaning({ ...base, addedMs: NOW - 30 * 86_400_000 }));
check("an old piece reset to its original is not 'in progress'", !isCleaning({ ...base, addedMs: NOW - 3 * 86_400_000 }));
check("a piece with no photo at all is not 'cleaning'", !isCleaning({ ...base, imagePath: null }) && !isCleaning({ ...base, originalImagePath: null }));
check("a time in the future (clock oddity) is not trusted", !isCleaning({ ...base, addedMs: NOW + 10_000 }));
check("the window is about a minute and a half", CLEANING_WINDOW_MS === 90_000);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
