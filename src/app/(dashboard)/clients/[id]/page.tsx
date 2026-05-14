/**
 * Client detail page — /clients/[id]
 *
 * Displays:
 * - Header: name, status badge, email, phone, actions
 * - Tab sections: Panoramica, Cronologia Snapshot, Piani, Check-in
 * - Back link to /clients
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { ClientPhotoGallery } from "@/components/client-photo-gallery";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  paused: "In pausa",
  archived: "Archiviato",
};

const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "Sedentario",
  light: "Leggermente attivo",
  moderate: "Moderatamente attivo",
  heavy: "Molto attivo",
  very_heavy: "Estremamente attivo",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "#dcfce7", text: "#166534" },
  paused: { bg: "#fef3c7", text: "#92400e" },
  archived: { bg: "#f3f4f6", text: "#6b7280" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.archived!;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "13px",
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Sub-sections ───────────────────────────────────────────────────────────────

// ── Snapshot type (matches listSnapshots select) ───────────────────────────────

type SnapshotRow = {
  id: string;
  taken_at: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  body_fat_pct: number | null;
  body_fat_method: string | null;
  lean_mass_kg: number | null;
  fat_mass_kg: number | null;
  daily_steps: number | null;
  bmr_kcal: number | null;
};

// ── Weight trend helper ────────────────────────────────────────────────────────

function WeightTrend({ snapshots }: { snapshots: SnapshotRow[] }) {
  // snapshots are ordered DESC (newest first) — reverse for chronological display
  const withWeight = snapshots.filter((s) => s.weight_kg != null);

  if (withWeight.length === 0) return null;

  if (withWeight.length === 1) {
    return (
      <div
        style={{
          marginTop: "16px",
          padding: "14px 18px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "10px",
          fontSize: "13px",
          color: "#6b7280",
        }}
      >
        <span style={{ fontWeight: 600, color: "#374151" }}>Trend peso: </span>
        Prima misurazione — trend disponibile dal prossimo check-in.
      </div>
    );
  }

  // Take last 5 in chronological order (oldest → newest)
  const last5 = withWeight.slice(0, 5).reverse();
  const first = last5[0]!.weight_kg!;
  const last = last5[last5.length - 1]!.weight_kg!;
  const delta = last - first;
  const deltaStr =
    delta === 0
      ? "0.0"
      : delta > 0
      ? `+${delta.toFixed(1)}`
      : delta.toFixed(1);
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  const arrowColor = delta < 0 ? "#16a34a" : delta > 0 ? "#dc2626" : "#6b7280";

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "14px 18px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        fontSize: "13px",
        color: "#374151",
      }}
    >
      <span style={{ fontWeight: 600, color: "#374151" }}>Trend peso: </span>
      {last5.map((s, i) => (
        <span key={s.id}>
          {s.weight_kg}
          {i < last5.length - 1 && (
            <span style={{ color: "#9ca3af", margin: "0 4px" }}>→</span>
          )}
        </span>
      ))}
      <span style={{ marginLeft: "10px", fontWeight: 700, color: arrowColor }}>
        {arrow} {Math.abs(delta).toFixed(1)} kg
      </span>
      <span style={{ color: "#9ca3af", marginLeft: "4px" }}>({deltaStr} kg)</span>
    </div>
  );
}

// ── PanoramicaTab ──────────────────────────────────────────────────────────────

function PanoramicaTab({
  snapshot,
  clientId,
}: {
  snapshot: Record<string, unknown> | null;
  clientId: string;
}) {
  const { data: snapshots = [] } = trpc.client.listSnapshots.useQuery(
    { clientId },
    { staleTime: 60_000 }
  );

  if (!snapshot) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
        <p style={{ fontSize: "14px" }}>Nessuna misurazione disponibile per questo cliente.</p>
      </div>
    );
  }

  const rows: Array<{ label: string; value: string }> = [];

  if (snapshot.weight_kg != null)
    rows.push({ label: "Peso", value: `${snapshot.weight_kg} kg` });
  if (snapshot.height_cm != null)
    rows.push({ label: "Altezza", value: `${snapshot.height_cm} cm` });
  if (snapshot.age_years != null)
    rows.push({ label: "Età", value: `${snapshot.age_years} anni` });
  if (snapshot.daily_steps != null)
    rows.push({ label: "Passi al giorno", value: `${snapshot.daily_steps}` });
  if (snapshot.occupational_level != null) {
    const rawLevel = String(snapshot.occupational_level);
    rows.push({
      label: "Livello occupazionale",
      value: ACTIVITY_LABELS[rawLevel] ?? rawLevel,
    });
  }

  const skinfoldData = snapshot.skinfold_data as Record<string, unknown> | null;
  if (skinfoldData?.bodyFatPctOverride != null)
    rows.push({ label: "Grasso corporeo", value: `${skinfoldData.bodyFatPctOverride}%` });

  if (snapshot.taken_at != null)
    rows.push({ label: "Data misurazione", value: formatDateTime(snapshot.taken_at as string) });

  return (
    <div>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Ultima misurazione
          </h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0" }}>
          {rows.map(({ label, value }, i) => (
            <div
              key={label}
              style={{
                padding: "16px 24px",
                borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                borderRight: (i + 1) % 3 !== 0 ? "1px solid #f1f5f9" : "none",
              }}
            >
              <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>{label}</div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#1a1a2e" }}>{value}</div>
            </div>
          ))}
        </div>
        {snapshot.notes != null && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #f1f5f9",
              fontSize: "13px",
              color: "#6b7280",
            }}
          >
            <span style={{ fontWeight: 600, color: "#374151" }}>Note: </span>
            {String(snapshot.notes)}
          </div>
        )}
      </div>

      <WeightTrend snapshots={snapshots as SnapshotRow[]} />

      <PhotoSection clientId={clientId} />
    </div>
  );
}

function PhotoSection({ clientId }: { clientId: string }) {
  const { data: session } = trpc.auth.getSession.useQuery();
  const partnerId = (session as { id?: string } | null | undefined)?.id;
  if (!partnerId) return null;
  return (
    <div
      style={{
        marginTop: "20px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          Foto cliente
        </h3>
      </div>
      <div style={{ padding: "20px 24px" }}>
        <ClientPhotoGallery clientId={clientId} partnerId={partnerId} />
      </div>
    </div>
  );
}

function PianiTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = trpc.plan.list.useQuery({ clientId, limit: 20 });
  const plans = data?.plans ?? [];

  if (isLoading)
    return <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>Caricamento piani...</div>;

  if (isError)
    return (
      <div style={{ padding: "16px", background: "#fef2f2", borderRadius: "8px", color: "#991b1b", fontSize: "14px" }}>
        Errore nel caricamento dei piani.
      </div>
    );

  if (plans.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📄</div>
        <p style={{ fontSize: "14px" }}>Nessun piano per questo cliente.</p>
        <Link
          href={`/plans/generate?clientId=${clientId}`}
          style={{
            display: "inline-block",
            marginTop: "12px",
            padding: "9px 18px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Genera piano
        </Link>
      </div>
    );
  }

  const PLAN_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    draft: { bg: "#f3f4f6", text: "#6b7280" },
    active: { bg: "#dcfce7", text: "#166534" },
    completed: { bg: "#dbeafe", text: "#1d4ed8" },
    archived: { bg: "#f3f4f6", text: "#9ca3af" },
  };
  const PLAN_STATUS_LABELS: Record<string, string> = {
    draft: "Bozza",
    active: "Attivo",
    completed: "Completato",
    archived: "Archiviato",
  };

  return (
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
            {["Nome piano", "Stato", "Creato il", ""].map((h) => (
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
          {plans.map((plan, idx) => {
            const c = PLAN_STATUS_COLORS[plan.status] ?? PLAN_STATUS_COLORS.draft!;
            return (
              <tr
                key={plan.id}
                style={{
                  borderBottom: idx < plans.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                  {plan.name}
                  {plan.weeklyAvgKcal > 0 && (
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: "8px", fontSize: "13px" }}>
                      ~{Math.round(plan.weeklyAvgKcal)} kcal/giorno
                    </span>
                  )}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      backgroundColor: c.bg,
                      color: c.text,
                    }}
                  >
                    {PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                  </span>
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                  {formatDate(plan.createdAt)}
                </td>
                <td style={{ padding: "14px 16px", textAlign: "right" }}>
                  <Link
                    href={`/plans/${plan.id}/review`}
                    style={{
                      fontSize: "13px",
                      color: "#1a1a2e",
                      fontWeight: 500,
                      padding: "6px 12px",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      textDecoration: "none",
                    }}
                  >
                    Apri →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CheckinTab({ clientId }: { clientId: string }) {
  const { data, isLoading, isError } = trpc.checkin.list.useQuery({
    clientId,
    limit: 20,
    offset: 0,
  });
  const checkins = data?.checkins ?? [];

  const [sentCheckinUrl, setSentCheckinUrl] = useState<string | null>(null);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  const sendCheckinMutation = trpc.checkin.sendCheckin.useMutation({
    onSuccess: (result) => {
      const appUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : (process.env.NEXT_PUBLIC_APP_URL ?? "");
      setSentCheckinUrl(`${appUrl}/portal/checkin/${result.token}`);
    },
  });

  const handleCopyLink = () => {
    if (!sentCheckinUrl) return;
    navigator.clipboard.writeText(sentCheckinUrl).then(() => {
      setCopyConfirmed(true);
      setTimeout(() => setCopyConfirmed(false), 2000);
    });
  };

  if (isLoading)
    return <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>Caricamento check-in...</div>;

  if (isError)
    return (
      <div style={{ padding: "16px", background: "#fef2f2", borderRadius: "8px", color: "#991b1b", fontSize: "14px" }}>
        Errore nel caricamento dei check-in.
      </div>
    );

  const SendCheckinPanel = (
    <div style={{ marginBottom: "20px" }}>
      {/* Send button */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={() => {
            setSentCheckinUrl(null);
            setCopyConfirmed(false);
            sendCheckinMutation.mutate({ clientId });
          }}
          disabled={sendCheckinMutation.isPending}
          style={{
            padding: "9px 20px",
            backgroundColor: sendCheckinMutation.isPending ? "#6b7280" : "#1a1a2e",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: sendCheckinMutation.isPending ? "not-allowed" : "pointer",
          }}
        >
          {sendCheckinMutation.isPending ? "Invio in corso..." : "Invia Check-in"}
        </button>

        {sendCheckinMutation.isError && (
          <span style={{ fontSize: "13px", color: "#991b1b" }}>
            {sendCheckinMutation.error?.message ?? "Errore nell'invio."}
          </span>
        )}
      </div>

      {/* Success: show URL + copy button */}
      {sentCheckinUrl && (
        <div
          style={{
            marginTop: "14px",
            padding: "14px 16px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "10px",
          }}
        >
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#15803d", margin: "0 0 8px" }}>
            Link inviato al cliente
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <code
              style={{
                fontSize: "12px",
                color: "#374151",
                background: "#ffffff",
                padding: "6px 10px",
                borderRadius: "6px",
                border: "1px solid #d1fae5",
                wordBreak: "break-all",
                flex: 1,
              }}
            >
              {sentCheckinUrl}
            </code>
            <button
              onClick={handleCopyLink}
              style={{
                padding: "6px 14px",
                backgroundColor: copyConfirmed ? "#15803d" : "#ffffff",
                color: copyConfirmed ? "#ffffff" : "#15803d",
                border: "1px solid #15803d",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {copyConfirmed ? "Copiato!" : "Copia link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (checkins.length === 0) {
    return (
      <div>
        {SendCheckinPanel}
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "#9ca3af",
            background: "#f8fafc",
            borderRadius: "12px",
            border: "1px dashed #e2e8f0",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📊</div>
          <p style={{ fontSize: "14px" }}>Nessun check-in registrato per questo cliente.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {SendCheckinPanel}
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
            {["Data", "Peso", "Energia", "Sonno", "Aderenza", "Stato"].map((h) => (
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
          {checkins.map((ci, idx) => {
            const checkinData = ci as Record<string, unknown>;
            return (
              <tr
                key={String(checkinData.id)}
                style={{
                  borderBottom: idx < checkins.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#6b7280" }}>
                  {formatDate(checkinData.completed_at as string ?? checkinData.created_at as string)}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", fontWeight: 600, color: "#1a1a2e" }}>
                  {checkinData.weight_kg != null ? `${checkinData.weight_kg} kg` : "—"}
                  {checkinData.weight_flagged === true && (
                    <span style={{ marginLeft: "6px", color: "#ef4444", fontSize: "12px" }}>⚠</span>
                  )}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.energy_level != null ? `${checkinData.energy_level}/10` : "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.sleep_quality != null ? `${checkinData.sleep_quality}/10` : "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                  {checkinData.adherence_pct != null ? `${checkinData.adherence_pct}%` : "—"}
                </td>
                <td style={{ padding: "14px 16px", fontSize: "13px", color: "#6b7280" }}>
                  {String(checkinData.status ?? "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type ActiveTab = "panoramica" | "snapshot" | "piani" | "checkin";

const TABS: Array<{ value: ActiveTab; label: string }> = [
  { value: "panoramica", label: "Panoramica" },
  { value: "snapshot", label: "Cronologia Snapshot" },
  { value: "piani", label: "Piani" },
  { value: "checkin", label: "Check-in" },
];

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  // Guard: /clients/new is a create route, not a client ID
  if (clientId === "new") {
    router.replace("/plans/new");
    return null;
  }
  const [activeTab, setActiveTab] = useState<ActiveTab>("panoramica");
  const [archiving, setArchiving] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading, isError } = trpc.client.getById.useQuery({ id: clientId });
  const archiveMutation = trpc.client.archive.useMutation({
    onSuccess: () => {
      router.push("/clients");
    },
    onError: () => {
      setArchiving(false);
    },
  });

  const inviteMutation = trpc.client.sendPortalInvite.useMutation({
    onSuccess: (res) => {
      setInviteMsg({ ok: true, text: `Invito inviato a ${res.sentTo}.` });
    },
    onError: (err) => {
      setInviteMsg({ ok: false, text: err.message ?? "Errore nell'invio dell'invito." });
    },
  });

  const handleArchive = async () => {
    if (!confirm("Sei sicuro di voler archiviare questo cliente?")) return;
    setArchiving(true);
    archiveMutation.mutate({ id: clientId });
  };

  const handleInvite = () => {
    setInviteMsg(null);
    inviteMutation.mutate({ clientId });
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: "32px",
          maxWidth: "1100px",
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#9ca3af",
          textAlign: "center",
          paddingTop: "80px",
        }}
      >
        Caricamento cliente...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        style={{
          padding: "32px",
          maxWidth: "1100px",
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <Link
          href="/clients"
          style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}
        >
          ← Torna ai Clienti
        </Link>
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#991b1b",
            fontSize: "14px",
          }}
        >
          Cliente non trovato o errore nel caricamento.
        </div>
      </div>
    );
  }

  const { client, latestSnapshot } = data;

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1100px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Back link */}
      <Link
        href="/clients"
        style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        ← Torna ai Clienti
      </Link>

      {/* Client header */}
      <div
        style={{
          marginTop: "20px",
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
              {client.full_name}
            </h1>
            <StatusBadge status={client.status} />
          </div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {client.email && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                ✉ {client.email}
              </span>
            )}
            {client.phone && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                📞 {client.phone}
              </span>
            )}
            {client.date_of_birth && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                🎂 {formatDate(client.date_of_birth)}
              </span>
            )}
            {client.sex && (
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                {client.sex === "male" ? "Uomo" : "Donna"}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap" }}>
          <Link
            href={`/clients/${clientId}/edit`}
            style={{
              padding: "9px 18px",
              backgroundColor: "#ffffff",
              color: "#1a1a2e",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Modifica
          </Link>
          <Link
            href={`/plans/generate?clientId=${clientId}`}
            style={{
              padding: "9px 18px",
              backgroundColor: "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Genera Piano
          </Link>
          {client.status !== "archived" && (
            <button
              onClick={handleInvite}
              disabled={inviteMutation.isPending || !client.email}
              title={
                client.email
                  ? "Invia al cliente un'email con l'accesso al portale"
                  : "Aggiungi un'email al cliente per poterlo invitare"
              }
              style={{
                padding: "9px 18px",
                backgroundColor: "#ffffff",
                color: client.email ? "#1a1a2e" : "#9ca3af",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor:
                  inviteMutation.isPending || !client.email ? "not-allowed" : "pointer",
              }}
            >
              {inviteMutation.isPending ? "Invio…" : "Invita al portale"}
            </button>
          )}
          {client.status !== "archived" && (
            <button
              onClick={handleArchive}
              disabled={archiving}
              style={{
                padding: "9px 18px",
                backgroundColor: "#ffffff",
                color: "#ef4444",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: archiving ? "not-allowed" : "pointer",
                opacity: archiving ? 0.6 : 1,
              }}
            >
              Archivia
            </button>
          )}
        </div>
      </div>

      {/* Portal invite result */}
      {inviteMsg && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            background: inviteMsg.ok ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${inviteMsg.ok ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: "8px",
            fontSize: "13px",
            color: inviteMsg.ok ? "#166534" : "#991b1b",
          }}
        >
          {inviteMsg.text}
        </div>
      )}

      {/* Notes strip if present */}
      {client.notes && (
        <div
          style={{
            marginBottom: "24px",
            padding: "14px 18px",
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#92400e",
          }}
        >
          <span style={{ fontWeight: 600 }}>Note: </span>
          {client.notes}
        </div>
      )}

      {/* Tags */}
      {client.tags && (client.tags as string[]).length > 0 && (
        <div style={{ marginBottom: "24px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {(client.tags as string[]).map((tag: string) => (
            <span
              key={tag}
              style={{
                padding: "3px 10px",
                background: "#f3f4f6",
                borderRadius: "12px",
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: 500,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Tab nav */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "2px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        {TABS.map((tab) => (
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

      {/* Tab content */}
      {activeTab === "panoramica" && (
        <PanoramicaTab
          snapshot={latestSnapshot as Record<string, unknown> | null}
          clientId={clientId}
        />
      )}

      {activeTab === "snapshot" && (
        <SnapshotHistoryTab clientId={clientId} />
      )}

      {activeTab === "piani" && <PianiTab clientId={clientId} />}

      {activeTab === "checkin" && <CheckinTab clientId={clientId} />}
    </div>
  );
}

// ── Snapshot history tab ───────────────────────────────────────────────────────

function SnapshotHistoryTab({ clientId }: { clientId: string }) {
  const { data: snapshots = [], isLoading, isError } =
    trpc.client.listSnapshots.useQuery({ clientId });

  if (isLoading)
    return (
      <div style={{ padding: "24px", color: "#9ca3af", fontSize: "14px" }}>
        Caricamento cronologia...
      </div>
    );

  if (isError)
    return (
      <div
        style={{
          padding: "16px",
          background: "#fef2f2",
          borderRadius: "8px",
          color: "#991b1b",
          fontSize: "14px",
        }}
      >
        Errore nel caricamento degli snapshot.
      </div>
    );

  if (snapshots.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "48px 24px",
          color: "#9ca3af",
          background: "#f8fafc",
          borderRadius: "12px",
          border: "1px dashed #e2e8f0",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>📏</div>
        <p style={{ fontSize: "14px" }}>Nessuna misurazione registrata.</p>
        <Link
          href={`/clients/${clientId}/edit`}
          style={{
            display: "inline-block",
            marginTop: "12px",
            padding: "9px 18px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Nuova misurazione
        </Link>
      </div>
    );
  }

  // snapshots are ordered DESC — delta = current weight minus next-older entry
  const weightDeltas = new Map<string, number | null>();
  for (let i = 0; i < snapshots.length; i++) {
    const curr = snapshots[i]!;
    const prev = snapshots[i + 1]; // older (index+1 because DESC order)
    if (curr.weight_kg != null && prev?.weight_kg != null) {
      weightDeltas.set(curr.id, curr.weight_kg - prev.weight_kg);
    } else {
      weightDeltas.set(curr.id, null);
    }
  }

  const COL_HEADERS = [
    "Data",
    "Peso (kg)",
    "Grasso (%)",
    "Massa magra (kg)",
    "BMR",
    "Passi",
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
          Cronologia misurazioni ({snapshots.length})
        </h3>
        <Link
          href={`/clients/${clientId}/edit`}
          style={{
            padding: "8px 16px",
            backgroundColor: "#1a1a2e",
            color: "#fff",
            borderRadius: "8px",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          + Nuova misurazione
        </Link>
      </div>

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
              {COL_HEADERS.map((h) => (
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
            {(snapshots as SnapshotRow[]).map((snap, idx) => {
              const delta = weightDeltas.get(snap.id) ?? null;
              const isLast = idx === snapshots.length - 1;

              return (
                <tr
                  key={snap.id}
                  style={{
                    borderBottom: !isLast ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  {/* Data */}
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      color: "#6b7280",
                    }}
                  >
                    {formatDate(snap.taken_at)}
                  </td>

                  {/* Peso + delta */}
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#1a1a2e",
                    }}
                  >
                    {snap.weight_kg != null ? `${snap.weight_kg}` : "—"}
                    {delta != null && (
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "12px",
                          fontWeight: 500,
                          color:
                            delta < 0
                              ? "#16a34a"
                              : delta > 0
                              ? "#dc2626"
                              : "#9ca3af",
                        }}
                      >
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </span>
                    )}
                  </td>

                  {/* Grasso % */}
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.body_fat_pct != null ? `${snap.body_fat_pct}%` : "—"}
                  </td>

                  {/* Massa magra */}
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.lean_mass_kg != null ? `${snap.lean_mass_kg}` : "—"}
                  </td>

                  {/* BMR */}
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.bmr_kcal != null
                      ? `${Math.round(snap.bmr_kcal)} kcal`
                      : "—"}
                  </td>

                  {/* Passi */}
                  <td style={{ padding: "14px 16px", fontSize: "14px", color: "#374151" }}>
                    {snap.daily_steps != null
                      ? snap.daily_steps.toLocaleString("it-IT")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
