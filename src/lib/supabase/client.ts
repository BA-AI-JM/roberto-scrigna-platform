/**
 * Supabase browser client factory.
 * Creates a Supabase client for use in client components.
 */

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/env.client";

/**
 * Create a Supabase client for browser-side use.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
