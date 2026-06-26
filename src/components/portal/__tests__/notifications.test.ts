/**
 * #27 Stage 2 — patient notifications: feed + header bell badge.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NotificationsFeed, notificationMeta, type PortalNotification } from "../notifications-feed";
import { NotificationBell } from "../notification-bell";

const NOTIFS: PortalNotification[] = [
  { id: "n1", trigger: "weight_deviation", priority: "urgent", title: "Variazione di peso", body: "+2 kg dal target", read: false, created_at: "2026-06-22T10:00:00Z" },
  { id: "n2", trigger: "checkin_completed", priority: "low", title: "Check-in ricevuto", body: null, read: true, created_at: "2026-06-18T10:00:00Z" },
];

describe("notificationMeta", () => {
  test("maps known triggers, falls back for unknown", () => {
    expect(notificationMeta("weight_deviation").label).toBe("Peso");
    expect(notificationMeta("nope")).toEqual({ icon: "🔔", label: "Notifica" });
  });
});

describe("NotificationsFeed render", () => {
  test("renders the feed with titles/bodies and unread emphasis", () => {
    const html = renderToStaticMarkup(createElement(NotificationsFeed, { notifications: NOTIFS, loading: false }));
    expect(html).toContain("Variazione di peso");
    expect(html).toContain("+2 kg dal target");
    expect(html).toContain("Check-in ricevuto");
    expect(html).toContain("3px solid #2563eb"); // unread accent present
  });

  test("renders an empty state", () => {
    const html = renderToStaticMarkup(createElement(NotificationsFeed, { notifications: [], loading: false }));
    expect(html).toContain("Nessuna notifica");
  });
});

describe("NotificationBell", () => {
  test("shows a badge with the unread count and links to the feed", () => {
    const html = renderToStaticMarkup(createElement(NotificationBell, { unreadCount: 3 }));
    expect(html).toContain('href="/portal/notifications"');
    expect(html).toContain(">3<");
  });

  test("caps the badge at 99+", () => {
    const html = renderToStaticMarkup(createElement(NotificationBell, { unreadCount: 250 }));
    expect(html).toContain("99+");
  });

  test("renders no badge when there are no unread", () => {
    const html = renderToStaticMarkup(createElement(NotificationBell, { unreadCount: 0 }));
    expect(html).toContain('href="/portal/notifications"');
    expect(html).not.toContain("#ef4444"); // no red badge
  });
});
