/**
 * Dashboard Router
 *
 * tRPC procedures for Roberto's dashboard:
 * - overview: aggregated KPIs (revenue, pipeline, clients)
 * - alerts: smart alerts requiring attention
 * - engagementHeatmap: 12-week client engagement grid
 * - revenueTimeline: monthly revenue for the past 12 months
 * - pipelineBreakdown: client status distribution
 */

import { z } from "zod/v4";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get ISO date string for N days ago */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Get first day of current month */
function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// ── Smart Alert Types ────────────────────────────────────────────────────────

interface SmartAlert {
  id: string;
  type: "warning" | "danger" | "info" | "success";
  category: string;
  title: string;
  description: string;
  actionUrl: string | null;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const dashboardRouter = router({
  /**
   * Dashboard overview — aggregated KPIs.
   */
  overview: protectedProcedure.query(async ({ ctx }) => {
    const partnerId = ctx.partnerId;
    const today = new Date().toISOString().split("T")[0]!;

    // All 10 queries fire in parallel
    const [
      { count: activeClients },
      { count: totalClients },
      { count: pendingCheckins },
      { count: awaitingReview },
      { count: flaggedCheckins },
      { data: paidInvoices },
      { data: outstandingInvoices },
      { count: overdueTasks },
      { count: tasksDueToday },
      { count: unreadNotifications },
    ] = await Promise.all([
      // Active clients count
      ctx.supabase
        .from("client")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("status", "active")
        .is("deleted_at", null),

      // Total clients count
      ctx.supabase
        .from("client")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .is("deleted_at", null),

      // Pending check-ins
      ctx.supabase
        .from("check_in")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("status", "pending"),

      // Completed check-ins awaiting review
      ctx.supabase
        .from("check_in")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("status", "completed"),

      // Flagged check-ins (weight deviation)
      ctx.supabase
        .from("check_in")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("weight_flagged", true)
        .in("status", ["completed", "pending"]),

      // Revenue this month (paid invoices)
      ctx.supabase
        .from("invoice")
        .select("amount_cents")
        .eq("partner_id", partnerId)
        .eq("status", "paid")
        .gte("paid_date", monthStart()),

      // Outstanding revenue (sent invoices)
      ctx.supabase
        .from("invoice")
        .select("amount_cents")
        .eq("partner_id", partnerId)
        .eq("status", "sent"),

      // Overdue tasks
      ctx.supabase
        .from("task")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .in("status", ["todo", "in_progress"])
        .lt("due_date", today)
        .is("deleted_at", null),

      // Tasks due today
      ctx.supabase
        .from("task")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .in("status", ["todo", "in_progress"])
        .eq("due_date", today)
        .is("deleted_at", null),

      // Unread notifications
      ctx.supabase
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("read", false),
    ]);

    const revenueThisMonth =
      paidInvoices?.reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0) ?? 0;

    const outstandingRevenue =
      outstandingInvoices?.reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0) ?? 0;

    return {
      clients: {
        active: activeClients ?? 0,
        total: totalClients ?? 0,
      },
      checkins: {
        pending: pendingCheckins ?? 0,
        awaitingReview: awaitingReview ?? 0,
        flagged: flaggedCheckins ?? 0,
      },
      revenue: {
        thisMonthCents: revenueThisMonth,
        outstandingCents: outstandingRevenue,
      },
      tasks: {
        overdue: overdueTasks ?? 0,
        dueToday: tasksDueToday ?? 0,
      },
      notifications: {
        unread: unreadNotifications ?? 0,
      },
    };
  }),

