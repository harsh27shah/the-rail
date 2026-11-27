// Cross-tenant isolation test — the check that accounts actually keep people's wardrobes apart.
//
// Creates two throwaway users in the real Supabase project, gives each some items, then has
// user A try every operation in lib/items.ts and lib/google-auth-store.ts against user B's
// data — reads, edits, image swaps, undo, duplicate-flagging, bulk delete — and asserts that
// none of it lands. Imports the *real* data-layer code rather than re-implementing its
// queries, so what's tested is what ships. Cleans up every user, row and storage file it
// created, even on failure.
//
// Needs the accounts migration applied first (supabase/schema.sql). Run from web/:
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-tenant-isolation.ts
// (`--conditions=react-server` lets the app's `server-only` imports load outside Next.)

import { getSupabaseAdmin } from "@/lib/supabase";
import { claimGeneration, loadSet, saveFailed, saveReady, userHasSeenOutfits } from "@/lib/outfit-store";
import {
  createItem,
  deleteItems,
  findDuplicateCandidates,
  flagDuplicate,
  getCleaningIds,
  getDuplicateQueue,
  getItem,
  getItemImagePaths,
  getItems,
  markManualDuplicate,
  replaceItemImage,
  resetToOriginalImage,
  resolveDuplicate,
  revertLastCorrection,
  snapshotForUndo,
  updateItem,
  type ItemInput,
} from "@/lib/items";
import { loadTokens, saveTokens } from "@/lib/google-auth-store";

const admin = getSupabaseAdmin();
if (!admin) throw new Error("Supabase isn't configured (.env.local)");

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
async function throws(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

const input = (name: string): ItemInput => ({
  name,
  category: "Tops",
  color: "isolation-test-teal",
  palette: ["#008080"],
  pattern: "solid",
  material: "cotton",
  formality: 3,
  seasons: ["spring"],
  notes: "",
});

const BUCKET = "wardrobe-images";
async function bucketNames(): Promise<Set<string>> {
  const names = new Set<string>();
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data } = await admin!.storage.from(BUCKET).list("", { limit: 1000, offset });
    if (!data?.length) break;
    for (const f of data) names.add(f.name);
    if (data.length < 1000) break;
  }
  return names;
}

