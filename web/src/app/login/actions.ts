"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthClient } from "@/lib/supabase-auth";

/**
 * Sign-in is a magic link emailed to the owner. (A typed 6-digit code would be nicer on a
 * phone — a link can open in a different browser than the one the owner started in — but
 * Supabase only lets you put the code in the email once you've connected your own email
 * sender, and the default template carries just the link. Worth revisiting with custom SMTP.)
 *
 * Invite-only: `shouldCreateUser: false` here, plus open sign-ups switched off in the
 * Supabase dashboard — every key in this app is billed to the owner, so anyone who stumbled
 * on the URL must not be able to create an account and spend it.
 */

export type SendLinkResult = { ok: true } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendLoginLinkAction(email: string): Promise<SendLinkResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(clean)) return { ok: false, error: "Enter a valid email address" };

  // The link has to come back to whichever deployment the request was made on.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return { ok: false, error: "Couldn't work out where to send you back to" };

  try {
    const supabase = await getAuthClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: false, emailRedirectTo: `${proto}://${host}/auth/callback` },
    });
    if (error) {
      // An email with no account gets the *same* response as one with an account — this form
      // shouldn't double as a way to find out who has one.
      if (error.code === "otp_disabled" || /signups not allowed/i.test(error.message)) {
        return { ok: true };
      }
      if (error.code === "over_email_send_rate_limit" || error.status === 429) {
        return { ok: false, error: "Too many emails requested — wait a little and try again" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't send a link right now" };
  }
}

export async function signOutAction() {
  const supabase = await getAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
