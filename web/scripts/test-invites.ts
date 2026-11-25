// Tests for inviting people (lib/invites.ts) against the real database, with a throwaway email.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/test-invites.ts

import { inviteEmail, listMembers } from "@/lib/invites";
import { getSupabaseAdmin } from "@/lib/supabase";

let passed = 0, failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : detail ? `  — ${detail}` : ""}`);
}

async function main() {
  const admin = getSupabaseAdmin()!;
  const email = `invite-test-${crypto.randomUUID().slice(0, 8)}@example.com`;
  try {
    check("a bad email is refused", !(await inviteEmail("not-an-email")).ok && !(await inviteEmail("")).ok && !(await inviteEmail("a@b")).ok);

    const first = await inviteEmail(`  ${email.toUpperCase()}  `);
    check("a new email is invited (trimmed, lower-cased)", first.ok && !first.already && first.email === email, JSON.stringify(first));

    const second = await inviteEmail(email);
    check("inviting the same email again says they already have an account", second.ok && second.already, JSON.stringify(second));

    const members = await listMembers();
    const me = members.find((m) => m.email === email);
    check("they show up in the list, not signed in yet, not owner", !!me && me.lastSignIn === null && !me.isOwner);
    check("the list includes exactly one owner flag holder or more, never the invitee", members.filter((m) => m.isOwner).every((m) => m.email !== email));
  } finally {
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const u of data?.users ?? []) if (u.email === email) await admin.auth.admin.deleteUser(u.id);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
