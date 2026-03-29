/**
 * Supabase browser client factory.
 * Creates a Supabase client for use in client components.
 */

import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for browser-side use.
 */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
