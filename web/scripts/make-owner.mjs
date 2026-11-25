// Marks one existing account as the app's owner — the only person who sees the /invite page.
//
// The flag lives in the account's `app_metadata`, which only the server's service key can write
// (a signed-in user can't edit it, unlike `user_metadata`). Safe to re-run.
//
// Run from the web/ directory: node scripts/make-owner.mjs you@example.com
// Requires .env.local to have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/make-owner.mjs <email>");
  process.exit(1);
}

const envPath = path.resolve(import.meta.dirname, "..", ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error.message); process.exit(1); }
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account for ${email}. Create it first with scripts/create-user.mjs.`);
  process.exit(1);
}
const { error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "owner" },
});
if (error) { console.error(error.message); process.exit(1); }
console.log(`${email} is now the owner.`);
