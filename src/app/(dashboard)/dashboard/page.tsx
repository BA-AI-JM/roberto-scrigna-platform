/**
 * Coach dashboard — T3 Wave A rebuild to the operator-approved concept 1.
 *
 * Composition (calm register, DIRECTION.md): conviction header · three stats ·
 * athlete panel with la nota · severity-tinted "Da gestire" rail from live alerts.
 * The heatmap / revenue / pipeline charts were deliberately removed from this
 * surface (approved "emptier defaults") — their data remains on Monitoraggio and
 * Fatture. Every color is a semantic token: this page is dual-theme by construction.
 * La nota here is COMPOSED FROM REAL NUMBERS only (NORTHSTAR: nothing invented) —
 * Roberto's own authored notes arrive with the coach-notes feature, not as fakery.
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trpc } from "../../../lib/trpc/client";

interface SmartAlert {
  id: string;
  type: "warning" | "danger" | "info" | "success";
  category: string;
  title: string;
  description: string;
  actionUrl: string | null;
  clientName: string | null;
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-secondary ${className}`} />;
}

function StatCard({ label, value, sub, loading }: { label: string; value: string; sub?: string; loading?: boolean }) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-[18px] py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <div className="tnum mt-1 text-[30px] font-medium leading-[1.1] text-ink">
          {value}
          {sub && <span className="ml-1 text-[14px] font-normal text-ink-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  active: { label: "Attivo", cls: "bg-brand-wash text-brand-deep" },
  paused: { label: "In pausa", cls: "bg-amber-wash text-amber" },
  archived: { label: "Archiviato", cls: "bg-secondary text-muted-foreground" },
};

function AlertCard({ alert }: { alert: SmartAlert }) {
  const tone =
    alert.type === "danger"
      ? { box: "bg-red-wash", act: "text-destructive" }
      : alert.type === "warning"
        ? { box: "bg-amber-wash", act: "text-amber" }
        : { box: "border border-border bg-card", act: "text-brand-deep" };
  return (
    <div className={`mb-[11px] rounded-[13px] px-4 py-3.5 ${tone.box}`}>
      <div className="flex items-baseline justify-between gap-2 text-[13.5px] font-medium text-ink">
        <span>{alert.title}</span>
      </div>
      {alert.description && (
        <p className="mb-2 mt-0.5 text-[13px] text-muted-foreground">{alert.description}</p>
      )}
      {alert.actionUrl && (
        <Link href={alert.actionUrl} className={`text-[13px] font-medium ${tone.act}`}>
          Apri →
        </Link>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const overviewQuery = trpc.dashboard.overview.useQuery();
  const alertsQuery = trpc.dashboard.alerts.useQuery();
  const clientsQuery = trpc.client.list.useQuery({ limit: 5, offset: 0 });

  const o = overviewQuery.data;
  const alerts = (alertsQuery.data ?? []) as SmartAlert[];
  const clients = clientsQuery.data?.clients ?? [];

  // Client-only date: server/client locale rendering can differ (hydration).
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

  const euro = (cents: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
      cents / 100,
    );

  // La nota — factual composition from live numbers only.
  const nota =
    o &&
    [
      o.checkins.pending > 0
        ? `${o.checkins.pending} check-in in attesa${o.checkins.flagged > 0 ? `, ${o.checkins.flagged} con variazione peso da rivedere` : ""}`
        : "nessun check-in in attesa",
      o.tasks.overdue > 0 ? `${o.tasks.overdue} attività scadute` : null,
      o.revenue.outstandingCents > 0 ? `${euro(o.revenue.outstandingCents)} da incassare` : null,
    ]
      .filter(Boolean)
      .join(" · ") + ".";

  const anyError = overviewQuery.isError || alertsQuery.isError || clientsQuery.isError;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Main column ── */}
      <div>
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-3">{today}</div>
            <h1 className="text-[40px] tracking-[-0.01em] text-ink">Buongiorno</h1>
            {o && (
              <div className="mt-1.5 text-sm text-ink-3">
                {o.clients.active} atleti attivi · {o.checkins.pending} check-in in attesa
              </div>
            )}
          </div>
          <Link
            href="/plans/generate"
            className="rounded-full bg-brand px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep"
          >
            Nuovo piano
          </Link>
        </div>

        {anyError && (
          <div className="mb-5 rounded-[12px] bg-red-wash px-4 py-3 text-sm text-destructive">
            Errore nel caricamento di alcuni dati. Ricarica la pagina o riprova tra poco.
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <StatCard
            label="Atleti attivi"
            value={String(o?.clients.active ?? "—")}
            sub={o ? `su ${o.clients.total}` : undefined}
            loading={overviewQuery.isLoading}
          />
          <StatCard
            label="Check-in in attesa"
            value={String(o?.checkins.pending ?? "—")}
            sub={o && o.checkins.flagged > 0 ? `${o.checkins.flagged} segnalati` : undefined}
            loading={overviewQuery.isLoading}
          />
          <StatCard
            label="Fatturato mese"
            value={o ? euro(o.revenue.thisMonthCents) : "—"}
            loading={overviewQuery.isLoading}
          />
        </div>

        {/* Athletes panel */}
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="flex items-center justify-between border-b border-line-2 px-[22px] py-[15px]">
            <h3 className="text-[16px] text-ink">Atleti</h3>
            <Link href="/clients" className="text-[13px] text-brand-deep">
              Tutti →
            </Link>
          </div>

          {clientsQuery.isLoading ? (
            <div className="space-y-3 p-[22px]">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : clients.length === 0 ? (
            <div className="px-[22px] py-12 text-center">
              <h2 className="text-[22px] text-ink">Benvenuto nel tuo studio digitale</h2>
              <p className="mx-auto mt-2 max-w-[42ch] text-sm text-muted-foreground">
                Inizia dal primo atleta: il modulo di intake crea la scheda e la prima misurazione insieme.
              </p>
              <Link
                href="/plans/new"
                className="mt-5 inline-block rounded-full bg-brand px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-deep"
              >
                Aggiungi il primo atleta
              </Link>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line-2 text-left">
                    <th className="px-[22px] py-[11px] text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                      Atleta
                    </th>
                    <th className="px-[22px] py-[11px] text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
                      Stato
                    </th>
                    <th className="px-[22px] py-[11px]" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const chip = STATUS_CHIP[c.status as string] ?? STATUS_CHIP.active!;
                    return (
                      <tr key={c.id} className="border-b border-line-2 last:border-b-0">
                        <td className="px-[22px] py-[14px]">
                          <div className="font-medium text-ink">{c.full_name}</div>
                          {Array.isArray(c.tags) && c.tags.length > 0 && (
                            <div className="text-[12.5px] text-ink-3">{(c.tags as string[]).join(" · ")}</div>
                          )}
                        </td>
                        <td className="px-[22px] py-[14px]">
                          <span className={`whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12px] font-medium ${chip.cls}`}>
                            {chip.label}
                          </span>
                        </td>
                        <td className="px-[22px] py-[14px] text-right">
                          <Link href={`/clients/${c.id}`} className="text-[13px] font-medium text-brand-deep">
                            Apri →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {nota && clients.length > 0 && (
            <div className="flex gap-3.5 border-t border-line-2 px-[22px] py-4">
              <div className="w-[3px] flex-none rounded-full bg-brand" aria-hidden />
              <p className="font-display max-w-[64ch] text-[15px] font-medium italic leading-[1.55] text-muted-foreground">
                {nota.charAt(0).toUpperCase() + nota.slice(1)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── "Da gestire" rail ── */}
      <aside>
        <div className="mb-3.5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-3">
          Da gestire{alerts.length > 0 ? ` · ${alerts.length}` : ""}
        </div>
        {alertsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-[13px] border border-border bg-card px-4 py-5 text-sm text-muted-foreground">
            Tutto in ordine — nessuna azione richiesta.
          </div>
        ) : (
          alerts.map((a) => <AlertCard key={a.id} alert={a} />)
        )}
      </aside>
    </div>
  );
}
