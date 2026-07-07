/**
 * Inngest background functions for the Roberto Scrigna platform.
 *
 * Implements the 12 notification triggers from the build plan (Part 3):
 * N1  Plan delivered → immediate email
 * N2  Plan not viewed → 48h email
 * N3  Plan still not viewed → 7d email + task
 * N4  Check-in due → email link on date
 * N5  Check-in overdue → 5d after N4, escalates after 2nd
 * N6  Invoice sent → immediate email + PDF
 * N7  Invoice overdue → 7d past due (daily scan)
 * N8  Invoice escalation → 14d past due + task (daily scan)
 * N9  Client going cold → 14d silence → task (daily scan)
 * N10 Plan expiring → 7d before → email + task (daily scan)
 * N11 New message → immediate email
 * N12 Weight alert → on check-in → urgent task
 */

import { inngest } from "./client";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRole } from "../supabase/service";
import { ensurePortalAuthUser } from "../../services/portal-auth";
import { sendEmail as sendResendEmail } from "../resend/client";
import { FEEDBACK_CATCH_DAYS } from "../../server/plan-versioning";
import { scanPlanUpdateHeuristicsCore } from "../../server/plan-update-heuristics";
import {
  resolveReminderSettings,
  checkInReminderDue,
  bodyCompReminderDue,
  type ReminderSettings,
} from "../../server/reminder-due";

// ── Supabase service-role client for background jobs ────────────────────────

function getServiceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Helper: per-client reminder settings (Build #07) ────────────────────────
// Service-role read; returns resolved defaults when a client has no row (so
// existing clients keep today's behaviour: check-in every 21 days, body-comp off).
async function loadReminderSettings(
  db: ReturnType<typeof getServiceDb>,
  clientId: string
): Promise<ReminderSettings> {
  const { data } = await db
    .from("client_reminder_settings")
    .select("check_in_every_days, body_comp_every_days, reminders_enabled")
    .eq("client_id", clientId)
    .maybeSingle();
  return resolveReminderSettings(data);
}

// ── Helper: send email via Resend ───────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  // Delegate to the hardened wrapper and let failures THROW so the Inngest step
  // fails (retries / shows a failed run) instead of silently succeeding (#1).
  await sendResendEmail({ to, subject, html });
}

// ── Helper: fetch client email from DB ─────────────────────────────────────

async function getClientEmail(clientId: string): Promise<string | null> {
  const db = getServiceDb();
  const { data } = await db
    .from("client")
    .select("email")
    .eq("id", clientId)
    .single();
  return data?.email ?? null;
}

// ── Helper: portal base URL ─────────────────────────────────────────────────

function portalUrl(path = ""): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://app.robertoscrigna.it";
  return `${base}/portal${path}`;
}

// ── Email Templates ─────────────────────────────────────────────────────────

function emailWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:24px 32px;">
              <p style="margin:0;font-size:13px;color:#6b7280;">Roberto Scrigna — Nutrizione Sportiva</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#d1d5db;text-align:center;">
                Roberto Scrigna — Nutrizione Sportiva · Portale Clienti
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btnHtml(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 28px;background:#1a1a2e;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;margin-top:20px;">${label}</a>`;
}

// ── Helper: create notification ─────────────────────────────────────────────

const TRIGGER_PRIORITY: Record<string, string> = {
  checkin_overdue: "high",
  checkin_completed: "low",
  weight_deviation: "urgent",
  low_adherence: "medium",
  plan_expiring: "medium",
  invoice_overdue: "high",
  invoice_paid: "low",
  task_due_today: "medium",
  task_overdue: "high",
  new_message: "medium",
  training_logged: "low",
  milestone_reached: "low",
  feedback_requested: "medium",
  plan_update_suggested: "medium",
};

