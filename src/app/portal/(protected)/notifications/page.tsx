"use client";

/**
 * #27 Stage 2 — "Notifiche" view: the patient's own notification feed
 * (portal.getNotifications). Reached from the home header bell.
 */

import { trpc } from "@/lib/trpc/client";
import { NotificationsFeed, type PortalNotification } from "@/components/portal/notifications-feed";

export default function PortalNotificationsPage() {
  const notifQuery = trpc.portal.getNotifications.useQuery(undefined, { staleTime: 30_000 });

  return (
    <div className="portal-container">
      <header className="mb-6 lg:mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-deep">Il tuo percorso</p>
        <h1 className="text-2xl font-medium tracking-tight text-ink lg:text-3xl">Notifiche</h1>
      </header>
      <NotificationsFeed
        notifications={notifQuery.data?.notifications as PortalNotification[] | undefined}
        loading={notifQuery.isLoading}
      />
    </div>
  );
}
