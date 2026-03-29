import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Auth callback handler.
 * Exchanges the auth code from email confirmation for a session,
 * then redirects to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // On first login, create the partner record if it doesn't exist
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from("partner")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!existing) {
          await supabase.from("partner").insert({
            auth_user_id: user.id,
            full_name: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Coach",
            email: user.email ?? "",
          });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
