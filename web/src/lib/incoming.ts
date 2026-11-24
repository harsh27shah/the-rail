import "server-only";
import { getSupabaseAdmin } from "./supabase";

/**
 * Temporary home for photos on their way in (PROJECT.md §5 item 28).
 *
 * Why this exists: the Add flow used to post each photo through the server (a Server Action),
 * and Vercel refuses any request body over about 4.5 MB before our code even runs, which is
 * smaller than many camera and iPhone photos. Now the browser sends the photo straight to
 * storage using a one-time upload link, and the server then picks it up from there. Nothing big
 * ever passes through the server's front door.
 *
 * The photos wait in a PRIVATE bucket (no public link, unlike the wardrobe's own photos), in a
 * folder per person, and are deleted as soon as they've been processed, skipped, or have failed.
 * Anything someone walks away from is swept up after two hours. That matters for photos with
 * several people in them: those are held here while the person picks which one is them, and the
 * full photo must not outlive that. Only the single-person crop ever becomes part of the wardrobe.
 */

export const INCOMING_BUCKET = "incoming-photos";
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
export const INCOMING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** A reason an upload was turned down, worded for the person who picked the photo. */
export class UploadRejected extends Error {}

const PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.([a-z0-9]{1,5})$/i;

/** Is this one of the caller's own upload paths ("<their id>/<random>.<ext>")? Everything that
 * takes a path from the browser checks this first, so nobody can name someone else's file. */
export function isOwnUploadPath(userId: string, path: string): boolean {
  const m = PATH_RE.exec(path);
  return !!m && m[1].toLowerCase() === userId.toLowerCase();
}

export function extensionFor(filename: string, type: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(filename)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic" || type === "image/heif") return "heic";
  return "jpg";
}

/** Returns a message if the photo should be turned away before uploading, else null. */
export function checkUpload(info: { size: number; type: string }): string | null {
  if (!Number.isFinite(info.size) || info.size <= 0) return "that photo is empty";
  if (info.size > MAX_UPLOAD_BYTES) return `that photo is too big (the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`;
  // Some browsers report no type at all for a perfectly good photo; only refuse a type that
  // plainly isn't an image.
  if (info.type && !info.type.startsWith("image/")) return "that file isn't a photo";
  return null;
}

function db() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");
  return admin;
}

let bucketReady: Promise<void> | null = null;
/** Creates the private bucket the first time it's needed (and does nothing after that). */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const admin = db();
    const { data } = await admin.storage.getBucket(INCOMING_BUCKET);
    if (data) return;
    const { error } = await admin.storage.createBucket(INCOMING_BUCKET, {
      public: false,
      fileSizeLimit: MAX_UPLOAD_BYTES,
      allowedMimeTypes: ["image/*"],
    });
    // Two requests creating it at the same moment: the loser's error is harmless.
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
  })().catch((e) => {
    bucketReady = null; // try again next time rather than caching a failure
    throw e;
  });
  return bucketReady;
}

/** A one-time link the browser can upload a single photo to, and the path to hand back to us. */
export async function createUploadTarget(
  userId: string,
  info: { filename: string; type: string; size: number }
): Promise<{ path: string; signedUrl: string }> {
  const problem = checkUpload(info);
  if (problem) throw new UploadRejected(problem);
  await ensureBucket();
  void sweepStaleUploads(userId).catch(() => {}); // housekeeping; never holds up the upload

  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(info.filename, info.type)}`;
  const { data, error } = await db().storage.from(INCOMING_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "couldn't create an upload link");
  return { path, signedUrl: data.signedUrl };
}

/** Reads an uploaded photo back as a File. Refuses anything that isn't the caller's own. */
export async function readUpload(userId: string, path: string): Promise<File> {
  if (!isOwnUploadPath(userId, path)) throw new Error("That photo isn't yours");
  const { data, error } = await db().storage.from(INCOMING_BUCKET).download(path);
  if (error || !data) throw new Error("that photo didn't come through, so try it again");
  return new File([data], `photo.${path.split(".").pop()}`, { type: data.type || "image/jpeg" });
}

/** Deletes an uploaded photo. Never throws: it's cleanup, and the sweep catches anything missed. */
export async function discardUpload(userId: string, path: string): Promise<void> {
  if (!isOwnUploadPath(userId, path)) return;
  try {
    await db().storage.from(INCOMING_BUCKET).remove([path]);
  } catch {
    // swept later
  }
}

/** Which of a folder's files are old enough to delete? (Pure, so it can be tested.) */
export function staleUploads(
  objects: { name: string; created_at?: string | null }[],
  now: number,
  maxAgeMs = INCOMING_MAX_AGE_MS
): string[] {
  return objects
    .filter((o) => o.created_at && now - new Date(o.created_at).getTime() > maxAgeMs)
    .map((o) => o.name);
}

/** Deletes this person's uploads that were never picked up (they closed the tab, say). */
export async function sweepStaleUploads(userId: string, now = Date.now()): Promise<number> {
  const store = db().storage.from(INCOMING_BUCKET);
  const { data, error } = await store.list(userId, { limit: 200 });
  if (error || !data) return 0;
  const stale = staleUploads(data, now);
  if (stale.length) await store.remove(stale.map((n) => `${userId}/${n}`));
  return stale.length;
}
