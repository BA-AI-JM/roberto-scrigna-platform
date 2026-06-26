"use client";

/**
 * #27 Stage 2 — home-header notification bell with an unread badge, linking to
 * the patient notifications feed. Count comes from portal.getNotifications
 * (unreadCount), passed in by the home.
 */

import Link from "next/link";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const count = unreadCount > 99 ? "99+" : String(unreadCount);
  return (
    <Link
      href="/portal/notifications"
      aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "40px",
        height: "40px",
        borderRadius: "10px",
        border: "1px solid #e2e8f0",
        background: "#ffffff",
        textDecoration: "none",
        fontSize: "20px",
      }}
    >
      <span aria-hidden>🔔</span>
      {unreadCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            minWidth: "18px",
            height: "18px",
            padding: "0 5px",
            borderRadius: "9px",
            background: "#ef4444",
            color: "#ffffff",
            fontSize: "11px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