export async function createNotification(params: {
  partnerId: string;
  clientId?: string;
  trigger: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getServiceDb();
  const { error } = await db.from("notification").insert({
    partner_id: params.partnerId,
    client_id: params.clientId ?? null,
    trigger: params.trigger,
    priority: TRIGGER_PRIORITY[params.trigger] ?? "medium",
    title: params.title,
    body: params.body,
    metadata: params.metadata ?? {},
    read: false,
  });
  // Throw so the Inngest step FAILS (retries / shows a failed run) instead of
  // silently succeeding while the coach never gets the alert (#2, mirrors sendEmail).
  if (error) {
    throw new Error(
      `createNotification insert failed (trigger=${params.trigger}): ${error.message}`
    );
  }
}

export async function createTask(params: {
  partnerId: string;
  clientId?: string;
  title: string;
  description: string;
  priority: string;
  dueDate?: string;
}) {
  const db = getServiceDb();
  const { error } = await db.from("task").insert({
    partner_id: params.partnerId,
    client_id: params.clientId ?? null,
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: "todo",
    due_date: params.dueDate ?? null,
  });
  // Throw so the Inngest step FAILS (retries / shows a failed run) instead of
  // silently succeeding while the follow-up task is never created (#2).
  if (error) {
    throw new Error(`createTask insert failed (${params.title}): ${error.message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventData = Record<string, any>;

// ── N1/N2/N3: Plan Delivered → Not Viewed Chain ─────────────────────────────

export const onPlanDelivered = inngest.createFunction(
  { id: "plan-delivered", retries: 3, triggers: [{ event: "plan/delivered" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { planId, clientId, clientName, partnerId } = d;

    await step.run("notify-plan-delivered", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "plan_expiring",
        title: `Piano consegnato a ${clientName}`,
        body: `Il piano nutrizionale è stato consegnato con successo.`,
        metadata: { planId },
      });
    });

    // N1: Email the client — piano pronto
    await step.run("email-plan-delivered", async () => {
      const email = await getClientEmail(clientId);
      if (email) {
        // Provision the portal auth account before emailing the link (#1) so
        // the client can actually sign in from the access link.
        await ensurePortalAuthUser(createSupabaseServiceRole(), {
          clientId,
          email,
        });
        const html = emailWrapper(
          "Il tuo piano nutrizionale è pronto",
          `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Il tuo piano nutrizionale è pronto!</h2>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${clientName},<br/>
  il tuo piano nutrizionale personalizzato è stato preparato ed è ora disponibile nel portale.
</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
  Accedi all'area clienti per visualizzare i tuoi pasti, gli obiettivi giornalieri e il protocollo integratori.
</p>
${btnHtml(portalUrl("/login"), "Visualizza il piano")}`
        );
        await sendEmail(email, "Il tuo piano nutrizionale è pronto!", html);
      }
    });

    // N2: Follow-up if not viewed in 48h
    await step.sleep("wait-48h", "48h");

    await step.run("check-plan-viewed-48h", async () => {
      const db = getServiceDb();
      const { data: plan } = await db
        .from("plan")
        .select("id, status")
        .eq("id", planId)
        .single();

      if (plan && plan.status === "delivered") {
        await createNotification({
          partnerId,
          clientId,
          trigger: "plan_expiring",
          title: `${clientName} non ha visualizzato il piano`,
          body: `Il piano consegnato 48 ore fa non è ancora stato aperto.`,
          metadata: { planId, reminder: "48h" },
        });
      }
    });

    // N3: 7d escalation
    await step.sleep("wait-5d-more", "5d");

    await step.run("escalate-plan-not-viewed", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "plan_expiring",
        title: `⚠️ ${clientName} — piano non visualizzato da 7 giorni`,
        body: `Il piano non è stato visualizzato. Contattare il cliente.`,
        metadata: { planId, reminder: "7d", escalated: true },
      });

      await createTask({
        partnerId,
        clientId,
        title: `Contattare ${clientName} — piano non visualizzato`,
        description: `Il piano consegnato 7 giorni fa non è stato aperto. Follow-up necessario.`,
        priority: "high",
      });
    });
  }
);

// ── N4/N5: Check-in Due / Overdue ───────────────────────────────────────────

export const onCheckinDue = inngest.createFunction(
  { id: "checkin-due", retries: 3, triggers: [{ event: "checkin/due" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { checkinId, clientId, clientName, partnerId, dueDate } = d;

    // N4: Notify on due date + send email to client with check-in link
    await step.run("notify-checkin-due", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "checkin_overdue",
        title: `Check-in previsto per ${clientName}`,
        body: `Il check-in di ${clientName} è previsto per oggi.`,
        metadata: { checkinId, dueDate },
      });
    });

    await step.run("email-checkin-due", async () => {
      const db = getServiceDb();
      // Tokens live on the check_in row itself (check_in.token column).
      // The check_in_token table does not exist — token storage is on check_in.
      const { data: checkinRow } = await db
        .from("check_in")
        .select("token")
        .eq("id", checkinId)
        .eq("status", "pending")
        .maybeSingle();

      const email = await getClientEmail(clientId);
      if (email) {
        const checkinLink = checkinRow?.token
          ? portalUrl(`/checkin/${checkinRow.token}`)
          : portalUrl("/dashboard");

        const html = emailWrapper(
          "È il momento del check-in settimanale",
          `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">È il momento del check-in!</h2>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${clientName},<br/>
  è arrivato il momento del tuo check-in settimanale. Registra il tuo peso e le tue sensazioni per aiutare il tuo coach a ottimizzare il piano.
</p>
<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
  Il link è valido per 7 giorni.
</p>
${btnHtml(checkinLink, "Inizia il check-in")}`
        );
        await sendEmail(email, "È il momento del check-in settimanale", html);
      }
    });

    // N5: Wait 5 days, then check if completed
    await step.sleep("wait-5d", "5d");

    const isCompleted = await step.run("check-if-completed", async () => {
      const db = getServiceDb();
      const { data } = await db
        .from("check_in")
        .select("status")
        .eq("id", checkinId)
        .single();
      return data?.status === "completed" || data?.status === "reviewed";
    });

    if (!isCompleted) {
      await step.run("notify-checkin-overdue", async () => {
        await createNotification({
          partnerId,
          clientId,
          trigger: "checkin_overdue",
          title: `⚠️ Check-in scaduto — ${clientName}`,
          body: `Il check-in è scaduto da 5 giorni. Nessuna risposta ricevuta.`,
          metadata: { checkinId, overdueDays: 5 },
        });
      });

      // Second escalation after 10 days total
      await step.sleep("wait-5d-more", "5d");

      const stillPending = await step.run("check-if-still-pending", async () => {
        const db = getServiceDb();
        const { data } = await db
          .from("check_in")
          .select("status")
          .eq("id", checkinId)
          .single();
        return data?.status === "pending";
      });

      if (stillPending) {
        await step.run("escalate-checkin-overdue", async () => {
          await createNotification({
            partnerId,
            clientId,
            trigger: "checkin_overdue",
            title: `🚨 Check-in non completato — ${clientName}`,
            body: `Secondo sollecito: il check-in è scaduto da 10 giorni.`,
            metadata: { checkinId, overdueDays: 10, escalated: true },
          });

          await createTask({
            partnerId,
            clientId,
            title: `Follow-up check-in mancato — ${clientName}`,
            description: `Il check-in è scaduto da 10 giorni. Contattare il cliente direttamente.`,
            priority: "high",
          });
        });
      }
    }
  }
);

// ── N6: Invoice Sent ────────────────────────────────────────────────────────

export const onInvoiceSent = inngest.createFunction(
  { id: "invoice-sent", retries: 3, triggers: [{ event: "invoice/sent" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { invoiceId, clientId, clientName, partnerId, amountEur, dueDate } = d;

    await step.run("notify-invoice-sent", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "invoice_paid",
        title: `Fattura inviata a ${clientName}`,
        body: `Fattura di €${Number(amountEur).toFixed(2)} inviata. Scadenza: ${dueDate}.`,
        metadata: { invoiceId, amountEur },
      });
    });

    // N6: Email the client with invoice details
    await step.run("email-invoice-sent", async () => {
      const email = await getClientEmail(clientId);
      if (email) {
        // Fetch invoice number from DB for a precise reference
        const db = getServiceDb();
        const { data: invoice } = await db
          .from("invoice")
          .select("invoice_number, amount_cents")
          .eq("id", invoiceId)
          .single();

        const invoiceNumber = invoice?.invoice_number ?? invoiceId;
        const amount =
          invoice?.amount_cents != null
            ? (invoice.amount_cents / 100).toFixed(2)
            : Number(amountEur).toFixed(2);

        const html = emailWrapper(
          "Nuova fattura disponibile",
          `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Nuova fattura disponibile</h2>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${clientName},<br/>
  è disponibile una nuova fattura per i servizi di consulenza nutrizionale.
</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:4px;">
  <tr style="background:#f8fafc;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">Numero fattura</td>
    <td style="padding:12px 16px;font-size:13px;color:#1a1a2e;font-weight:700;text-align:right;">${invoiceNumber}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">Importo</td>
    <td style="padding:12px 16px;font-size:14px;color:#1a1a2e;font-weight:700;text-align:right;">€ ${amount}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:12px 16px;font-size:13px;color:#6b7280;font-weight:600;">Scadenza</td>
    <td style="padding:12px 16px;font-size:13px;color:#1a1a2e;font-weight:700;text-align:right;">${dueDate}</td>
  </tr>
</table>
${btnHtml(portalUrl("/dashboard"), "Accedi all'area clienti")}`
        );
        await sendEmail(email, `Nuova fattura disponibile — ${invoiceNumber}`, html);
      }
    });
  }
);

// ── N11: New Message ────────────────────────────────────────────────────────

export const onNewMessage = inngest.createFunction(
  { id: "new-message", retries: 3, triggers: [{ event: "message/received" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { clientId, clientName, partnerId, preview } = d;

    await step.run("notify-new-message", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "new_message",
        title: `Nuovo messaggio da ${clientName}`,
        body: String(preview).length > 100 ? String(preview).slice(0, 100) + "..." : String(preview),
      });
    });
  }
);

// ── N12: Weight Alert ───────────────────────────────────────────────────────

export const onWeightAlert = inngest.createFunction(
  { id: "weight-alert", retries: 3, triggers: [{ event: "checkin/weight-alert" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { checkinId, clientId, clientName, partnerId, weightKg, deviationKg } = d;
    const direction = Number(deviationKg) > 0 ? "+" : "";

    await step.run("notify-weight-alert", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "weight_deviation",
        title: `🚨 Allarme peso — ${clientName}`,
        body: `Peso: ${weightKg}kg (${direction}${Number(deviationKg).toFixed(1)}kg). Deviazione significativa rilevata.`,
        metadata: { checkinId, weightKg, deviationKg },
      });

      await createTask({
        partnerId,
        clientId,
        title: `Revisione urgente peso — ${clientName}`,
        description: `Deviazione peso di ${direction}${Number(deviationKg).toFixed(1)}kg rilevata nel check-in. Valutare se modificare il piano.`,
        priority: "urgent",
      });
    });
  }
);

// ── Daily Scanner: Invoice Overdue (N7/N8) ──────────────────────────────────

export const scanOverdueInvoices = inngest.createFunction(
  { id: "scan-overdue-invoices", retries: 2, triggers: [{ cron: "0 9 * * *" }] },
  async ({ step }) => {
    await step.run("find-and-notify-overdue", async () => {
      const db = getServiceDb();
      const today = new Date().toISOString().split("T")[0];

      // N7: Invoices 7+ days overdue (but less than 14)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

      const { data: overdue7 } = await db
        .from("invoice")
        .select("id, client_id, partner_id, invoice_number, amount_cents, due_date")
        .eq("status", "sent")
        .lte("due_date", sevenDaysAgo)
        .gt("due_date", fourteenDaysAgo)
        .is("deleted_at", null);

      for (const inv of overdue7 ?? []) {
        // Idempotency: skip if a notification for this invoice already exists today (N7)
        const { count: existingN7 } = await db
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("trigger", "invoice_overdue")
          .eq("metadata->>invoiceId", inv.id)
          .gte("created_at", today);
        if ((existingN7 ?? 0) > 0) continue;

        // Look up client name separately to avoid join type issues
        const { data: client } = await db
          .from("client")
          .select("full_name")
          .eq("id", inv.client_id)
          .single();
        const clientName = client?.full_name ?? "Cliente";

        await createNotification({
          partnerId: inv.partner_id,
          clientId: inv.client_id,
          trigger: "invoice_overdue",
          title: `Fattura ${inv.invoice_number} scaduta`,
          body: `La fattura di €${(inv.amount_cents / 100).toFixed(2)} per ${clientName} è scaduta da 7 giorni.`,
          metadata: { invoiceId: inv.id },
        });
      }

      // N8: Invoices 14+ days overdue → escalate with task
      const { data: overdue14 } = await db
        .from("invoice")
        .select("id, client_id, partner_id, invoice_number, amount_cents")
        .eq("status", "sent")
        .lte("due_date", fourteenDaysAgo)
        .is("deleted_at", null);

      for (const inv of overdue14 ?? []) {
        // Idempotency: skip if an escalation notification for this invoice already exists today (N8)
        const { count: existingN8 } = await db
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("trigger", "invoice_overdue")
          .eq("metadata->>invoiceId", inv.id)
          .eq("metadata->>escalated", "true")
          .gte("created_at", today);
        if ((existingN8 ?? 0) > 0) continue;

        const { data: client } = await db
          .from("client")
          .select("full_name")
          .eq("id", inv.client_id)
          .single();
        const clientName = client?.full_name ?? "Cliente";

        await createNotification({
          partnerId: inv.partner_id,
          clientId: inv.client_id,
          trigger: "invoice_overdue",
          title: `🚨 Fattura ${inv.invoice_number} — escalation`,
          body: `La fattura per ${clientName} è scaduta da oltre 14 giorni. Azione richiesta.`,
          metadata: { invoiceId: inv.id, escalated: true },
        });

        await createTask({
          partnerId: inv.partner_id,
          clientId: inv.client_id,
          title: `Sollecito pagamento — ${clientName}`,
          description: `Fattura ${inv.invoice_number} scaduta da 14+ giorni. Contattare il cliente.`,
          priority: "high",
          dueDate: today,
        });
      }
    });
  }
);

// ── Daily Scanner: Cold Clients (N9) ────────────────────────────────────────

export const scanColdClients = inngest.createFunction(
  { id: "scan-cold-clients", retries: 2, triggers: [{ cron: "0 10 * * *" }] },
  async ({ step }) => {
    await step.run("find-cold-clients", async () => {
      const db = getServiceDb();
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

      const { data: activeClients } = await db
        .from("client")
        .select("id, full_name, partner_id, updated_at")
        .eq("status", "active")
        .is("deleted_at", null)
        .lt("updated_at", fourteenDaysAgo);

      for (const client of activeClients ?? []) {
        const { count: recentCheckins } = await db
          .from("check_in")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("created_at", fourteenDaysAgo);

        const { count: recentTraining } = await db
          .from("training_log")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("created_at", fourteenDaysAgo);

        if ((recentCheckins ?? 0) === 0 && (recentTraining ?? 0) === 0) {
          const todayCold = new Date().toISOString().split("T")[0];
          // Idempotency: skip if a cold-client task for this client was already created today (N9)
          const { count: existingColdTask } = await db
            .from("task")
            .select("id", { count: "exact", head: true })
            .eq("client_id", client.id)
            .eq("title", `Cliente inattivo — ${client.full_name}`)
            .gte("created_at", todayCold);
          if ((existingColdTask ?? 0) > 0) continue;

          await createTask({
            partnerId: client.partner_id,
            clientId: client.id,
            title: `Cliente inattivo — ${client.full_name}`,
            description: `Nessuna attività negli ultimi 14 giorni. Verificare coinvolgimento.`,
            priority: "medium",
          });
        }
      }
    });
  }
);

// ── Daily Scanner: Expiring Plans (N10) ─────────────────────────────────────

export const scanExpiringPlans = inngest.createFunction(
  { id: "scan-expiring-plans", retries: 2, triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    await step.run("find-expiring-plans", async () => {
      const db = getServiceDb();
      const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      const { data: expiringPlans } = await db
        .from("plan")
        .select("id, client_id, partner_id, name, end_date")
        .eq("status", "active")
        .lte("end_date", sevenDaysFromNow)
        .gte("end_date", today)
        .is("deleted_at", null);

      for (const plan of expiringPlans ?? []) {
        // Idempotency: skip if a notification for this plan already exists today (N10)
        const { count: existingN10 } = await db
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("trigger", "plan_expiring")
          .eq("metadata->>planId", plan.id)
          .gte("created_at", today);
        if ((existingN10 ?? 0) > 0) continue;

        const { data: client } = await db
          .from("client")
          .select("full_name")
          .eq("id", plan.client_id)
          .single();
        const clientName = client?.full_name ?? "Cliente";

        await createNotification({
          partnerId: plan.partner_id,
          clientId: plan.client_id,
          trigger: "plan_expiring",
          title: `Piano in scadenza — ${clientName}`,
          body: `Il piano "${plan.name}" scade il ${plan.end_date}. Programmare il rinnovo.`,
          metadata: { planId: plan.id, endDate: plan.end_date },
        });

        await createTask({
          partnerId: plan.partner_id,
          clientId: plan.client_id,
          title: `Rinnovo piano — ${clientName}`,
          description: `Il piano attivo scade il ${plan.end_date}. Preparare nuovo piano o rinnovo.`,
          priority: "medium",
          dueDate: plan.end_date ?? undefined,
        });
      }
    });
  }
);

// ── Feedback-reminder cadence (lifecycle-spine increment 1) ──────────────────

/**
 * onFeedbackRequestDue — clones the onCheckinDue shape. Fired (by scanFeedbackDue)
 * ~21 days after a plan's start_date: emits a 'feedback_requested' notification to
 * the coach and emails the client the existing check-in questionnaire (weight /
 * scales / photos / adherence / notes). Idempotent: skips if a feedback_requested
 * notification for this plan already exists today (no duplicate same-day).
 */
export const onFeedbackRequestDue = inngest.createFunction(
  { id: "feedback-request-due", retries: 3, triggers: [{ event: "feedback/request-due" }] },
  async ({ event, step }) => {
    const d = event.data as EventData;
    const { checkinId, clientId, clientName, partnerId, planId, planName } = d;

    // Idempotency: at most one feedback_requested notification per plan per day.
    const alreadyNotified = await step.run("check-feedback-dup", async () => {
      const db = getServiceDb();
      const today = new Date().toISOString().split("T")[0];
      const { count } = await db
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("trigger", "feedback_requested")
        .eq("metadata->>planId", planId)
        .gte("created_at", today);
      return (count ?? 0) > 0;
    });
    if (alreadyNotified) return;

    await step.run("notify-feedback-requested", async () => {
      await createNotification({
        partnerId,
        clientId,
        trigger: "feedback_requested",
        title: `Feedback richiesto — ${clientName}`,
        body: `Sono passate circa 3 settimane dall'inizio del piano di ${clientName}. È stato richiesto un check-in di feedback per valutare un aggiornamento del piano.`,
        metadata: { planId, planName, checkinId },
      });
    });

    await step.run("email-feedback-request", async () => {
      const db = getServiceDb();
      const { data: checkinRow } = await db
        .from("check_in")
        .select("token")
        .eq("id", checkinId)
        .maybeSingle();

      const email = await getClientEmail(clientId);
      if (email) {
        const checkinLink = checkinRow?.token
          ? portalUrl(`/checkin/${checkinRow.token}`)
          : portalUrl("/dashboard");

        const html = emailWrapper(
          "Com'è andato il tuo piano?",
          `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Com'è andato finora?</h2>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${clientName},<br/>
  sono passate circa 3 settimane dall'inizio del tuo piano. Raccontaci com'è andata: compila il check-in (peso, misure, foto, aderenza e note) così il tuo coach può aggiornare il piano sulla base dei tuoi progressi.
</p>
${btnHtml(checkinLink, "Compila il check-in")}`
        );
        await sendEmail(email, "Com'è andato il tuo piano? — Richiesta feedback", html);
      }
    });
  }
);

