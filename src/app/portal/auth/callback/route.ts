import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { isSafePortalPath, PORTAL_NEXT_COOKIE } from "../../../../lib/portal/next-path";

/**
 * Portal auth callback handler.
 * Exchanges the magic-link code for a client session,
 * then redirects to the portal dashboard.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // A4 (#14): deep-link set by the login page (delivery-email flow).
      // Validated again here — the cookie is client-writable.
      const rawNext = req.cookies.get(PORTAL_NEXT_COOKIE)?.value;
      // Guarded decode: the cookie is client-writable, and a malformed % would
      // throw AFTER the one-shot code exchange succeeded (500 on a logged-in
      // user). Malformed → ignore, land on the dashboard, clear the cookie.
      let decoded: string | null = null;
      try {
        decoded = rawNext ? decodeURIComponent(rawNext) : null;
      } catch {
        decoded = null;
      }
      const target = isSafePortalPath(decoded) ? decoded : "/portal/dashboard";
      const res = NextResponse.redirect(`${origin}${target}`);
      res.cookies.set(PORTAL_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/portal/login?error=auth_failed`);
}
