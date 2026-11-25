import { LoginForm } from "@/components/LoginForm";
import { authConfigured } from "@/lib/supabase-auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="form-page">
      <h1>Sign in</h1>
      <p className="hint">
        The Rail is invite-only for now. Sign in with the Google account you were invited with.
      </p>
      {error === "link" && (
        <div className="status err">
          That link didn&rsquo;t work — it may have expired, or been opened in a different
          browser than you asked from. Request a new one and open it in this browser.
        </div>
      )}
      {error === "invite" && (
        <div className="status err">
          That Google account hasn&rsquo;t been invited yet. Ask for an invite, then try again
          with the same account.
        </div>
      )}
      {error === "google" && (
        <div className="status err">
          Couldn&rsquo;t reach Google just now. Try again, or use an email link below.
        </div>
      )}
      {authConfigured() ? (
        <LoginForm />
      ) : (
        <div className="status err">
          Sign-in isn&rsquo;t set up on this deployment yet (SUPABASE_ANON_KEY is missing).
        </div>
      )}
    </div>
  );
}
