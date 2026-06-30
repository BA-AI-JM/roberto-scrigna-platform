/**
 * E2E harness route for the urgent-feedback screen — renders the SAME
 * <UrgentFeedbackScreen> under the portal layout's TRPCProvider WITHOUT the
 * (protected) auth gate, so Playwright can drive its behaviour with mocked tRPC
 * (no test DB / Supabase session). Inert in production: 404 unless
 * NEXT_PUBLIC_E2E_FEEDBACK === "1" (set only when the local Playwright dev server
 * starts). The real surface is /portal/feedback under the auth gate.
 */
import { notFound } from "next/navigation";
import { UrgentFeedbackScreen } from "@/components/portal/urgent-feedback-form";

export default function FeedbackE2EPage() {
  if (process.env.NEXT_PUBLIC_E2E_FEEDBACK !== "1") notFound();
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <UrgentFeedbackScreen />
    </div>
  );
}
