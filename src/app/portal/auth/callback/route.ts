import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";

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
      return NextResponse.redirect(`${origin}/portal/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/portal/login?error=auth_failed`);
}
