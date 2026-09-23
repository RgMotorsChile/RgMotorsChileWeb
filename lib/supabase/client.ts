import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://tuybpizjeszgwtcvunmp.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

/** Tenant slug canónico de este sitio. */
export const RG_MOTORS_TENANT_SLUG = "rg-motors";

export function createBrowserSupabase(): SupabaseClient {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/** Server: prefer service role para sync/migraciones; si no, anon. */
export function createServerSupabase(): SupabaseClient {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY),
  );
}
