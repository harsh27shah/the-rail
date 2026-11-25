"use client";

import { useActionState } from "react";
import { inviteAction, type InviteState } from "@/app/invite/actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAction, null);
  return (
    <form action={action}>
      <label htmlFor="invite-email">Their Google email</label>
      <input
        id="invite-email"
        name="email"
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="friend@gmail.com"
        required
      />
      {state && <div className={state.ok ? "status" : "status err"}>{state.message}</div>}
      <div className="actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Inviting…" : "Invite"}
        </button>
      </div>
    </form>
  );
}
