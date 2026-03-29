/**
 * Notification settings and notification center page.
 *
 * Shows:
 * - Notification feed (recent notifications with read/unread state)
 * - Settings panel to toggle 12 notification triggers
 * - Email and in-app toggle per trigger
 */

"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationItem {
  id: string;
  trigger: string;
  priority: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  client: { id: string; fullName: string } | null;
}

interface TriggerSetting {
  enabled: boolean;
  email: boolean;
  inApp: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  checkin_overdue: "Check-in scaduto",
  checkin_completed: "Check-in completato",
  weight_deviation: "Deviazione peso",
  low_adherence: "Aderenza bassa",
  plan_expiring: "Piano in scadenza",
  invoice_overdue: "Fattura scaduta",
  invoice_paid: "Fattura pagata",
  task_due_today: "Task in scadenza oggi",
  task_overdue: "Task scaduto",
  new_message: "Nuovo messaggio",
  training_logged: "Allenamento registrato",
  milestone_reached: "Obiettivo raggiunto",
};

const TRIGGER_PRIORITIES: Record<string, string> = {
  checkin_overdue: "high",
  checkin_completed: "low",
  weight_deviation: "high",
  low_adherence: "medium",
  plan_expiring: "medium",
  invoice_overdue: "high",
  invoice_paid: "low",
  task_due_today: "medium",
  task_overdue: "high",
  new_message: "medium",
  training_logged: "low",
  milestone_reached: "low",
};

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "#fef2f2", text: "#991b1b" },
  high: { bg: "#fee2e2", text: "#b91c1c" },
  medium: { bg: "#fef3c7", text: "#92400e" },
  low: { bg: "#f0fdf4", text: "#15803d" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

// ── Page Component ────────────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS: NotificationItem[] = [];

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<"feed" | "settings">("feed");

  // Default settings — all enabled
  const [settings, setSettings] = useState<Record<string, TriggerSetting>>(
    Object.fromEntries(
      Object.keys(TRIGGER_LABELS).map((t) => [t, { enabled: true, email: true, inApp: true }])
    )
  );

  const toggleSetting = (trigger: string, field: keyof TriggerSetting) => {
    setSettings((prev) => ({
      ...prev,
      [trigger]: {
        ...prev[trigger]!,
        [field]: !prev[trigger]![field],
      },
    }));
  };

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1000px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0 }}>Notifiche</h1>
        <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
          Centro notifiche e impostazioni avvisi
        </p>
      </div>

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        {(
          [
            { value: "feed" as const, label: "Notifiche" },
            { value: "settings" as const, label: "Impostazioni" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            style={{
              padding: "10px 16px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeTab === tab.value ? 600 : 400,
              color: activeTab === tab.value ? "#1a1a2e" : "#6b7280",
              borderBottom:
                activeTab === tab.value ? "2px solid #1a1a2e" : "2px solid transparent",
              marginBottom: "-2px",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed view */}
      {activeTab === "feed" && (
        <>
          {MOCK_NOTIFICATIONS.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 24px", color: "#9ca3af" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔔</div>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#374151" }}>
                Nessuna notifica
              </h3>
              <p style={{ fontSize: "14px", marginTop: "8px" }}>
                Le notifiche appariranno qui quando ci saranno aggiornamenti.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {MOCK_NOTIFICATIONS.map((n) => {
                const priorityColor =
                  PRIORITY_COLORS[n.priority] ?? PRIORITY_COLORS.low!;
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: "16px 20px",
                      background: n.read ? "#ffffff" : "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderLeft: `4px solid ${priorityColor.text}`,
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: n.read ? 400 : 600,
                            color: "#1a1a2e",
                            marginBottom: "4px",
                          }}
                        >
                          {n.title}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280" }}>{n.body}</div>
                        {n.client && (
                          <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                            {n.client.fullName}
                          </div>
                        )}
                      </div>
                      <div
                        style={{ fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap", marginLeft: "16px" }}
                      >
                        {formatTimeAgo(n.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Settings view */}
      {activeTab === "settings" && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Trigger", "Priorità", "Attivo", "Email", "In-app"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(TRIGGER_LABELS).map(([trigger, label], idx) => {
                const priority = TRIGGER_PRIORITIES[trigger] ?? "medium";
                const priorityColor = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium!;
                const setting = settings[trigger]!;

                return (
                  <tr
                    key={trigger}
                    style={{
                      borderBottom:
                        idx < Object.keys(TRIGGER_LABELS).length - 1
                          ? "1px solid #f1f5f9"
                          : "none",
                    }}
                  >
                    <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 500, color: "#1a1a2e" }}>
                      {label}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          fontSize: "11px",
                          fontWeight: 600,
                          backgroundColor: priorityColor.bg,
                          color: priorityColor.text,
                          textTransform: "uppercase",
                        }}
                      >
                        {priority}
                      </span>
                    </td>
                    {(["enabled", "email", "inApp"] as const).map((field) => (
                      <td key={field} style={{ padding: "14px 16px" }}>
                        <button
                          onClick={() => toggleSetting(trigger, field)}
                          style={{
                            width: "40px",
                            height: "22px",
                            borderRadius: "11px",
                            border: "none",
                            backgroundColor: setting[field] ? "#1a1a2e" : "#e5e7eb",
                            cursor: "pointer",
                            position: "relative",
                            transition: "background-color 0.2s",
                          }}
                        >
                          <div
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              backgroundColor: "#ffffff",
                              position: "absolute",
                              top: "3px",
                              left: setting[field] ? "21px" : "3px",
                              transition: "left 0.2s",
                            }}
                          />
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
