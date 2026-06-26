/**
 * Portal protected layout.
 *
 * Auth guard for all routes under /portal/(protected)/*.
 * Verifies the user has an authenticated Supabase session AND a client record.
 * Redirects to /portal/login if either check fails.
 *
 * This layout intentionally does NOT wrap /portal/login or /portal/auth/callback.
 */

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseServiceRole } from "@/lib/supabase/service";
import { Toaster } from "@/components/ui/sonner";
import PortalBottomNav from "@/components/portal/portal-bottom-nav";

export default async function PortalProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  // Verify the authenticated user has a client record (not a partner)
  const db = createSupabaseServiceRole();
  const { data: client } = await db
    .from("client")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!client || client.status !== "active") {
    // User exists in Supabase Auth but is not a registered or active client
    redirect("/portal/login");
  }

  return (
    <>
      {/* Bottom-nav clearance (the fixed nav is ~64px + safe-area). */}
      <div style={{ paddingBottom: "80px" }}>{children}</div>
      <PortalBottomNav />
      <Toaster position="top-center" />
    </>
  );
}