/**
 * scanFeedbackDue — daily cron. Finds active plans whose start_date is
 * FEEDBACK_DUE_DAYS (≈21) ago (with a FEEDBACK_CATCH_DAYS window to recover from
 * missed runs), creates/reuses the feedback check-in, and emits feedback/request-due.
 * Idempotent: a plan that already has a feedback_requested notification is skipped;
 * an in-flight (not-yet-handled) plan re-uses its pending check-in and re-emits.
 *
 * Note: keys off plan.start_date — dormant until start_date is populated.
 */
export const scanFeedbackDue = inngest.createFunction(
  { id: "scan-feedback-due", retries: 2, triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    // Detect due plans + create/reuse their feedback check-ins inside one step,
    // returning the events to emit. The actual emission uses step.sendEvent
    // (below) so it is memoised/retry-safe and never double-queued.
    const events = await step.run("find-feedback-due-plans", async () => {
      const db = getServiceDb();
      // Build #07: per-client check-in cadence. Widen the candidate window to cover
      // any configured cadence (1..90 days, + catch); each plan is then gated below
      // by its client's checkInEveryDays. For a default client (21 days) the gate
      // reproduces the original [today−28, today−21] window EXACTLY → no change.
      const MAX_EVERY_DAYS = 90;
      const wideStart = new Date(Date.now() - (MAX_EVERY_DAYS + FEEDBACK_CATCH_DAYS) * 86400000)
        .toISOString()
        .split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      const { data: plans } = await db
        .from("plan")
        .select("id, client_id, partner_id, name, start_date")
        .eq("status", "active")
        .gte("start_date", wideStart)
        .lte("start_date", today)
        .is("deleted_at", null);

      const out: Array<{ name: string; data: Record<string, unknown> }> = [];

      for (const plan of plans ?? []) {
        // Build #07: respect this client's cadence + enabled flag. Default settings
        // (21 days, enabled) reproduce the prior behaviour exactly.
        const settings = await loadReminderSettings(db, plan.client_id);
        if (!checkInReminderDue(settings, plan.start_date, FEEDBACK_CATCH_DAYS, Date.now())) {
          continue;
        }

        // Done already: a feedback_requested notification for this plan exists.
        const { count: notified } = await db
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("trigger", "feedback_requested")
          .eq("metadata->>planId", plan.id);
        if ((notified ?? 0) > 0) continue;

        // Reuse a pending check-in for this plan if one exists (self-heals a
        // partially-completed prior run); otherwise create the feedback check-in.
        let checkinId: string | undefined;
        const { data: existing } = await db
          .from("check_in")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          checkinId = existing.id;
        } else {
          const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
          const { data: created } = await db
            .from("check_in")
            .insert({
              client_id: plan.client_id,
              partner_id: plan.partner_id,
              plan_id: plan.id,
              status: "pending",
              due_date: dueDate,
            })
            .select("id")
            .single();
          checkinId = created?.id;
        }
        if (!checkinId) continue;

        const { data: client } = await db
          .from("client")
          .select("full_name")
          .eq("id", plan.client_id)
          .single();

        out.push({
          name: "feedback/request-due",
          data: {
            checkinId,
            clientId: plan.client_id,
            clientName: client?.full_name ?? "Cliente",
            partnerId: plan.partner_id,
            planId: plan.id,
            planName: plan.name,
          },
        });
      }

      return out;
    });

    if (events.length > 0) {
      await step.sendEvent("emit-feedback-due", events);
    }
  }
);

