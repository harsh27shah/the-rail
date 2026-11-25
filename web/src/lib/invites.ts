import "server-only";
import { getSupabaseAdmin } from "./supabase";

/**
 * Inviting people (the owner's /invite page). The app is invite-only because every AI call is
 * billed to the owner, and open sign-ups are switched off in Supabase. So an invite is simply
 * "create this person's account ahead of time, for this exact email". When they then tap
 * "Continue with Google" with that same email, Supabase attaches Google to the waiting account.
 * Anyone else, whatever Google account they use, has no account to land in and is turned away.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true; email: string; already: boolean }
  | { ok: false; error: string };

function db() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Database not connected yet — see .env.local.example");
  return admin;
}

export async function inviteEmail(raw: string): Promise<InviteResult> {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return { ok: false, error: "That doesn't look like an email address" };
  }
  const { error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { ok: true, email, already: true };
    console.error("[invite] couldn't create account:", error.message);
    return { ok: false, error: "Couldn't create that account just now, so try again in a moment" };
  }
  return { ok: true, email, already: false };
}

export interface Member {
  email: string;
  joined: string;
  lastSignIn: string | null;
  isOwner: boolean;
}

/** Everyone with an account, newest first. */
export async function listMembers(): Promise<Member[]> {
  const out: Member[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    for (const u of data.users) {
      out.push({
        email: u.email ?? "(no email)",
        joined: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        isOwner: u.app_metadata?.role === "owner",
      });
    }
    if (data.users.length < 200) break;
  }
  return out.sort((a, b) => b.joined.localeCompare(a.joined));
}
