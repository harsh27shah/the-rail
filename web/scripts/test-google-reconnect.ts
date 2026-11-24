// Tests what happens when the stored Google Photos connection is dead (the 2026-11-23
// report: "token refresh failed: 400 invalid_grant — Token has been expired or revoked",
// with "Try again" hitting the same dead connection forever).
//
// Case 1 uses a throwaway user with a fake, expired stored connection and Google's REAL token
// endpoint — a made-up refresh token gets the same `invalid_grant` answer an expired one does.
// The remaining cases stub Google's responses, to prove the fix doesn't over-reach (only a
// dead connection is forgotten; a wrong secret or a Google outage leaves it alone).
// Throwaway user and rows are deleted at the end.
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-google-reconnect.ts

import { getSupabaseAdmin } from "@/lib/supabase";
import { loadTokens, saveTokens } from "@/lib/google-auth-store";
import { createPickerSession, getValidAccessToken, GoogleReconnectNeeded } from "@/lib/google-photos";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

const admin = getSupabaseAdmin()!;
const realFetch = globalThis.fetch;

async function seedDeadConnection(userId: string) {
  // Expired access token + a refresh token Google has never heard of.
  await saveTokens(userId, { accessToken: "stale", refreshToken: "1//not-a-real-refresh-token", expiresAt: Date.now() - 60_000 });
}

function stubTokenEndpoint(status: number, body: object) {
  // Everything except Google's token endpoint (the database calls, mainly) goes through to
  // the real fetch, with its original arguments intact.
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify(body), { status });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

async function main() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `reconnect-test-${crypto.randomUUID().slice(0, 8)}@example.com`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`couldn't create test user: ${error?.message}`);
  const userId = data.user.id;

  try {
    // 1. The reported failure, against Google's real server.
    await seedDeadConnection(userId);
    let err = await catchError(() => getValidAccessToken(userId));
    check("dead connection (real Google) → GoogleReconnectNeeded", err instanceof GoogleReconnectNeeded, String(err));
    check(
      "…and the message is plain English, not Google's raw JSON",
      err instanceof Error && !err.message.includes("invalid_grant") && err.message.includes("reconnect"),
      err instanceof Error ? err.message : ""
    );
    check("…and the dead connection is forgotten", (await loadTokens(userId)) === null);

    // 2. The retry that used to loop forever now lands on "not connected" → consent screen.
    err = await catchError(() => getValidAccessToken(userId));
    check("next attempt → NOT_CONNECTED (sends the person to reconnect)", err instanceof Error && err.message === "NOT_CONNECTED", String(err));

    // 3. A wrong client secret is not the person's connection being dead — don't forget it.
    await seedDeadConnection(userId);
    stubTokenEndpoint(401, { error: "invalid_client" });
    err = await catchError(() => getValidAccessToken(userId));
    check("invalid_client → plain error, NOT a reconnect", err instanceof Error && !(err instanceof GoogleReconnectNeeded), String(err));
    check("…and the stored connection is kept", (await loadTokens(userId)) !== null);

    // 4. Google having a bad moment — same.
    stubTokenEndpoint(503, { error: "backend_error" });
    err = await catchError(() => getValidAccessToken(userId));
    check("Google 503 → plain error, NOT a reconnect", err instanceof Error && !(err instanceof GoogleReconnectNeeded), String(err));
    check("…and the stored connection is kept", (await loadTokens(userId)) !== null);

    // 5. A revoked access token (stored expiry still in the future) is rejected with 401 by
    //    the Picker API itself.
    globalThis.fetch = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    err = await catchError(() => createPickerSession("revoked-token"));
    check("Picker API 401 → GoogleReconnectNeeded", err instanceof GoogleReconnectNeeded, String(err));

    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    err = await catchError(() => createPickerSession("token"));
    check("Picker API 500 → plain error, NOT a reconnect", err instanceof Error && !(err instanceof GoogleReconnectNeeded), String(err));
  } finally {
    globalThis.fetch = realFetch;
    await admin.from("google_oauth_tokens").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