  /**
   * Smart alerts — items requiring Roberto's attention.
   */
  alerts: protectedProcedure.query(async ({ ctx }) => {
    const alerts: SmartAlert[] = [];
    const partnerId = ctx.partnerId;
    const now = new Date();

    // 1. Overdue check-ins (pending > 3 days)
    const { data: overdueCheckins } = await ctx.supabase
      .from("check_in")
      .select("id, due_date, client:client_id (id, full_name)")
      .eq("partner_id", partnerId)
      .eq("status", "pending")
      .lt("due_date", now.toISOString().split("T")[0]!);

    for (const ci of overdueCheckins ?? []) {
      const client = ci.client as unknown as { id: string; full_name: string } | null;
      alerts.push({
        id: `checkin-overdue-${ci.id}`,
        type: "danger",
        category: "Check-in",
        title: `Check-in scaduto`,
        description: `${client?.full_name ?? "Cliente"} non ha compilato il check-in.`,
        actionUrl: `/monitoring?clientId=${client?.id}`,
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        createdAt: ci.due_date ?? now.toISOString(),
      });
    }

    // 2. Weight deviation flags
    const { data: flaggedCheckins } = await ctx.supabase
      .from("check_in")
      .select(
        "id, weight_kg, weight_deviation_kg, client:client_id (id, full_name)"
      )
      .eq("partner_id", partnerId)
      .eq("status", "completed")
      .eq("weight_flagged", true)
      .order("completed_at", { ascending: false })
      .limit(10);

    for (const ci of flaggedCheckins ?? []) {
      const client = ci.client as unknown as { id: string; full_name: string } | null;
      const dir = (ci.weight_deviation_kg ?? 0) > 0 ? "+" : "";
      alerts.push({
        id: `weight-flag-${ci.id}`,
        type: "warning",
        category: "Peso",
        title: `Deviazione peso significativa`,
        description: `${client?.full_name ?? "Cliente"}: ${dir}${ci.weight_deviation_kg}kg (${ci.weight_kg}kg)`,
        actionUrl: `/monitoring?clientId=${client?.id}`,
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        createdAt: now.toISOString(),
      });
    }

    // 3. Overdue invoices
    const { data: overdueInvoices } = await ctx.supabase
      .from("invoice")
      .select("id, invoice_number, amount_cents, due_date, client:client_id (id, full_name)")
      .eq("partner_id", partnerId)
      .eq("status", "overdue")
      .limit(10);

    for (const inv of overdueInvoices ?? []) {
      const client = inv.client as unknown as { id: string; full_name: string } | null;
      alerts.push({
        id: `invoice-overdue-${inv.id}`,
        type: "danger",
        category: "Fatturazione",
        title: `Fattura ${inv.invoice_number} scaduta`,
        description: `${client?.full_name ?? "Cliente"} — €${((inv.amount_cents ?? 0) / 100).toFixed(2)}`,
        actionUrl: `/invoices/${inv.id}`,
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        createdAt: inv.due_date ?? now.toISOString(),
      });
    }

    // 4. Overdue tasks
    const today = now.toISOString().split("T")[0]!;
    const { data: overdueTasks } = await ctx.supabase
      .from("task")
      .select("id, title, due_date, client:client_id (id, full_name)")
      .eq("partner_id", partnerId)
      .in("status", ["todo", "in_progress"])
      .lt("due_date", today)
      .is("deleted_at", null)
      .limit(10);

    for (const task of overdueTasks ?? []) {
      const client = task.client as unknown as { id: string; full_name: string } | null;
      alerts.push({
        id: `task-overdue-${task.id}`,
        type: "warning",
        category: "Task",
        title: `Task scaduto: ${task.title}`,
        description: client?.full_name
          ? `Assegnato a ${client.full_name}`
          : "Nessun cliente associato",
        actionUrl: null,
        clientId: client?.id ?? null,
        clientName: client?.full_name ?? null,
        createdAt: task.due_date ?? now.toISOString(),
      });
    }

    // Sort by priority (danger first, then warning)
    const priorityOrder: Record<string, number> = {
      danger: 0,
      warning: 1,
      info: 2,
      success: 3,
    };
    alerts.sort(
      (a, b) => (priorityOrder[a.type] ?? 99) - (priorityOrder[b.type] ?? 99)
    );

    return alerts;
  }),

