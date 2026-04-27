/**
 * Client edit page — /clients/[id]/edit
 *
 * Pre-populated form for updating client profile data and adding
 * a new snapshot (measurements). On success redirects to /clients/[id].
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProfileForm {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female" | "";
  notes: string;
  tags: string; // comma-separated
  status: "active" | "paused" | "archived";
}

interface SnapshotForm {
  weightKg: string;
  waist: string;
  hips: string;
  chest: string;
  armR: string;
  armL: string;
  thighR: string;
  thighL: string;
  abdomen: string;
  dailySteps: string;
}

// ── Form field components ──────────────────────────────────────────────────────

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#374151",
          display: "block",
          marginBottom: "6px",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  backgroundColor: "#ffffff",
  cursor: "pointer",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClientEditPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    sex: "",
    notes: "",
    tags: "",
    status: "active",
  });

  const [snapshotForm, setSnapshotForm] = useState<SnapshotForm>({
    weightKg: "",
    waist: "",
    hips: "",
    chest: "",
    armR: "",
    armL: "",
    thighR: "",
    thighL: "",
    abdomen: "",
    dailySteps: "",
  });

  const [addSnapshot, setAddSnapshot] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError } = trpc.client.getById.useQuery({ id: clientId });

  // Pre-populate form when data loads
  useEffect(() => {
    if (!data?.client) return;
    const c = data.client;
    setProfileForm({
      fullName: c.full_name ?? "",
      email: (c.email as string) ?? "",
      phone: (c.phone as string) ?? "",
      dateOfBirth: (c.date_of_birth as string) ?? "",
      sex: (c.sex as "male" | "female") ?? "",
      notes: (c.notes as string) ?? "",
      tags: ((c.tags as string[]) ?? []).join(", "),
      status: (c.status as "active" | "paused" | "archived") ?? "active",
    });
  }, [data]);

  const updateMutation = trpc.client.update.useMutation();
  const createSnapshotMutation = trpc.client.createSnapshot.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    try {
      // 1. Update profile
      await updateMutation.mutateAsync({
        id: clientId,
        fullName: profileForm.fullName,
        email: profileForm.email || undefined,
        phone: profileForm.phone || undefined,
        dateOfBirth: profileForm.dateOfBirth || undefined,
        sex: profileForm.sex || undefined,
        notes: profileForm.notes || undefined,
        tags: profileForm.tags
          ? profileForm.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        status: profileForm.status,
      });

      // 2. Optionally create a new snapshot — only if at least weight is provided
      if (addSnapshot) {
        const weightKg = snapshotForm.weightKg ? parseFloat(snapshotForm.weightKg) : undefined;
        const hasSnapshotData = snapshotForm.weightKg !== "" && snapshotForm.weightKg !== undefined;

        if (hasSnapshotData) {
          const circumferences: Record<string, number | undefined> = {};
          if (snapshotForm.waist) circumferences.waist = parseFloat(snapshotForm.waist);
          if (snapshotForm.hips) circumferences.hips = parseFloat(snapshotForm.hips);
          if (snapshotForm.chest) circumferences.chest = parseFloat(snapshotForm.chest);
          if (snapshotForm.armR) circumferences.arm_r = parseFloat(snapshotForm.armR);
          if (snapshotForm.armL) circumferences.arm_l = parseFloat(snapshotForm.armL);
          if (snapshotForm.thighR) circumferences.thigh_r = parseFloat(snapshotForm.thighR);
          if (snapshotForm.thighL) circumferences.thigh_l = parseFloat(snapshotForm.thighL);
          if (snapshotForm.abdomen) circumferences.abdomen = parseFloat(snapshotForm.abdomen);

          const hasCircumferences = Object.keys(circumferences).length > 0;

          await createSnapshotMutation.mutateAsync({
            clientId,
            weightKg,
            circumferences: hasCircumferences ? circumferences : undefined,
            lifestyle: snapshotForm.dailySteps
              ? { daily_steps: parseFloat(snapshotForm.dailySteps) }
              : undefined,
          });
        }
      }

      router.push(`/clients/${clientId}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Errore nel salvataggio. Riprova.";
      setSaveError(message);
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          padding: "32px",
          maxWidth: "800px",
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
          maxWidth: "800px",
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <Link href={`/clients/${clientId}`} style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}>
          ← Torna al cliente
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

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "800px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Back link */}
      <Link
        href={`/clients/${clientId}`}
        style={{
          fontSize: "14px",
          color: "#6b7280",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        ← Torna al cliente
      </Link>

      {/* Header */}
      <div style={{ marginTop: "20px", marginBottom: "28px" }}>
        <h1 style={{ fontSize: "26px", fontWeight: 700, margin: 0, color: "#1a1a2e" }}>
          Modifica cliente
        </h1>
        <p style={{ color: "#6b7280", marginTop: "4px", fontSize: "14px" }}>
          {data.client.full_name}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Profile section */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", marginBottom: "20px", marginTop: 0 }}>
            Dati anagrafici
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <FormField label="Nome completo *">
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                required
                style={inputStyle}
                placeholder="Mario Rossi"
              />
            </FormField>

            <FormField label="Email">
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle}
                placeholder="mario@example.com"
              />
            </FormField>

            <FormField label="Telefono">
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                style={inputStyle}
                placeholder="+39 333 1234567"
              />
            </FormField>

            <FormField label="Data di nascita">
              <input
                type="date"
                value={profileForm.dateOfBirth}
                onChange={(e) => setProfileForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Sesso">
              <select
                value={profileForm.sex}
                onChange={(e) => setProfileForm((f) => ({ ...f, sex: e.target.value as "male" | "female" | "" }))}
                style={selectStyle}
              >
                <option value="">Non specificato</option>
                <option value="male">Uomo</option>
                <option value="female">Donna</option>
              </select>
            </FormField>

            <FormField label="Stato">
              <select
                value={profileForm.status}
                onChange={(e) =>
                  setProfileForm((f) => ({
                    ...f,
                    status: e.target.value as "active" | "paused" | "archived",
                  }))
                }
                style={selectStyle}
              >
                <option value="active">Attivo</option>
                <option value="paused">In pausa</option>
                <option value="archived">Archiviato</option>
              </select>
            </FormField>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <FormField label="Tag (separati da virgola)">
              <input
                type="text"
                value={profileForm.tags}
                onChange={(e) => setProfileForm((f) => ({ ...f, tags: e.target.value }))}
                style={inputStyle}
                placeholder="es. dimagrimento, postpartum, atleta"
              />
            </FormField>
          </div>

          <FormField label="Note">
            <textarea
              value={profileForm.notes}
              onChange={(e) => setProfileForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: "100px",
              }}
              placeholder="Note aggiuntive sul cliente..."
            />
          </FormField>
        </div>

        {/* New snapshot toggle */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: addSnapshot ? "20px" : 0,
            }}
          >
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
                Nuova misurazione
              </h2>
              <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>
                Aggiungi un nuovo snapshot con le misurazioni aggiornate
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddSnapshot((v) => !v)}
              style={{
                padding: "8px 16px",
                backgroundColor: addSnapshot ? "#f3f4f6" : "#1a1a2e",
                color: addSnapshot ? "#374151" : "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {addSnapshot ? "Annulla misurazione" : "+ Aggiungi misurazione"}
            </button>
          </div>

          {addSnapshot && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <FormField label="Peso (kg)">
                  <input
                    type="number"
                    step="0.1"
                    value={snapshotForm.weightKg}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, weightKg: e.target.value }))}
                    style={inputStyle}
                    placeholder="es. 72.5"
                  />
                </FormField>
                <FormField label="Passi al giorno">
                  <input
                    type="number"
                    value={snapshotForm.dailySteps}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, dailySteps: e.target.value }))}
                    style={inputStyle}
                    placeholder="es. 8000"
                  />
                </FormField>
              </div>

              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "12px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                Circonferenze (cm) — opzionali
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <FormField label="Vita">
                  <input type="number" step="0.1" value={snapshotForm.waist}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, waist: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Fianchi">
                  <input type="number" step="0.1" value={snapshotForm.hips}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, hips: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Petto">
                  <input type="number" step="0.1" value={snapshotForm.chest}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, chest: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Braccio destro">
                  <input type="number" step="0.1" value={snapshotForm.armR}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, armR: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Braccio sinistro">
                  <input type="number" step="0.1" value={snapshotForm.armL}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, armL: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Coscia destra">
                  <input type="number" step="0.1" value={snapshotForm.thighR}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, thighR: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Coscia sinistra">
                  <input type="number" step="0.1" value={snapshotForm.thighL}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, thighL: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
                <FormField label="Addome">
                  <input type="number" step="0.1" value={snapshotForm.abdomen}
                    onChange={(e) => setSnapshotForm((f) => ({ ...f, abdomen: e.target.value }))}
                    style={inputStyle} placeholder="cm" />
                </FormField>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {saveError && (
          <div
            style={{
              marginBottom: "16px",
              padding: "14px 18px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              color: "#991b1b",
              fontSize: "14px",
            }}
          >
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <Link
            href={`/clients/${clientId}`}
            style={{
              padding: "11px 22px",
              backgroundColor: "#ffffff",
              color: "#374151",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Annulla
          </Link>
          <button
            type="submit"
            disabled={saving || !profileForm.fullName}
            style={{
              padding: "11px 22px",
              backgroundColor: saving ? "#6b7280" : "#1a1a2e",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: !profileForm.fullName ? 0.6 : 1,
            }}
          >
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </form>
    </div>
  );
}
