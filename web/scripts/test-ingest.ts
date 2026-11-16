// Ingestion decision tests — the two rules from PROJECT.md §5 item 24:
//   1. an upload is read by its bytes, never by the label it arrived with;
//   2. a failed or unknown tag is never treated as "one person".
//
// Part A uses fake tag/detect functions so every branch is exercised without AI calls.
// Part B (only if /tmp/gp holds the real photos from the report, and API keys are present)
// runs the real tagger/detector on the exact images that failed.
//
// Run from web/:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-ingest.ts

import fs from "node:fs";
import sharp from "sharp";
import { analysePhoto, normalizeUpload, BLANK_GARMENT, type AnalyseDeps } from "@/lib/ingest";
import type { PersonBox } from "@/lib/gemini";
import type { TagPhotoResult, TaggedFields } from "@/lib/anthropic";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const box = (n: number): PersonBox => ({ box: [0, n * 100, 1000, n * 100 + 90] }) as PersonBox;
const garment = { ...BLANK_GARMENT, name: "Navy sweater" } as TaggedFields;
const photo = { base64: "x", mimeType: "image/jpeg" };

function deps(tag: AnalyseDeps["tag"], detect: AnalyseDeps["detect"]): AnalyseDeps & { calls: { detect: number } } {
  const calls = { detect: 0 };
  return {
    tag,
    detect: async (b, m) => {
      calls.detect++;
      return detect(b, m);
    },
    calls,
  };
}
const tagOk = (r: TagPhotoResult) => async () => r;
const tagFail = async (): Promise<TagPhotoResult> => {
  throw new Error("400 invalid media type");
};

async function partA() {
  console.log("\n— A. analysePhoto branches (fake AI) —");

  let d = deps(tagOk({ peopleCount: 1, garments: [garment] }), async () => []);
  let r = await analysePhoto(photo, d);
  check("one person, tagged → garments, no detection call", r.kind === "garments" && d.calls.detect === 0);

  d = deps(tagOk({ peopleCount: 2, garments: [] }), async () => [box(1), box(5)]);
  r = await analysePhoto(photo, d);
  check("two people → needs-selection", r.kind === "needs-selection" && r.people.length === 2);

  let n = 0;
  d = deps(tagOk({ peopleCount: 2, garments: [] }), async () => (++n === 1 ? [box(1)] : [box(1), box(5)]));
  r = await analysePhoto(photo, d);
  check("thin first detection, fuller retry → needs-selection", r.kind === "needs-selection" && d.calls.detect === 2);

  d = deps(tagOk({ peopleCount: 2, garments: [] }), async () => []);
  r = await analysePhoto(photo, d);
  check("tagger says 2, detector finds none → error, nothing catalogued", r.kind === "error" && d.calls.detect === 2);

  d = deps(tagOk({ peopleCount: 3, garments: [] }), async () => [box(2)]);
  r = await analysePhoto(photo, d);
  check("tagger says 3, detector finds 1 → error", r.kind === "error");

  // The reported bug: tagging fails → must NOT silently become "one person".
  d = deps(tagFail, async () => [box(1), box(5)]);
  r = await analysePhoto(photo, d);
  check("TAG FAILS + two people → needs-selection (the reported bug)", r.kind === "needs-selection" && d.calls.detect === 1);

  d = deps(tagFail, async () => [box(3)]);
  r = await analysePhoto(photo, d);
  check(
    "tag fails + one person → blank editable item",
    r.kind === "garments" && r.garments.length === 1 && r.garments[0].name === ""
  );

  d = deps(tagFail, async () => []);
  r = await analysePhoto(photo, d);
  check("tag fails + nobody detected (flat-lay) → blank editable item", r.kind === "garments");

  d = deps(tagFail, async () => {
    throw new Error("gemini down");
  });
  r = await analysePhoto(photo, d);
  check("tag fails AND detection fails → error, not a guess", r.kind === "error" && d.calls.detect === 2);

  let m = 0;
  d = deps(tagFail, async () => {
    if (++m === 1) throw new Error("blip");
    return [box(1), box(5)];
  });
  r = await analysePhoto(photo, d);
  check("tag fails, detection blips once then works → needs-selection", r.kind === "needs-selection");
}

async function img(format: "jpeg" | "png" | "webp" | "tiff" | "gif") {
  const base = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 50, b: 50 } } });
  return base[format]().toBuffer();
}

async function partNormalize() {
  console.log("\n— B. normalizeUpload (real bytes, wrong labels) —");

  const jpeg = new File([new Uint8Array(await img("jpeg"))], "a.jpg", { type: "image/heif" });
  let n = await normalizeUpload(jpeg);
  check("JPEG bytes labelled image/heif → image/jpeg, bytes untouched", n.mimeType === "image/jpeg" && n.file.type === "image/jpeg" && n.file.size === jpeg.size);

  const png = new File([new Uint8Array(await img("png"))], "a.png", { type: "" });
  n = await normalizeUpload(png);
  check("PNG bytes with empty label → image/png", n.mimeType === "image/png");

  const webp = new File([new Uint8Array(await img("webp"))], "a.webp", { type: "image/jpeg" });
  n = await normalizeUpload(webp);
  check("WebP bytes labelled jpeg → image/webp", n.mimeType === "image/webp");

  const tiff = new File([new Uint8Array(await img("tiff"))], "a.tif", { type: "image/tiff" });
  n = await normalizeUpload(tiff);
  const meta = await sharp(Buffer.from(n.base64, "base64")).metadata();
  check("TIFF (not Claude-readable) → converted to JPEG", n.mimeType === "image/jpeg" && meta.format === "jpeg");

  const junk = new File([new TextEncoder().encode("hello, not an image")], "a.jpg", { type: "image/jpeg" });
  let threw = "";
  try {
    await normalizeUpload(junk);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  check("non-image labelled jpeg → clear error", threw.includes("isn't a photo"), threw);
}

async function partReal() {
  console.log("\n— C. real photos from the report (real Claude + Gemini) —");
  const dir = "/tmp/gp";
  if (!fs.existsSync(dir) || !process.env.ANTHROPIC_API_KEY || !process.env.GEMINI_API_KEY) {
    console.log("skipped (no /tmp/gp photos or no API keys)");
    return;
  }
  const { tagPhoto } = await import("@/lib/anthropic");
  const { detectPeople } = await import("@/lib/gemini");

  for (const name of ["untitled-original.jpg", "quarter-snap-original.jpg", "brown-original.jpg", "olive-original.jpg", "white-original.jpg"]) {
    const p = `${dir}/${name}`;
    if (!fs.existsSync(p)) continue;
    const bytes = fs.readFileSync(p);
    // Reproduce the real failure: upload carrying the wrong label.
    const file = new File([new Uint8Array(bytes)], name, { type: "image/heif" });
    const n = await normalizeUpload(file);
    const r = await analysePhoto(n, { tag: (b, m) => tagPhoto(b, m), detect: detectPeople });
    const summary =
      r.kind === "garments"
        ? `garments: ${r.garments.map((g) => g.name || "(blank)").join(", ")}`
        : r.kind === "needs-selection"
          ? `needs-selection (${r.people.length} people)`
          : `error: ${r.error}`;
    console.log(`${name}: label heif → ${n.mimeType}; ${summary}`);
    check(`${name}: never an unprompted blank item`, !(r.kind === "garments" && r.garments.some((g) => !g.name)));
  }
}

async function main() {
  await partA();
  await partNormalize();
  await partReal();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
