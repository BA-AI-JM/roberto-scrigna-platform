"use client";

/**
 * #28 — patient urgent-feedback + injury-report page. Behind the existing
 * patient auth gate (the (protected) layout) with the bottom nav. Warm,
 * one-thing-at-a-time; SEPARATE from the 3-weekly check-in; NOT a chat.
 */
import { UrgentFeedbackScreen } from "@/components/portal/urgent-feedback-form";

export default function PortalFeedbackPage() {
  return (
    <div className="portal-container">
      <header className="mb-6 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Assistenza</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">Feedback urgente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Segnala un infortunio o qualcosa che non può aspettare il prossimo check-in. Roberto verrà avvisato.
        </p>
      </header>
      <UrgentFeedbackScreen />
    </div>
  );
}
