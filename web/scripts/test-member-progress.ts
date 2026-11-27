// Tests for the per-friend progress shown on the owner's Invite page (memberProgress in lib/invites.ts),
// against the real database with throwaway accounts.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-member-progress.ts

import { memberProgress } from "@/lib/invites";
import { createItem, type ItemInput } from "@/lib/items";
import { claimGeneration, saveReady } from "@/lib/outfit-store";
import { getSupabaseAdmin } from "@/lib/supabase";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const input = (name: string): ItemInput => ({
  name, category: "Tops", color: "grey", palette: ["#888888"], pattern: "solid", material: "cotton", formality: 2,
  seasons: [], notes: "", needsReview: false, reviewNote: null,
});

async function main() {
  const admin = getSupabaseAdmin()!;
  const ids: string[] = [];
  const mkUser = async (tag: string) => {
    const { data, error } = await admin.auth.admin.createUser({ email: `mp-${tag}-${crypto.randomUUID().slice(0, 6)}@example.com`, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("no user");
    ids.push(data.user.id);
    return data.user.id;
  };
  try {
    const none = await mkUser("none");       // account, no pieces
    const some = await mkUser("some");       // pieces, no finished outfits (only an unfinished claim)
    const done = await mkUser("done");       // pieces and a finished outfit set

    for (const n of ["a", "b", "c"]) await createItem(done, input(`done ${n}`), null);
    for (const n of ["a", "b"]) await createItem(some, input(`some ${n}`), null);

    const doneItem = await createItem(done, input("done hero"), null);
    check("a claim on outfits can be made", (await claimGeneration(done, doneItem)) === true);
    await saveReady(done, doneItem, [{ itemIds: [doneItem], why: "Test." }], 4);

    const someItem = await createItem(some, input("some hero"), null);
    await claimGeneration(some, someItem); // unfinished: must NOT count as having seen outfits

    const p = await memberProgress([none, some, done]);
    check("someone with no pieces: 0 pieces, no outfits", p.get(none)?.pieces === 0 && p.get(none)?.seenOutfits === false, JSON.stringify(p.get(none)));
    check("someone with pieces but only an unfinished outfit claim: counted pieces, has NOT seen outfits",
      p.get(some)?.pieces === 3 && p.get(some)?.seenOutfits === false, JSON.stringify(p.get(some)));
    check("someone with a finished outfit set: counted pieces, HAS seen outfits",
      p.get(done)?.pieces === 4 && p.get(done)?.seenOutfits === true, JSON.stringify(p.get(done)));
    check("each person's numbers are their own (no leaking between accounts)", p.get(done)?.pieces !== p.get(some)?.pieces);
    check("asking for nobody returns nothing", (await memberProgress([])).size === 0);
    check("an unknown id reads as empty, not an error", (await memberProgress([crypto.randomUUID()])).values().next().value?.pieces === 0);
  } finally {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
