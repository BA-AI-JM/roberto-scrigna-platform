import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";

/**
 * SECURITY NOTE — SESSION COOKIE FLAGS:
 * @supabase/ssr sets the auth cookies. To enforce HttpOnly + Secure + SameSite=Lax
 * on the session cookies in production, configure the Supabase Auth settings in
 * the Supabase dashboard:
 *   Authentication → Settings → Cookie settings
 *     - SameSite: Lax
 *   And ensure your deployment is HTTPS-only (Vercel enforces this by default).
 *
 * The HttpOnly flag prevents JavaScript from reading the session cookie, which
 * is critical for a GDPR health-data platform. @supabase/ssr already sets
 * HttpOnly on the cookies it controls — do not override this.
 *
 * SECURITY HEADERS NOTE:
 * Add the following to next.config.ts headers() to harden the app:
 *   - Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
 *   - X-Frame-Options: DENY
 *   - X-Content-Type-Options: nosniff
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy: camera=(), microphone=(), geolocation=()
 *
 * For a health-data platform under GDPR, frame-busting (X-Frame-Options: DENY)
 * and a restrictive CSP are especially important.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the auth token — this is the whole point of the middleware
  await supabase.auth.getUser();

  // Add security headers to all responses
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  supabaseResponse.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  return supabaseResponse;
}
