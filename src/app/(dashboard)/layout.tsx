import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseServiceRole } from "@/lib/supabase/service";
import { DashboardShell } from "./dashboard-shell";

/**
 * Dashboard layout — ROLE-GATED to a coach (partner).
 *
 * Session alone is NOT enough (that was the surface-gating gap: a logged-in
 * client could render the coach shell). This mirrors portal/(protected)/layout,
 * which requires an active client row. Resolution is PARTNER-FIRST, consistent
 * with server/trpc.ts createTrpcContext and app/page.tsx — a user holding a
 * partner row is a coach, even if they also hold a client row (dual-identity is
 * supported and deterministically routes to the coach surface).
 *
 * - no session            → /login
 * - partner row           → render coach dashboard (unchanged for real coaches)
 * - no partner, is client → /portal/dashboard (client can no longer see coach chrome)
 * - neither               → /login
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Partner-first: the session client can self-read its own partner row (partner
  // RLS allows self-read — same mechanism tRPC uses).
  const { data: partner } = await supabase
    .from("partner")
    .select("id, full_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!partner) {
    // Not a coach. If they are an ACTIVE client, send them to their own surface;
    // otherwise they hold no role → back to login. Client table has no client
    // RLS, so read it via the service role (as portal/(protected) + tRPC do).
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

  const partnerName = partner.full_name ?? user.email ?? "Coach";
  return <DashboardShell partnerName={partnerName}>{children}</DashboardShell>;
}