const createdUserIds: string[] = [];
async function makeUser(label: string): Promise<string> {
  const { data, error } = await admin!.auth.admin.createUser({
    email: `isolation-test-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`couldn't create test user ${label}: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function main() {
  const storageBefore = await bucketNames();

  const A = await makeUser("a");
  const B = await makeUser("b");
  console.log(`\nTwo test users created. A=${A.slice(0, 8)} B=${B.slice(0, 8)}\n`);

  const a1 = await createItem(A, input("A's shirt"), null);
  const a2 = await createItem(A, input("A's other shirt"), null);
  const b1 = await createItem(B, input("B's shirt"), null);
  const b2 = await createItem(B, input("B's other shirt"), null);

  console.log("Reads");
  const aItems = (await getItems(A)).map((i) => i.id).sort();
  const bItems = (await getItems(B)).map((i) => i.id).sort();
  check("getItems(A) returns exactly A's items", JSON.stringify(aItems) === JSON.stringify([a1, a2].sort()));
  check("getItems(B) returns exactly B's items", JSON.stringify(bItems) === JSON.stringify([b1, b2].sort()));
  check("getItem(A, B's id) → null", (await getItem(A, b1)) === null);
  check("getItem(A, A's id) still works", (await getItem(A, a1))?.name === "A's shirt");
  check("getItemImagePaths(A, B's id) → null", (await getItemImagePaths(A, b1)) === null);

  console.log("\nWrites against someone else's item");
  await updateItem(A, b1, input("HIJACKED"));
  check("updateItem(A, B's id) leaves B's item untouched", (await getItem(B, b1))?.name === "B's shirt");

  const tinyPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  await replaceItemImage(A, b1, tinyPng, "image/png");
  check("replaceItemImage(A, B's id) doesn't change B's photo", (await getItemImagePaths(B, b1))?.currentPath == null);

  await snapshotForUndo(A, b1);
  const { data: afterSnap } = await admin!.from("items").select("previous_state").eq("id", b1).single();
  check("snapshotForUndo(A, B's id) writes nothing", afterSnap?.previous_state == null);
  check("revertLastCorrection(A, B's id) → false", (await revertLastCorrection(A, b1)) === false);
  check("resetToOriginalImage(A, B's id) → false", (await resetToOriginalImage(A, b1)) === false);

  console.log("\nDuplicate flagging across users");
  check("markManualDuplicate(A, A's item → B's item) throws", await throws(() => markManualDuplicate(A, a1, b1)));
  check("markManualDuplicate(A, B's item → A's item) throws", await throws(() => markManualDuplicate(A, b1, a1)));
  check("flagDuplicate(A, A's → B's) throws", await throws(() => flagDuplicate(A, a1, b1, "x", 1)));
  const { data: dupCheck } = await admin!.from("items").select("id,duplicate_of").in("id", [a1, b1]);
  check("no duplicate_of got written on either item", (dupCheck ?? []).every((r) => r.duplicate_of == null));

  console.log("\nCandidate search");
  // Give B's items photos distinguishable from "still extracting" so they'd *qualify* as
  // candidates — the only thing keeping them out of A's results should be the user scope.
  await admin!.from("items").update({ image_path: "b-extracted.jpg", original_image_path: "b-original.jpg" }).in("id", [b1, b2]);
  const candidates = await findDuplicateCandidates(A, "Tops", a1);
  check("findDuplicateCandidates(A) never returns B's items", candidates.every((c) => c.id !== b1 && c.id !== b2));

  console.log("\nThe duplicate queue and resolving it");
  await markManualDuplicate(A, a1, a2); // legitimate: both are A's
  check("getDuplicateQueue(A) shows A's own pair", (await getDuplicateQueue(A)).length === 1);
  check("getDuplicateQueue(B) shows none of it", (await getDuplicateQueue(B)).length === 0);
  await resolveDuplicate(B, a1, "dismiss");
  check("resolveDuplicate(B, dismiss) on A's pair does nothing", (await getDuplicateQueue(A)).length === 1);
  await resolveDuplicate(B, a1, "remove-flagged");
  await resolveDuplicate(B, a1, "remove-original");
  check("resolveDuplicate(B, remove-*) on A's pair deletes nothing", (await getItems(A)).length === 2);

  console.log("\nDeleting");
  await deleteItems(A, [b1, b2]);
  check("deleteItems(A, B's ids) deletes nothing", (await getItems(B)).length === 2);
  await deleteItems(A, [a1, b1]); // mixed: only A's own should go
  check("deleteItems with a mixed list only removes the caller's own", (await getItem(A, a1)) === null && (await getItem(B, b1)) !== null);

  console.log("\nGoogle Photos tokens");
  await saveTokens(A, { accessToken: "a-access", refreshToken: "a-refresh", expiresAt: Date.now() + 3_600_000 });
  check("loadTokens(B) can't see A's tokens", (await loadTokens(B)) === null);
  await saveTokens(B, { accessToken: "b-access", refreshToken: "b-refresh", expiresAt: Date.now() + 3_600_000 });
  check("saving B's tokens doesn't overwrite A's", (await loadTokens(A))?.accessToken === "a-access");
  await saveTokens(A, { accessToken: "a-access-2", expiresAt: Date.now() + 3_600_000 }); // refresh-only path
  check("a refresh-only save for A leaves B alone", (await loadTokens(B))?.accessToken === "b-access");
  check("…and keeps A's refresh token", (await loadTokens(A))?.refreshToken === "a-refresh");

  console.log("\nSaved outfits");
  // fresh items: earlier tests in this file delete a1 and b1
  const o1 = await createItem(A, input("A's outfit shirt"), null);
  const o2 = await createItem(A, input("A's other outfit shirt"), null);
  const p1 = await createItem(B, input("B's outfit shirt"), null);
  const someOutfits = [{ itemIds: [o1], why: "Test." }];
  check("A can claim and save outfits for A's own item", (await claimGeneration(A, o1)) === true);
  await saveReady(A, o1, someOutfits, 2);
  check("A reads them back", (await loadSet(A, o1))?.outfits.length === 1);
  check("B can't read A's saved outfits (same item id, other account)", (await loadSet(B, o1)) === null);
  const refuses = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch (e) { return e instanceof Error && /isn't yours/.test(e.message); } };
  check("claimGeneration(A, B's item) is refused", await refuses(() => claimGeneration(A, p1)));
  check("saveReady(A, B's item) is refused", await refuses(() => saveReady(A, p1, someOutfits, 2)));
  check("saveFailed(A, B's item) is refused", await refuses(() => saveFailed(A, p1, "x")));
  const { data: strayRows } = await admin!.from("outfit_sets").select("user_id,hero_item_id").eq("hero_item_id", p1);
  check("…and nothing was written against B's item", (strayRows ?? []).length === 0, JSON.stringify(strayRows));
  check("A's claim doesn't block B claiming B's own item", (await claimGeneration(B, p1)) === true);
  check("a second live claim on the same item is refused", (await claimGeneration(B, p1)) === false);
  check("A's saved outfits are untouched by B's activity", (await loadSet(A, o1))?.status === "ready");
  check("userHasSeenOutfits: A has finished outfits, so true", (await userHasSeenOutfits(A)) === true);
  check("userHasSeenOutfits: B only has an unfinished claim (and never sees A's), so false", (await userHasSeenOutfits(B)) === false);
  await saveReady(A, o2, someOutfits, 2);
  await deleteItems(A, [o2]);
  check("deleting an item takes its saved outfits with it", (await loadSet(A, o2)) === null);

  console.log("\nThe Add page's \"still cleaning?\" check");
  const fresh = await createItem(A, input("A's fresh photo"), new File([Buffer.from("not really a photo")], "fresh.jpg", { type: "image/jpeg" }));
  check("getCleaningIds(A) lists A's own just-added piece", (await getCleaningIds(A, [fresh])).includes(fresh));
  check("getCleaningIds(B, A's piece) → nothing (can't see another account's pieces)", (await getCleaningIds(B, [fresh])).length === 0);
  check("getCleaningIds(A, a piece with no photo) → nothing", (await getCleaningIds(A, [a1])).length === 0);
  check("getCleaningIds(A, no ids) → nothing", (await getCleaningIds(A, [])).length === 0);
  await deleteItems(A, [fresh]);

  console.log("\nRow-level security (the second layer)");
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (anon) {
    const res = await fetch(`${url}/rest/v1/items?select=id&limit=5`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    check("the public anon key can read zero rows from items", rows.length === 0, `got ${rows.length}`);
    const res2 = await fetch(`${url}/rest/v1/google_oauth_tokens?select=user_id&limit=5`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    const rows2 = res2.ok ? ((await res2.json()) as unknown[]) : [];
    check("the public anon key can read zero rows from google_oauth_tokens", rows2.length === 0, `got ${rows2.length}`);
    const res3 = await fetch(`${url}/rest/v1/outfit_sets?select=user_id&limit=5`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    const rows3 = res3.ok ? ((await res3.json()) as unknown[]) : [];
    check("the public anon key can read zero rows from outfit_sets", rows3.length === 0, `got ${rows3.length}`);
  } else {
    console.log("  (skipped — SUPABASE_ANON_KEY isn't set)");
  }

  // Storage the image-swap test uploaded.
  const stray = [...(await bucketNames())].filter((n) => !storageBefore.has(n));
  if (stray.length) await admin!.storage.from(BUCKET).remove(stray);
}

main()
  .catch((e) => {
    failures.push(`test run crashed: ${e instanceof Error ? e.message : e}`);
    console.error(e);
  })
  .finally(async () => {
    // Deleting the users cascades to their items and tokens (on delete cascade).
    for (const id of createdUserIds) await admin!.auth.admin.deleteUser(id);
    console.log(`\n${passed} passed, ${failures.length} failed.`);
    if (failures.length) {
      console.log("Failures:\n  - " + failures.join("\n  - "));
      process.exit(1);
    }
  });
