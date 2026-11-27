// A signed-in-looking browser whose session was ended on the server must land on the login page, not
// loop between "/" and "/login" (ERR_TOO_MANY_REDIRECTS). Also: signing out on one device must not
// end the person's other sessions.
//
// Creates a throwaway account in the real Supabase project, signs it in (the same way a real sign-in
// ends up: a session cookie), cancels the session on the server, then visits the RUNNING app with that
// cookie and follows the redirects. Needs the app running locally. Cleans the account up afterwards.
//   npx tsx --env-file=.env.local scripts/test-dead-session.ts            (app on http://localhost:3000)
//   APP=http://localhost:3000 npx tsx --env-file=.env.local scripts/test-dead-session.ts

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const APP = process.env.APP ?? "http://localhost:3000";
const url = process.env.SUPABASE_URL!, anon = process.env.SUPABASE_ANON_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, service, { auth: { persistSession: false } });

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

/** Signs the user in and returns the cookie header a browser would send, plus the access token. */
async function signIn(email: string) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link) throw new Error(`couldn't make a sign-in link: ${linkError?.message}`);
  const jar = new Map<string, string>();
  const sb = createServerClient(url, anon, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) },
  });
  const { error } = await sb.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error) throw new Error(`couldn't sign in: ${error.message}`);
  const { data } = await sb.auth.getSession();
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), token: data.session!.access_token, sb };
}

/** Follows redirects by hand so a loop shows up as a count, not a browser error. */
async function visit(path: string, cookie: string, maxHops = 6) {
  let location = APP + path, hops = 0;
  const trail: string[] = [];
  for (;;) {
    const res = await fetch(location, { redirect: "manual", headers: { cookie } });
    trail.push(`${res.status} ${new URL(location).pathname}`);
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      if (++hops > maxHops) return { status: res.status, hops, looped: true, trail, finalPath: new URL(location).pathname };
      location = new URL(next, location).toString();
      continue;
    }
    return { status: res.status, hops, looped: false, trail, finalPath: new URL(location).pathname };
  }
}

async function main() {
  const email = `dead-session-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw new Error(`couldn't create the test account: ${error?.message}`);
  const userId = created.user.id;

  try {
    const a = await signIn(email);

    console.log("\nA healthy session");
    const home = await visit("/", a.cookie);
    check("signed in: the home page loads", home.status === 200 && home.finalPath === "/", home.trail.join(" > "));
    const login = await visit("/login", a.cookie);
    check("signed in: visiting /login goes on to the home page", login.finalPath === "/" && login.status === 200 && !login.looped, login.trail.join(" > "));

    console.log("\nA session cancelled on the server (the cookie still looks valid)");
    const { error: revokeError } = await admin.auth.admin.signOut(a.token, "global");
    check("the session was cancelled", !revokeError, revokeError?.message);
    const { error: stillOk } = await admin.auth.getUser(a.token);
    check("…and the server now refuses it", !!stillOk);

    const home2 = await visit("/", a.cookie);
    check("opening the home page does NOT loop", !home2.looped, home2.trail.join(" > "));
    check("…it ends on the login page", home2.finalPath === "/login" && home2.status === 200, home2.trail.join(" > "));
    const login2 = await visit("/login", a.cookie);
    check("opening /login does NOT loop and shows the login page", !login2.looped && login2.finalPath === "/login" && login2.status === 200, login2.trail.join(" > "));
    const item = await visit("/add", a.cookie);
    check("another page (Add) also ends on the login page, no loop", !item.looped && item.finalPath === "/login" && item.status === 200, item.trail.join(" > "));

    console.log("\nSigning out on one device");
    const phone = await signIn(email);
    const laptop = await signIn(email);
    check("two sessions for the same person are both valid", !(await admin.auth.getUser(phone.token)).error && !(await admin.auth.getUser(laptop.token)).error);
    // What the app's sign-out does (src/app/login/actions.ts): end THIS device's session only.
    await phone.sb.auth.signOut({ scope: "local" });
    check("signing out on the phone ends the phone's session", !!(await admin.auth.getUser(phone.token)).error);
    check("…and leaves the laptop's session alone", !(await admin.auth.getUser(laptop.token)).error);
    const actions = fs.readFileSync(path.resolve(import.meta.dirname, "..", "src/app/login/actions.ts"), "utf8");
    check("the app's sign-out button really asks for 'this device only'", /signOut\(\{\s*scope:\s*"local"\s*\}\)/.test(actions));
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
