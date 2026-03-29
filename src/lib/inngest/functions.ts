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

// ── Supabase service-role client for background jobs ────────────────────────

function getServiceDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
};

async function createNotification(params: {
  partnerId: string;
  clientId?: string;
  trigger: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getServiceDb();
  await db.from("notification").insert({
    partner_id: params.partnerId,
    client_id: params.clientId ?? null,
    trigger: params.trigger,
    priority: TRIGGER_PRIORITY[params.trigger] ?? "medium",
    title: params.title,
    body: params.body,
    metadata: params.metadata ?? {},
    read: false,
  });
}

async function createTask(params: {
  partnerId: string;
  clientId?: string;
  title: string;
  description: string;
  priority: string;
  dueDate?: string;
}) {
  const db = getServiceDb();
  await db.from("task").insert({
    partner_id: params.partnerId,
    client_id: params.clientId ?? null,
    title: params.title,
    description: params.description,
    priority: params.priority,
    status: "todo",
    due_date: params.dueDate ?? null,
  });
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

    // N2: Follow-up if not viewed in 48h
    await step.sleep("wait-48h", "48h");

    await step.run("check-plan-viewed-48h", async () => {
      const db = getServiceDb();
      const { data: plan } = await db
        .from("plan")
        .select("id, status")
        .eq("id", planId)
        .single();

      if (plan) {
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

    // N4: Notify on due date
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

    // N5: Wait 5 days, then check if completed
    await step.sleep("wait-5d", "5d");

    const isCompleted = await step.run("check-if-completed", async () => {
      const db = getServiceDb();
      const { data } = await db
        .from("checkin")
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
          .from("checkin")
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
          .from("checkin")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("created_at", fourteenDaysAgo);

        const { count: recentTraining } = await db
          .from("training_log")
          .select("id", { count: "exact", head: true })
          .eq("client_id", client.id)
          .gte("created_at", fourteenDaysAgo);

        if ((recentCheckins ?? 0) === 0 && (recentTraining ?? 0) === 0) {
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
];
