// Tests for the temporary upload area (lib/incoming.ts), including the real storage.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-incoming.ts

import {
  INCOMING_BUCKET, MAX_UPLOAD_BYTES, UploadRejected, checkUpload, createUploadTarget, discardUpload,
  extensionFor, isOwnUploadPath, readUpload, staleUploads, sweepStaleUploads,
} from "@/lib/incoming";
import { getSupabaseAdmin } from "@/lib/supabase";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}
const rejects = async (fn: () => Promise<unknown>, test: (e: unknown) => boolean = () => true) => {
  try { await fn(); return false; } catch (e) { return test(e); }
};

const A = crypto.randomUUID(), B = crypto.randomUUID(); // plain ids: storage paths don't need real accounts
const uuid = () => crypto.randomUUID();

async function upload(signedUrl: string, bytes: number, type = "image/jpeg") {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([new Uint8Array(bytes).map((_, i) => (i * 13) % 251)], { type }));
  return fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
}

async function main() {
  // ── pure rules ──
  check("an upload path under the caller's own id is accepted", isOwnUploadPath(A, `${A}/${uuid()}.jpg`));
  check("a path under someone else's id is refused", !isOwnUploadPath(A, `${B}/${uuid()}.jpg`));
  check("path tricks are refused", !isOwnUploadPath(A, `${A}/../${B}/${uuid()}.jpg`) && !isOwnUploadPath(A, `${A}/${uuid()}.jpg/../x`) && !isOwnUploadPath(A, `${A}//${uuid()}.jpg`));
  check("odd shapes are refused", !isOwnUploadPath(A, "") && !isOwnUploadPath(A, A) && !isOwnUploadPath(A, `${A}/short.jpg`) && !isOwnUploadPath(A, `${A}/${uuid()}`));
  check("an id with different capitals still matches", isOwnUploadPath(A.toUpperCase(), `${A}/${uuid()}.jpg`));

  check("extension comes from the file name", extensionFor("IMG_1.HEIC", "") === "heic" && extensionFor("a.png", "image/jpeg") === "png");
  check("extension falls back to the type, then jpg", extensionFor("photo", "image/webp") === "webp" && extensionFor("photo", "") === "jpg");
  check("a weird extension is not trusted", extensionFor("evil.jpg/../x", "") === "jpg" || /^[a-z0-9]{1,5}$/.test(extensionFor("evil.jpg/../x", "")));

  check("a normal photo passes", checkUpload({ size: 5_000_000, type: "image/jpeg" }) === null);
  check("a photo with no reported type passes", checkUpload({ size: 5_000_000, type: "" }) === null);
  check("an empty file is refused", checkUpload({ size: 0, type: "image/jpeg" }) !== null);
  check("a file over the limit is refused", checkUpload({ size: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" })?.includes("too big") === true);
  check("exactly at the limit passes", checkUpload({ size: MAX_UPLOAD_BYTES, type: "image/jpeg" }) === null);
  check("a non-image is refused", checkUpload({ size: 1000, type: "application/pdf" })?.includes("isn't a photo") === true);

  const old = new Date(Date.now() - 3 * 3600_000).toISOString(), fresh = new Date(Date.now() - 600_000).toISOString();
  check("only files older than two hours are stale",
    staleUploads([{ name: "old", created_at: old }, { name: "new", created_at: fresh }, { name: "nodate" }], Date.now()).join() === "old");

  // ── real storage ──
  check("createUploadTarget turns away an oversized photo with a friendly error",
    await rejects(() => createUploadTarget(A, { filename: "x.jpg", type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 }), (e) => e instanceof UploadRejected));

  const t = await createUploadTarget(A, { filename: "big.jpg", type: "image/jpeg", size: 6_000_000 });
  check("the upload path belongs to the caller and keeps the extension", isOwnUploadPath(A, t.path) && t.path.endsWith(".jpg"));
  const put = await upload(t.signedUrl, 6_000_000); // over Vercel's 4.5 MB limit
  check("a 6 MB photo uploads straight to storage", put.ok, `${put.status}`);

  const file = await readUpload(A, t.path);
  check("the server reads back every byte", file.size === 6_000_000 && file.type === "image/jpeg", `${file.size} ${file.type}`);
  check("another account cannot read it", await rejects(() => readUpload(B, t.path), (e) => e instanceof Error && /isn't yours/.test(e.message)));
  check("naming a path outside your own folder is refused", await rejects(() => readUpload(A, `${B}/${uuid()}.jpg`)));

  const admin = getSupabaseAdmin()!;
  const bucket = (await admin.storage.getBucket(INCOMING_BUCKET)).data;
  check("the bucket is private", bucket?.public === false);
  const publicUrl = admin.storage.from(INCOMING_BUCKET).getPublicUrl(t.path).data.publicUrl;
  const anon = await fetch(publicUrl);
  check("the photo has no public link", !anon.ok, `status ${anon.status}`);

  const again = await upload(t.signedUrl, 1000);
  check("an upload link works only once", !again.ok, `status ${again.status}`);

  await discardUpload(B, t.path);
  check("someone else's discard does nothing", (await readUpload(A, t.path)).size === 6_000_000);
  await discardUpload(A, t.path);
  check("discarding removes it", await rejects(() => readUpload(A, t.path)));

  // sweep: a fresh file survives a normal sweep, but not one run three hours from now
  const t2 = await createUploadTarget(A, { filename: "s.jpg", type: "image/jpeg", size: 1000 });
  await upload(t2.signedUrl, 1000);
  check("a fresh upload survives a sweep", (await sweepStaleUploads(A)) === 0 && (await readUpload(A, t2.path)).size === 1000);
  check("an abandoned upload is swept after two hours", (await sweepStaleUploads(A, Date.now() + 3 * 3600_000)) >= 1 && (await rejects(() => readUpload(A, t2.path))));
  check("a sweep for one account leaves another's files", await (async () => {
    const tb = await createUploadTarget(B, { filename: "b.jpg", type: "image/jpeg", size: 1000 });
    await upload(tb.signedUrl, 1000);
    await sweepStaleUploads(A, Date.now() + 3 * 3600_000);
    const still = (await readUpload(B, tb.path)).size === 1000;
    await discardUpload(B, tb.path);
    return still;
  })());

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
