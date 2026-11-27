import { GoogleButton, LoginForm } from "@/components/LoginForm";
import { Landing } from "@/components/Landing";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { authConfigured } from "@/lib/supabase-auth";

/**
 * Signed-out visitors land here (src/proxy.ts sends them), so this is the front page: it
 * explains what The Rail is (components/Landing.tsx) and carries the sign-in controls. The error
 * messages sit right by the first button, where the person just tried to sign in.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ready = authConfigured();

  // Someone who really is signed in has no use for this page. This is the authoritative check (it asks
  // Supabase, not just the cookie), which is why the proxy no longer does this bounce: a cookie that
  // looks valid but was ended on the server would loop between here and the home page.
  if (await getCurrentUser()) redirect("/");

  const signIn = (
    <>
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
      {ready ? (
        <>
          <LoginForm />
          <p className="hint landing-invite">
            Invite-only for now. Use the Google account you were invited with.
          </p>
        </>
      ) : (
        <div className="status err">
          Sign-in isn&rsquo;t set up on this deployment yet (SUPABASE_ANON_KEY is missing).
        </div>
      )}
    </>
  );

  return <Landing signIn={signIn} signInAgain={ready ? <GoogleButton /> : null} />;
}
