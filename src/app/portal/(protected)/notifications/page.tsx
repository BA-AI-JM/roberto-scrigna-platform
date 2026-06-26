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
    <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6">
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1a1a2e", margin: "0 0 16px" }}>Notifiche</h1>
      <NotificationsFeed
        notifications={notifQuery.data?.notifications as PortalNotification[] | undefined}
        loading={notifQuery.isLoading}
      />
    </div>
  );
}
