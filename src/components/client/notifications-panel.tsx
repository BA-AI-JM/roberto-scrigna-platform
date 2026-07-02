"use client";

/**
 * #2 Stage-2 — per-client notifications panel for the consolidated dashboard.
 * Renders the feed from trpc.notification.getForClient({ clientId, limit: 20 }).
 * Presentational: the page owns the query and passes data + loading/error flags.
 *
 * Styled to match the surrounding (inline-styled) dashboard cards rather than the
 * shadcn Card primitive, so it reads as native to the rest of the client page.
 */

export interface NotificationItem {
  id: string;
  trigger: string;
  priority: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

/** Icon + Italian label per notification trigger (unknown → bell + raw key). */
const TRIGGER_META: Record<string, { icon: string; label: string }> = {
  weight_deviation: { icon: "⚖️", label: "Deviazione peso" },
  feedback_requested: { icon: "📝", label: "Feedback richiesto" },
  plan_expiring: { icon: "⏳", label: "Piano in scadenza" },
  checkin_completed: { icon: "✅", label: "Check-in completato" },
  checkin_overdue: { icon: "⏰", label: "Check-in in ritardo" },
  low_adherence: { icon: "📉", label: "Aderenza bassa" },
  invoice_overdue: { icon: "💸", label: "Fattura scaduta" },
  invoice_paid: { icon: "💰", label: "Fattura pagata" },
  task_due_today: { icon: "📌", label: "Attività in scadenza" },
  task_overdue: { icon: "🔴", label: "Attività scaduta" },
  new_message: { icon: "✉️", label: "Nuovo messaggio" },
  training_logged: { icon: "🏋️", label: "Allenamento registrato" },
  milestone_reached: { icon: "🎯", label: "Traguardo raggiunto" },
  plan_update_suggested: { icon: "📋", label: "Aggiornamento piano suggerito" },
};

export function notificationMeta(trigger: string): { icon: string; label: string } {
  return TRIGGER_META[trigger] ?? { icon: "🔔", label: trigger };
}

/** "oggi" / "ieri" / "N giorni fa" / absolute date for older entries. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  return new Date(iso).toLocaleDateString("it-IT");
}

const SHELL: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  overflow: "hidden",
};

function Header() {
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
        Notifiche
      </h3>
    </div>
  );
}

export function NotificationsPanel({
  notifications,
  isLoading,
  isError,
}: {
  notifications: NotificationItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div style={SHELL}>
      <Header />
      {isLoading ? (
        <div style={{ padding: "20px 24px", color: "#6b7280", fontSize: "14px" }}>
          Caricamento notifiche…
        </div>
      ) : isError ? (
        <div style={{ margin: "16px 24px", padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#991b1b", fontSize: "13px" }}>
          Errore nel caricamento delle notifiche.
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ margin: "20px 24px", padding: "20px 24px", textAlign: "center", color: "#6b7280", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #e2e8f0", fontSize: "13px" }}>
          Nessuna notifica
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {notifications.map((n, i) => {
            const meta = notificationMeta(n.trigger);
            return (
              <li
                key={n.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "14px 24px",
                  borderTop: i > 0 ? "1px solid #f1f5f9" : "none",
                  borderLeft: n.read ? "3px solid transparent" : "3px solid #2563eb",
                  background: n.read ? "#ffffff" : "#f8faff",
                }}
              >
                <span style={{ fontSize: "18px", lineHeight: "20px" }} aria-hidden>
                  {meta.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                    <span style={{ fontSize: "13px", fontWeight: n.read ? 600 : 700, color: "#1a1a2e" }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: "11px", color: "#6b7280", flexShrink: 0 }}>
                      {relTime(n.created_at)}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "1px" }}>{meta.label}</div>
                  {n.body && (
                    <div style={{ fontSize: "13px", color: "#52525b", marginTop: "4px", lineHeight: 1.4 }}>
                      {n.body}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
