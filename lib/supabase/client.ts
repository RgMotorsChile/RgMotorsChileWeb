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

let serverClient: SupabaseClient | null = null;
let serverClientKey = "";

/** Tests: el proceso real conserva un solo cliente. */
export function resetServerSupabaseForTests(): void {
  serverClient = null;
  serverClientKey = "";
}

/**
 * Un solo cliente por proceso. Crear uno por firma o por lote abre conexiones
 * de más en el pool de Supabase («Too many connections issued to the database»).
 * Exige service role. No cae a la anon key: en la base compartida anon no puede
 * escribir `catalog_vehicles` (migración 20260930145942).
 */
export function createServerSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  }
  const cacheKey = `${SUPABASE_URL}\n${key}`;
  if (!serverClient || serverClientKey !== cacheKey) {
    serverClient = createClient(SUPABASE_URL, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    serverClientKey = cacheKey;
  }
  return serverClient;
}

/** True solo si el servidor puede usar service role. La anon key es del browser. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
