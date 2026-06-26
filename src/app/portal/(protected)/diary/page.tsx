"use client";

/**
 * #27 — "Diario" tab. Stage-2 will wire the native food diary (the
 * getDiaryEntries/addDiaryEntry backend already exists). Stub for now.
 */

import { PortalComingSoon } from "@/components/portal/coming-soon";

export default function PortalDiaryPage() {
  return (
    <PortalComingSoon
      title="Diario alimentare"
      icon="📓"
      description="Presto potrai registrare i tuoi pasti e tenere traccia di quello che mangi, direttamente dal portale."
    />
  );
}
