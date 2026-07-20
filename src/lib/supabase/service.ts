/**
 * Supabase service-role client factory.
 * Creates a client with full database access, bypassing Row Level Security.
 *
 * IMPORTANT: Only use server-side. Never expose the service role key to the client.
 * Always apply manual authorization checks after using this client.
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

/**
 * Create a Supabase client using the service role key.
 * Bypasses RLS — caller is responsible for scoping queries by the authenticated entity's ID.
 */
export function createSupabaseServiceRole() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
