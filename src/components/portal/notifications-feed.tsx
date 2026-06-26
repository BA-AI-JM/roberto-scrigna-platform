"use client";

/**
 * #27 Stage 2 — the patient's own notifications feed (portal.getNotifications).
 * Presentational; the page owns the query. Self-contained trigger labels so the
 * portal doesn't depend on the coach-side panel.
 */

export interface PortalNotification {
  id: string;
  trigger: string;
  priority: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

const TRIGGER_META: Record<string, { icon: string; label: string }> = {
  weight_deviation: { icon: "⚖️", label: "Peso" },
  feedback_requested: { icon: "📝", label: "Feedback" },
  plan_expiring: { icon: "⏳", label: "Piano in scadenza" },
  checkin_completed: { icon: "✅", label: "Check-in" },
  checkin_overdue: { icon: "⏰", label: "Check-in" },
  low_adherence: { icon: "📉", label: "Aderenza" },
  new_message: { icon: "✉️", label: "Messaggio" },
  training_logged: { icon: "🏋️", label: "Allenamento" },
  milestone_reached: { icon: "🎯", label: "Traguardo" },
};

export function notificationMeta(trigger: string): { icon: string; label: string } {
  return TRIGGER_META[trigger] ?? { icon: "🔔", label: "Notifica" };
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

export function NotificationsFeed({
  notifications,
  loading,
}: {
  notifications: PortalNotification[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <div style={{ color: "#9ca3af", fontSize: "14px", padding: "20px" }}>Caricamento notifiche…</div>;
  }
  if (!notifications || notifications.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 24px", color: "#9ca3af", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px" }}>
        <div style={{ fontSize: "32px", marginBottom: "8px" }} aria-hidden>🔔</div>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#374151", margin: "0 0 4px" }}>Nessuna notifica</p>
        <p style={{ fontSize: "13px", margin: 0 }}>Le notifiche del tuo coach compariranno qui.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden" }}>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {notifications.map((n, i) => {
          const meta = notificationMeta(n.trigger);
          return (
            <li
              key={n.id}
              style={{
                display: "flex",
                gap: "12px",
                padding: "14px 16px",
                borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
                borderLeft: n.read ? "3px solid transparent" : "3px solid #2563eb",
                background: n.read ? "#ffffff" : "#f8faff",
              }}
            >
              <span style={{ fontSize: "18px", lineHeight: "20px" }} aria-hidden>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                  <span style={{ fontSize: "13px", fontWeight: n.read ? 600 : 700, color: "#1a1a2e" }}>{n.title}</span>
                  <span style={{ fontSize: "11px", color: "#9ca3af", flexShrink: 0 }}>{relTime(n.created_at)}</span>
                </div>
                {n.body && <div style={{ fontSize: "13px", color: "#52525b", marginTop: "4px", lineHeight: 1.4 }}>{n.body}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
