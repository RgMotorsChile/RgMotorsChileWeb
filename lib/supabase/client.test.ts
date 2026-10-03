import { afterEach, describe, expect, it } from "vitest";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

const ROLE = "SUPABASE_SERVICE_ROLE_KEY";
const ANON = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

describe("createServerSupabase", () => {
  const prevRole = process.env[ROLE];
  const prevAnon = process.env[ANON];

  afterEach(() => {
    if (prevRole === undefined) delete process.env[ROLE];
    else process.env[ROLE] = prevRole;
    if (prevAnon === undefined) delete process.env[ANON];
    else process.env[ANON] = prevAnon;
  });

  it("lanza si falta la service role aunque exista la anon key", () => {
    delete process.env[ROLE];
    process.env[ANON] = "anon-public-key";
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => createServerSupabase()).toThrow("Falta SUPABASE_SERVICE_ROLE_KEY");
  });
});
