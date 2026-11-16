"use client";

import { useState } from "react";
import { sendLoginLinkAction } from "@/app/login/actions";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendLoginLinkAction(email);
    setBusy(false);
    if (result.ok) setSent(true);
    else setError(result.error);
  }

  if (sent) {
    return (
      <div>
        <p className="hint" style={{ margin: "0 0 14px" }}>
          If <b>{email.trim()}</b> has an account, a sign-in link is on its way. Open it{" "}
          <b>in this same browser</b>.
        </p>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      {error && <div className="status err">{error}</div>}
      <div className="actions">
        <button type="submit" className="btn" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </div>
    </form>
  );
}
