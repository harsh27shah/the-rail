// Invite someone: creates their account so they can sign in with Google (the same email address) or an emailed link.
//
// The app is invite-only (open sign-ups are switched off in the Supabase dashboard, because
// every AI key is billed to the owner) — so this is how a person gets in. Safe to re-run for
// an email that already exists.
//
// Run from the web/ directory: node scripts/create-user.mjs friend@example.com
// Requires .env.local to have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: node scripts/create-user.mjs <email>");
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

const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
if (error) {
  if (/already|registered|exists/i.test(error.message)) {
    console.log(`${email} already has an account — nothing to do.`);
    process.exit(0);
  }
  console.error("Couldn't create that account:", error.message);
  process.exit(1);
}
console.log(`Created ${email} (${data.user.id}). They can sign in at the app with an emailed code.`);
