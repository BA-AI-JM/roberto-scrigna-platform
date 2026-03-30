import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

/**
 * Dashboard layout — requires authenticated partner.
 * Redirects to /login if no session.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get partner record for the sidebar
  let partnerName = "Roberto Scrigna";
  if (user) {
    const { data: partner } = await supabase
      .from("partner")
      .select("id, full_name, email")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    partnerName = partner?.full_name ?? user.email ?? "Coach";
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar partnerName={partnerName} />
      <main className="flex-1 overflow-y-auto bg-zinc-50 p-8">{children}</main>
    </div>
  );
}
