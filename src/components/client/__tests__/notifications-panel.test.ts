/**
 * #2 Stage-2 — NotificationsPanel (per-client feed from notification.getForClient).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  NotificationsPanel,
  notificationMeta,
  type NotificationItem,
} from "../notifications-panel";

const NOTIFS: NotificationItem[] = [
  {
    id: "n1",
    trigger: "weight_deviation",
    priority: "urgent",
    title: "Deviazione di peso rilevata",
    body: "+2.4 kg rispetto al target",
    read: false,
    created_at: "2026-06-25T10:00:00Z",
  },
  {
    id: "n2",
    trigger: "checkin_completed",
    priority: "low",
    title: "Check-in completato",
    body: null,
    read: true,
    created_at: "2026-06-20T10:00:00Z",
  },
];

function render(props: Partial<Parameters<typeof NotificationsPanel>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(NotificationsPanel, {
      notifications: NOTIFS,
      isLoading: false,
      isError: false,
      ...props,
    })
  );
}

describe("notificationMeta", () => {
  test("maps known triggers to an Italian label + icon, unknown falls back", () => {
    expect(notificationMeta("weight_deviation").label).toBe("Deviazione peso");
    expect(notificationMeta("feedback_requested").label).toBe("Feedback richiesto");
    expect(notificationMeta("totally_unknown")).toEqual({ icon: "🔔", label: "totally_unknown" });
  });
});

describe("NotificationsPanel", () => {
  test("renders the feed with titles, bodies, and trigger labels", () => {
    const html = render();
    expect(html).toContain("Notifiche");
    expect(html).toContain("Deviazione di peso rilevata");
    expect(html).toContain("+2.4 kg rispetto al target");
    expect(html).toContain("Deviazione peso"); // trigger label
    expect(html).toContain("Check-in completato");
  });

  test("emphasises unread items (left accent) vs read", () => {
    const html = render();
    expect(html).toContain("3px solid #2563eb"); // unread accent present
  });

  test("renders the empty state when there are no notifications", () => {
    expect(render({ notifications: [] })).toContain("Nessuna notifica");
  });

  test("renders loading + error states", () => {
    expect(render({ isLoading: true })).toContain("Caricamento notifiche");
    expect(render({ isError: true })).toContain("Errore nel caricamento");
  });
});
