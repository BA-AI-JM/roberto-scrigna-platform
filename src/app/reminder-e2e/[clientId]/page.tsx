/**
 * E2E harness route for the reminder-settings card — renders the SAME
 * <ReminderSettingsCard> WITHOUT the (dashboard) auth gate, so Playwright can
 * drive its behaviour with mocked tRPC (no test DB / Supabase session). Inert in
 * production: 404 unless NEXT_PUBLIC_E2E_REMINDER === "1" (set only when the
 * local Playwright dev server starts). The real surface is the coach
 * single-client view at /clients/{id}.
 */
import { notFound } from "next/navigation";
import { ReminderSettingsCard } from "@/components/client/reminder-settings-card";

export default async function ReminderE2EPage({ params }: { params: Promise<{ clientId: string }> }) {
  if (process.env.NEXT_PUBLIC_E2E_REMINDER !== "1") notFound();
  const { clientId } = await params;
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "24px" }}>
      <ReminderSettingsCard clientId={clientId} />
    </div>
  );
}
