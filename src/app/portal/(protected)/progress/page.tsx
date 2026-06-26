"use client";

/**
 * #27 — "Progressi" tab. Stage-2 will add body composition + progress photos.
 * Weight trends currently live on the home; this is a stub for now.
 */

import { PortalComingSoon } from "@/components/portal/coming-soon";

export default function PortalProgressPage() {
  return (
    <PortalComingSoon
      title="Progressi"
      icon="📈"
      description="Presto qui troverai la composizione corporea, le misurazioni e le foto dei progressi. Per ora trovi l'andamento del peso nella Home."
    />
  );
}
