"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { inviteEmail } from "@/lib/invites";

export type InviteState = { message: string; ok: boolean } | null;

export async function inviteAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireOwner(); // before anything else: only the owner may invite
  const result = await inviteEmail(String(formData.get("email") ?? ""));
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath("/invite");
  return {
    ok: true,
    message: result.already
      ? `${result.email} already has an account.`
      : `Invited ${result.email}. Send them the site address; they tap "Continue with Google".`,
  };
}
