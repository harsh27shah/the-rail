// Tests for per-person AI spend tracking (lib/usage.ts).
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-usage.ts
// The database checks need the "ai_usage" step in supabase/schema.sql to have been run;
// until then they are skipped (and say so).

import { createClient } from "@supabase/supabase-js";
import {
  claudeCost, currentUsageUser, geminiCost, recordClaude, recordGemini, recordUsage, spendByUser,
  trackUsageFor, withUsageUser,
} from "@/lib/usage";
import { getSupabaseAdmin } from "@/lib/supabase";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const tick = () => new Promise((r) => setTimeout(r, 5));

async function main() {
  // ── cost maths ──
  check("Claude: 1M tokens in costs $3, 1M out costs $15", near(claudeCost(1_000_000, 0), 3) && near(claudeCost(0, 1_000_000), 15));
  check("Claude: a typical small call", near(claudeCost(1000, 500), 0.0105));
  check("Claude: zero tokens cost nothing", claudeCost(0, 0) === 0);
  check("Gemini: an image answer uses the image rate (about 4 cents for 1,290 tokens)", near(geminiCost(1000, 1290, true), 0.0003 + 0.0387));
  check("Gemini: a text answer is far cheaper than an image", geminiCost(1000, 1290, false) < geminiCost(1000, 1290, true) / 5);

  // ── who is this call for ──
  check("with no tag, there is no person", currentUsageUser() === null);
  await withUsageUser("user-a", async () => {
    check("withUsageUser tags the work", currentUsageUser() === "user-a");
    await tick();
    check("the tag survives waiting", currentUsageUser() === "user-a");
    await withUsageUser("user-b", async () => {
      await tick();
      check("an inner tag replaces it", currentUsageUser() === "user-b");
    });
    check("and the outer one comes back", currentUsageUser() === "user-a");
  });
  check("the tag does not leak out afterwards", currentUsageUser() === null);

  // Real actions tag right AFTER `await requireUser()`, so the tag is set from inside their own
  // continuation. These tests copy that shape (tagging before any await would leak into the caller).
  async function action(id: string, waits: number) {
    await tick(); // stands in for `await requireUser()`
    trackUsageFor(id);
    for (let i = 0; i < waits; i++) await tick();
    return currentUsageUser();
  }
  const seen = await action("user-c", 1);
  check("trackUsageFor tags everything the action goes on to do", seen === "user-c");
  const both = await Promise.all([action("one", 3), action("two", 1)]);
  check("two requests at the same time keep their own tags", both[0] === "one" && both[1] === "two", JSON.stringify(both));

  // ── database ──
  const admin = getSupabaseAdmin()!;
  const probe = await admin.from("ai_usage").select("id").limit(1);
  if (probe.error) {
    console.log(`SKIP  database checks: ai_usage isn't there yet (${probe.error.message}). Run the SQL, then re-run this.`);
    console.log(`\n${passed} passed, ${failed} failed (database checks skipped)`);
    process.exit(failed ? 1 : 0);
  }

  const email = `usage-test-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { data: created, error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (ce || !created.user) throw ce ?? new Error("no user");
  const uid = created.user.id;
  const created2 = await admin.auth.admin.createUser({ email: email.replace("usage-test", "usage-test2"), email_confirm: true });
  const uid2 = created2.data.user!.id;

  try {
    // a call recorded inside a tagged action lands on that person
    await withUsageUser(uid, async () => {
      await recordClaude("outfits", "claude-sonnet-5", { input_tokens: 10_000, output_tokens: 1_000 }); // 0.03 + 0.015 = 0.045
      await recordGemini("background-removal", "gemini-test", {
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1290 },
        candidates: [{ content: { parts: [{ inlineData: { data: "x" } }] } }],
      }); // 0.0003 + 0.0387 = 0.039
    });
    await recordUsage({ userId: uid2, provider: "claude", model: "claude-sonnet-5", action: "read-photo", inputTokens: 1000, outputTokens: 100, costUsd: 0.0045 });

    let rows = await spendByUser();
    const mine = rows?.find((r) => r.userId === uid);
    const theirs = rows?.find((r) => r.userId === uid2);
    check("spend adds up per person (this month)", !!mine && near(mine.monthUsd, 0.084, 1e-6) && mine.monthCalls === 2, JSON.stringify(mine));
    check("all-time matches this month for new activity", !!mine && near(mine.totalUsd, mine.monthUsd, 1e-9));
    check("another person's spend is kept separate", !!theirs && near(theirs.monthUsd, 0.0045, 1e-6) && theirs.monthCalls === 1, JSON.stringify(theirs));

    // an untagged call is still recorded, with nobody attached
    const before = rows?.find((r) => r.userId === null)?.monthCalls ?? 0;
    await recordClaude("read-photo", "claude-sonnet-5", { input_tokens: 1, output_tokens: 1 });
    rows = await spendByUser();
    check("an untagged call is recorded with no person, not lost", (rows?.find((r) => r.userId === null)?.monthCalls ?? 0) === before + 1);

    // an old row counts toward all-time but not this month
    await admin.from("ai_usage").insert({ user_id: uid2, provider: "claude", model: "m", action: "read-photo", cost_usd: 1, created_at: new Date(Date.now() - 70 * 86400_000).toISOString() });
    rows = await spendByUser();
    const t2 = rows?.find((r) => r.userId === uid2);
    check("a 70-day-old call counts in the total but not this month", !!t2 && near(t2.totalUsd, 1.0045, 1e-6) && near(t2.monthUsd, 0.0045, 1e-6), JSON.stringify(t2));

    // logging problems must never throw into the app
    let threw = false;
    try { await recordUsage({ userId: uid, provider: "nonsense" as never, model: "m", action: "outfits", inputTokens: 1, outputTokens: 1, costUsd: 0 }); } catch { threw = true; }
    check("a failed log write never throws", !threw);
    let threw2 = false;
    try { await recordGemini("find-people", "m", {}); } catch { threw2 = true; }
    check("a reply with no usage info is handled", !threw2);

    // the public (anon) key can neither read the rows nor run the totals
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const read = await anon.from("ai_usage").select("id").limit(5);
    check("the public key reads no usage rows", !read.error && (read.data?.length ?? 0) === 0, JSON.stringify(read));
    const rpc = await anon.rpc("ai_spend_by_user");
    check("the public key cannot run the totals", !!rpc.error, JSON.stringify(rpc.data));

    // deleting a person keeps their spend (with nobody attached) so totals stay honest
    const grandBefore = (await spendByUser())!.reduce((n, r) => n + r.totalUsd, 0);
    await admin.auth.admin.deleteUser(uid2);
    const grandAfter = (await spendByUser())!.reduce((n, r) => n + r.totalUsd, 0);
    check("deleting an account keeps its spend in the totals", near(grandBefore, grandAfter, 1e-6), `${grandBefore} vs ${grandAfter}`);
  } finally {
    await admin.from("ai_usage").delete().in("model", ["gemini-test", "m"]);
    await admin.from("ai_usage").delete().eq("user_id", uid);
    await admin.from("ai_usage").delete().is("user_id", null).eq("input_tokens", 1).eq("output_tokens", 1);
    // the second test person's row, which lost its person when that account was deleted above
    await admin.from("ai_usage").delete().is("user_id", null).eq("input_tokens", 1000).eq("output_tokens", 100).eq("cost_usd", 0.0045);
    await admin.auth.admin.deleteUser(uid);
    await admin.auth.admin.deleteUser(uid2);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
