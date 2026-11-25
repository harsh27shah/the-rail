"use client";

import { useState } from "react";
import { sendLoginLinkAction, signInWithGoogleAction } from "@/app/login/actions";

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none" }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** The "Continue with Google" button on its own, so the landing page can repeat it further down. */
export function GoogleButton() {
  return (
    <form action={signInWithGoogleAction}>
      <div className="actions">
        <button type="submit" className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <GoogleG /> Continue with Google
        </button>
      </div>
    </form>
  );
}

export function LoginForm() {
  const [showEmail, setShowEmail] = useState(false);
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

  return (
    <div>
      <GoogleButton />

      {!showEmail && (
        <p className="hint" style={{ marginTop: 18 }}>
          No Google account?{" "}
          <button type="button" className="btn ghost small" onClick={() => setShowEmail(true)}>
            Use an email link
          </button>
        </p>
      )}

      {showEmail && sent && (
        <div style={{ marginTop: 18 }}>
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
      )}

      {showEmail && !sent && (
        <form onSubmit={submit} style={{ marginTop: 18 }}>
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
            <button type="submit" className="btn ghost" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Email me a link"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
