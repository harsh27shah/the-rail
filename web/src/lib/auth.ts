import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { authConfigured, getAuthClient } from "./supabase-auth";

/**
 * The one place the app decides who's asking — a thin data-access layer over Supabase Auth,
 * per Next's own authentication guidance: the proxy (src/proxy.ts) does a fast, cookie-only
 * "optimistic" check to bounce signed-out visitors, but real authorization has to happen next
 * to the data, because Server Actions and Route Handlers are public endpoints in their own
 * right and a proxy check on the page in front of them protects nothing.
 *
 * `getUser()` (not `getSession()`/`getClaims()`) on purpose: it asks Supabase's auth server
 * to validate the token rather than trusting the cookie's contents, which is what makes this
 * the *secure* check. Memoised per request with `cache` so a page that calls it from several
 * places only pays for one round trip.
 */

export interface CurrentUser {
  id: string;
  email: string;
  /** True for the app's owner (the only person who can invite others). Read from the account's
   * `app_metadata`, which only the server's service key can write — a signed-in user can't
   * edit it themselves, unlike `user_metadata`. Set with scripts/make-owner.mjs. */
  isOwner: boolean;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!authConfigured()) return null;
  const supabase = await getAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    isOwner: data.user.app_metadata?.role === "owner",
  };
});

/**
 * For pages and Server Actions: the signed-in user, or a redirect to /login.
 *
 * Call this *before* any try/catch in a Server Action — `redirect()` works by throwing, and a
 * surrounding catch-all would swallow it and quietly turn "you're signed out" into a generic
 * error message.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Like requireUser, but only for the owner. Anyone else gets a 404, so the page's existence isn't advertised. */
export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isOwner) notFound();
  return user;
}
