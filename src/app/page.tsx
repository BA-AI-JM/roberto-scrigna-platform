import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseServiceRole } from "@/lib/supabase/service";

/**
 * Root — role-aware entry. Routes each authenticated user to their own surface
 * instead of unconditionally sending everyone to /dashboard (which rendered the
 * coach shell for logged-in clients). PARTNER-FIRST, consistent with
 * server/trpc.ts and (dashboard)/layout: dual-identity users land coach-side.
 *
 * - no session            → /login
 * - partner row           → /dashboard
 * - no partner, is client → /portal/dashboard
 * - neither               → /login
 */
export default async function HomePage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Partner-first (session client self-reads its own partner row via partner RLS).
  const { data: partner } = await supabase
    .from("partner")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (partner) {
    redirect("/dashboard");
  }

  // Not a coach — active client goes to the portal, otherwise no role → login.
  const serviceDb = createSupabaseServiceRole();
  const { data: client } = await serviceDb
    .from("client")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  redirect(client ? "/portal/dashboard" : "/login");
}
