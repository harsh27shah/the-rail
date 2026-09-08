import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client, using the service-role key (full access, bypasses row
 * security). Safe for now because there is exactly one owner and no untrusted client
 * access — see PROJECT.md §5, "single-owner mode" for the phase-1 plan. Revisit once
 * accounts exist and more than one person's data lives in the same tables.
 *
 * The `server-only` import above makes it a build error to accidentally import this file
 * from a Client Component, so the service-role key can never end up in the browser bundle.
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
