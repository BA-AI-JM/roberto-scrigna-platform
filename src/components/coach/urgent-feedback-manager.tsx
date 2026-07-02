"use client";

/**
 * #28 — Coach urgent-feedback / injury management. Surfaces the built-but-unwired
 * feedback.getClientUrgentSubmissions + markAddressed procedures: the coach is
 * alerted via notification, and now can REVIEW a client's urgent notes / injury
 * reports here and MARK them addressed. No real-time chat (SSOT #28, by design).
 */

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc/client";

interface Submission {
  id: string;
  kind: string;
  message: string;
  injury_area?: string | null;
  injury_severity?: string | null;
  injury_onset?: string | null;
  limitations?: string | null;
  status: string;
  created_at: string;
}

const card = "rounded-xl border-[0.5px] border-border bg-card p-5";
const itDateTime = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

function KindBadge({ kind }: { kind: string }) {
  const injury = kind === "injury_report";
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={injury ? { background: "#fbeae7", color: "#9f3a2f" } : { background: "#fbf1e3", color: "#8a560f" }}
    >
      {injury ? "Infortunio" : "Feedback urgente"}
    </span>
  );
}

export function UrgentFeedbackManager({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const query = trpc.feedback.getClientUrgentSubmissions.useQuery({ clientId });
  const markAddressed = trpc.feedback.markAddressed.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.feedback.getClientUrgentSubmissions) }),
  });

  if (query.isLoading) {
    return (
      <div className={card}>
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-16 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (query.error) {
    return <div className={card}><p role="alert" className="text-sm text-[#9f3a2f]">Errore nel caricamento delle segnalazioni.</p></div>;
  }

  const items = (query.data ?? []) as Submission[];
  const open = items.filter((s) => s.status !== "addressed");

  if (items.length === 0) {
    return (
      <div className={`${card} flex items-center gap-3`}>
        <span className="h-2 w-2 rounded-full bg-brand" />
        <p className="text-sm text-muted-foreground">Nessuna segnalazione da questo cliente.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {open.length > 0 ? `${open.length} segnalazione${open.length > 1 ? "i" : ""} da gestire` : "Tutte le segnalazioni sono state gestite."}
      </p>
      {items.map((s) => {
        const addressed = s.status === "addressed";
        return (
          <div key={s.id} className={`${card} ${addressed ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KindBadge kind={s.kind} />
                <span className="text-xs text-muted-foreground tnum">{itDateTime(s.created_at)}</span>
              </div>
              {addressed ? (
                <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-medium text-[#166534]">Gestita ✓</span>
              ) : (
                <span className="rounded-full bg-[#fbf1e3] px-2.5 py-0.5 text-xs font-medium text-[#8a560f]">Da gestire</span>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink">{s.message}</p>

            {s.kind === "injury_report" && (s.injury_area || s.injury_severity || s.injury_onset || s.limitations) && (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
                {s.injury_area && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Zona</dt><dd className="text-ink">{s.injury_area}</dd></div>}
                {s.injury_severity && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Gravità</dt><dd className="text-ink">{s.injury_severity}</dd></div>}
                {s.injury_onset && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Insorgenza</dt><dd className="text-ink">{s.injury_onset}</dd></div>}
                {s.limitations && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Limitazioni</dt><dd className="text-right text-ink">{s.limitations}</dd></div>}
              </dl>
            )}

            {!addressed && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => markAddressed.mutate({ id: s.id })}
                  disabled={markAddressed.isPending && markAddressed.variables?.id === s.id}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-deep disabled:opacity-50"
                >
                  {markAddressed.isPending && markAddressed.variables?.id === s.id ? "Aggiornamento…" : "Segna come gestita"}
                </button>
                {markAddressed.isError && markAddressed.variables?.id === s.id && (
                  <p role="alert" className="mt-2 text-sm text-[#9f3a2f]">Aggiornamento non riuscito. Riprova.</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
