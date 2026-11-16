import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase Auth client — the *signed-in-user* side of Supabase, separate from
 * lib/supabase.ts's service-role client (which is the app's data access and bypasses row
 * security). This one uses the public anon/publishable key and the visitor's own session
 * cookies, and is only ever used to ask "who is this?" — sign-in, sign-out, session lookup.
 * It never touches the `items` table.
 *
 * Used from Server Actions, Route Handlers and Server Components (the proxy builds its own,
 * since it works with the raw request/response rather than next/headers).
 */

export function authConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export async function getAuthClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_ANON_KEY is not set — see .env.local.example");
  }

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        // Server Components can't write cookies — that's fine, the proxy (src/proxy.ts)
        // refreshes the session on every request, so a write attempted from a render is
        // just skipped rather than being an error.
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component — ignore, see above.
        }
      },
    },
  });
}
