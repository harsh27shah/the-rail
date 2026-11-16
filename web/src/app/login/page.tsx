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
        The Rail is invite-only for now. Enter the email you were invited with and
        we&rsquo;ll send you a sign-in link.
      </p>
      {error === "link" && (
        <div className="status err">
          That link didn&rsquo;t work — it may have expired, or been opened in a different
          browser than you asked from. Request a new one and open it in this browser.
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
