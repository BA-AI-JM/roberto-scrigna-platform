"use client";

/**
 * #28 — patient urgent-feedback + injury-report page. Behind the existing
 * patient auth gate (the (protected) layout) with the bottom nav. Warm,
 * one-thing-at-a-time; SEPARATE from the 3-weekly check-in; NOT a chat.
 */
import { UrgentFeedbackScreen } from "@/components/portal/urgent-feedback-form";

export default function PortalFeedbackPage() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 6px" }}>Feedback urgente</h1>
      <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 20px", lineHeight: 1.5 }}>
        Segnala un infortunio o qualcosa che non può aspettare il prossimo check-in. Roberto verrà avvisato.
      </p>
      <UrgentFeedbackScreen />
    </div>
  );
}