// ── N15: Plan-update heuristic (#25 Stage A) — weight-change → suggest regen ──
// Daily scan. PROMPT LAYER ONLY: for each active plan whose client has lost
// ≥10% bodyweight since the plan started, emit ONE COACH-SCOPED notification
// (client_id = NULL) suggesting the coach regenerate the plan with a ~8.5%
// calorie trim. It NEVER mutates a plan — the apply path is the existing #24
// createVersion flow, run by the coach. Clones scanFeedbackDue's shape; the
// signal logic + same-day idempotency live in the injectable core (testable).
export const scanPlanUpdateHeuristics = inngest.createFunction(
  { id: "scan-plan-update-heuristics", retries: 2, triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    const results = await step.run("scan-weight-change-regen", async () =>
      scanPlanUpdateHeuristicsCore(getServiceDb()),
    );
    return { scanned: results.length, emitted: results.filter((r) => r.emitted).length };
  },
);

// ── Build #07: body-composition reminders (net-new, opt-in) ──────────────────
// Reminds a client to update their body-composition measurements every
// body_comp_every_days days since their LAST snapshot. Opt-in: only clients with
// reminders_enabled = true AND body_comp_every_days > 0 are considered, so
// existing clients (no settings row, default 0 = off) are never reminded.
export const scanBodyCompDue = inngest.createFunction(
  { id: "scan-body-comp-due", retries: 2, triggers: [{ cron: "0 11 * * *" }] },
  async ({ step }) => {
    const due = await step.run("find-body-comp-due", async () => {
      const db = getServiceDb();
      const nowMs = Date.now();

      const { data: rows } = await db
        .from("client_reminder_settings")
        .select("client_id, body_comp_every_days, reminders_enabled")
        .eq("reminders_enabled", true)
        .gt("body_comp_every_days", 0);

      const out: Array<{
        clientId: string;
        partnerId: string;
        clientName: string;
        email: string | null;
        everyDays: number;
      }> = [];

      for (const row of rows ?? []) {
        const everyDays = row.body_comp_every_days as number;

        // Anchor on the most recent body-composition snapshot.
        const { data: snap } = await db
          .from("client_snapshot")
          .select("taken_at")
          .eq("client_id", row.client_id)
          .order("taken_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Snapshot-anchored dedup: the most recent body_comp_due reminder (if any).
        const { data: lastReminder } = await db
          .from("notification")
          .select("created_at")
          .eq("trigger", "body_comp_due")
          .eq("client_id", row.client_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const due = bodyCompReminderDue({
          settings: { enabled: row.reminders_enabled as boolean, bodyCompEveryDays: everyDays },
          lastSnapshotDate: (snap?.taken_at as string | null) ?? null,
          lastReminderAt: (lastReminder?.created_at as string | null) ?? null,
          nowMs,
        });
        if (!due) continue;

        const { data: client } = await db
          .from("client")
          .select("full_name, partner_id, email, status, deleted_at")
          .eq("id", row.client_id)
          .single();
        if (!client || client.status !== "active" || client.deleted_at) continue;

        out.push({
          clientId: row.client_id as string,
          partnerId: client.partner_id as string,
          clientName: (client.full_name as string) ?? "Cliente",
          email: (client.email as string | null) ?? null,
          everyDays,
        });
      }

      return out;
    });

    // Split notify + email into separate steps so an email retry never re-creates
    // the in-app notification (mirrors onFeedbackRequestDue).
    for (const c of due) {
      await step.run(`notify-body-comp-${c.clientId}`, async () => {
        await createNotification({
          partnerId: c.partnerId,
          clientId: c.clientId,
          trigger: "body_comp_due",
          title: `Misurazioni composizione corporea per ${c.clientName}`,
          body: `Sono passati ${c.everyDays} giorni dall'ultima rilevazione della composizione corporea di ${c.clientName}.`,
          metadata: { everyDays: c.everyDays },
        });
      });

      const email = c.email;
      if (email) {
        await step.run(`email-body-comp-${c.clientId}`, async () => {
          const html = emailWrapper(
            "È il momento di aggiornare le misurazioni",
            `<h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Aggiorna le tue misurazioni</h2>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
  Ciao ${c.clientName},<br/>
  sono passati ${c.everyDays} giorni dall'ultima rilevazione della composizione corporea. Registra peso e misure aggiornate per aiutare il tuo coach a tarare il piano.
</p>
${btnHtml(portalUrl("/progress"), "Aggiorna le misurazioni")}`
          );
          await sendEmail(email, "È il momento di aggiornare le misurazioni", html);
        });
      }
    }

    return { reminded: due.length };
  },
);

// ── Export all functions ─────────────────────────────────────────────────────

export const functions = [
  onPlanDelivered,
  onCheckinDue,
  onInvoiceSent,
  onNewMessage,
  onWeightAlert,
  scanOverdueInvoices,
  scanColdClients,
  scanExpiringPlans,
  onFeedbackRequestDue,
  scanFeedbackDue,
  scanPlanUpdateHeuristics,
  scanBodyCompDue,
];
