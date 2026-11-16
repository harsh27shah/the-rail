import { signOutAction } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth";

/** Who's signed in, plus a way out. Renders nothing for a signed-out visitor (the login page). */
export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <form action={signOutAction} className="account">
      <span className="account-email" title={user.email}>
        {user.email}
      </span>
      <button type="submit" className="account-out">
        Sign out
      </button>
    </form>
  );
}
