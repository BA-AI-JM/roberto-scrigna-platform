/**
 * Supabase server-side client factory.
 * Creates authenticated Supabase clients for server components and API routes.
 */

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/env";

/**
 * Create a Supabase client for server-side use.
 * Reads auth cookies from the request to maintain session state.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Cookies can only be set in Server Actions or Route Handlers
          }
        },
      },
    }
  );
}