  /**
   * Engagement heatmap — 12-week grid of client activity.
   * Each cell = client × week, value = number of check-ins/logs that week.
   */
  engagementHeatmap: protectedProcedure.query(async ({ ctx }) => {
    const partnerId = ctx.partnerId;
    const twelveWeeksAgo = daysAgo(84);

    // Get active clients
    const { data: clients } = await ctx.supabase
      .from("client")
      .select("id, full_name")
      .eq("partner_id", partnerId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name")
      .limit(50);

    if (!clients?.length) {
      return { clients: [], weeks: [], data: [] };
    }

    const clientIds = clients.map((c) => c.id);

    // Get check-ins in the last 12 weeks
    const { data: checkins } = await ctx.supabase
      .from("check_in")
      .select("client_id, completed_at")
      .eq("partner_id", partnerId)
      .eq("status", "completed")
      .gte("completed_at", twelveWeeksAgo)
      .in("client_id", clientIds);

    // Get training logs in the last 12 weeks
    const { data: trainingLogs } = await ctx.supabase
      .from("training_log")
      .select("client_id, session_date")
      .eq("partner_id", partnerId)
      .gte("session_date", twelveWeeksAgo.split("T")[0]!)
      .is("deleted_at", null)
      .in("client_id", clientIds);

    // Build week labels (ISO week)
    const weeks: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      weeks.push(weekStart.toISOString().split("T")[0]!);
    }

    // Build heatmap data: clientId → weekIndex → count
    const heatmapData: Array<{
      clientId: string;
      clientName: string;
      weeks: number[];
    }> = [];

    for (const client of clients) {
      const weekCounts = new Array(12).fill(0) as number[];

      // Count check-ins per week
      for (const ci of checkins ?? []) {
        if (ci.client_id !== client.id || !ci.completed_at) continue;
        const ciDate = new Date(ci.completed_at);
        for (let w = 0; w < 12; w++) {
          const weekStartDate = new Date(weeks[w]!);
          const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (ciDate >= weekStartDate && ciDate < weekEndDate) {
            weekCounts[w]!++;
            break;
          }
        }
      }

      // Count training logs per week
      for (const log of trainingLogs ?? []) {
        if (log.client_id !== client.id || !log.session_date) continue;
        const logDate = new Date(log.session_date);
        for (let w = 0; w < 12; w++) {
          const weekStartDate = new Date(weeks[w]!);
          const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (logDate >= weekStartDate && logDate < weekEndDate) {
            weekCounts[w]!++;
            break;
          }
        }
      }

      heatmapData.push({
        clientId: client.id,
        clientName: client.full_name,
        weeks: weekCounts,
      });
    }

    return { clients, weeks, data: heatmapData };
  }),

  /**
   * Revenue timeline — monthly revenue for the past 12 months.
   */
  revenueTimeline: protectedProcedure.query(async ({ ctx }) => {
    const partnerId = ctx.partnerId;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const { data: invoices } = await ctx.supabase
      .from("invoice")
      .select("amount_cents, paid_date")
      .eq("partner_id", partnerId)
      .eq("status", "paid")
      .gte("paid_date", twelveMonthsAgo.toISOString());

    // Group by month
    const months: Array<{ month: string; revenueCents: number }> = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const total =
        invoices
          ?.filter((inv) => {
            if (!inv.paid_date) return false;
            const paidDate = new Date(inv.paid_date);
            return paidDate >= d && paidDate < nextMonth;
          })
          .reduce((sum, inv) => sum + (inv.amount_cents ?? 0), 0) ?? 0;

      months.push({ month: monthKey, revenueCents: total });
    }

    return months;
  }),

  /**
   * Pipeline breakdown — client status distribution.
   */
  pipelineBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const partnerId = ctx.partnerId;

    const statuses = ["active", "paused", "archived"] as const;
    const results: Array<{ status: string; count: number }> = [];

    for (const status of statuses) {
      const { count } = await ctx.supabase
        .from("client")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("status", status)
        .is("deleted_at", null);

      results.push({ status, count: count ?? 0 });
    }

    return results;
  }),
});
