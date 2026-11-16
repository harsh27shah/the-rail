// One-off migration: claim every wardrobe item that predates accounts for one user.
//
// Before accounts the app had no concept of an owner, so existing rows have user_id = null.
// Run this once, after that person has an account (scripts/create-user.mjs), to assign all
// of them to it. Only ever touches rows where user_id is still null — it can't reassign
// anything that already belongs to someone — so it's safe to re-run.
//
// Run from the web/ directory: node scripts/assign-existing-items.mjs owner@example.com
// Requires .env.local to have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/assign-existing-items.mjs <email>");
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

// There's no "get user by email" in the admin API, so page through the (small) user list.
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(error.message);
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account for ${email} — create it first with scripts/create-user.mjs.`);
  process.exit(1);
}

const { count: unclaimed, error: countError } = await admin
  .from("items")
  .select("*", { count: "exact", head: true })
  .is("user_id", null);
if (countError) throw new Error(countError.message);
console.log(`${unclaimed} item(s) currently belong to no one.`);
if (!unclaimed) process.exit(0);

const { error } = await admin.from("items").update({ user_id: user.id }).is("user_id", null);
if (error) throw new Error(error.message);
console.log(`Assigned ${unclaimed} item(s) to ${email} (${user.id}).`);
