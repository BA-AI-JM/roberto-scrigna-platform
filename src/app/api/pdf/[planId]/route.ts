/**
 * PDF generation API route.
 *
 * GET /api/pdf/[planId]
 *
 * Reads the stored plan bundle from the database, renders the branded HTML
 * report via renderReportHtml(), then converts it to a PDF using Puppeteer.
 * Returns the PDF buffer with Content-Disposition: attachment so the browser
 * triggers a download.
 *
 * Auth: reads the session cookie via the server Supabase client; returns 401
 * if the user is not an authenticated partner, and 403 if the plan belongs to
 * a different partner.
 */

import type { NextRequest } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { renderReportHtml } from "../../../../pdf/html-renderer";
import { generatePdf } from "../../../../pdf/generator";
import type { SerializedPlanResult } from "../../../../services/plan-generator";
import type { PdfReportData } from "../../../../pdf/types";
// #18 → PDF: representative training time from the client's intake, attached to
// training-day plans so the renderer draws the peri-workout box (mirrors the
// portal + coach card). Pure, framework-free helpers.
import { firstTrainingTime, isTrainingDayType, type RawSession } from "../../../../components/plan/peri-workout-timing";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> }
) {
  const { planId } = await params;

  // 1. Auth check — resolve partner from session
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Non autorizzato.", { status: 401 });
  }

  const { data: partner } = await supabase
    .from("partner")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!partner) {
    return new Response("Accesso negato.", { status: 403 });
  }

  // 2. Load the plan (scoped to the partner via RLS + explicit filter)
  const { data: plan, error } = await supabase
    .from("plan")
    .select("id, name, status, client_id, daily_targets, created_at")
    .eq("id", planId)
    .eq("partner_id", partner.id)
    .is("deleted_at", null)
    .single();

  if (error || !plan) {
    return new Response("Piano non trovato.", { status: 404 });
  }

  // 3. Extract plan_bundle from JSONB storage
  const dailyTargets = plan.daily_targets as Record<string, unknown> | null;
  const planBundle = dailyTargets?.plan_bundle as SerializedPlanResult | null;

  if (!planBundle?.reportData) {
    return new Response(
      "Dati del piano non disponibili. Rigenerare il piano.",
      { status: 422 }
    );
  }

  let reportData: PdfReportData = planBundle.reportData;

  // 3b. #18 — enrich the (frozen) bundle with the client's current training time
  // so training-day plans render the peri-workout timed box. Sourced from the
  // latest snapshot's intake (display-only). Absent / RLS-blocked → no box
  // (graceful) — the meal list renders unchanged.
  const { data: snap } = await supabase
    .from("client_snapshot")
    .select("skinfold_data")
    .eq("client_id", plan.client_id)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const trainingSessions = (
    (snap?.skinfold_data as { _intake?: { training_sessions?: Record<string, RawSession[]> } } | null)
      ?._intake?.training_sessions
  );
  const trainingTime = firstTrainingTime(trainingSessions);
  if (trainingTime.startTime) {
    reportData = {
      ...reportData,
      dayTypePlans: reportData.dayTypePlans.map((p) =>
        isTrainingDayType(p.dayType) ? { ...p, trainingTime } : p
      ),
    };
  }

  // 4. Render HTML → PDF via Puppeteer
  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await generatePdf(reportData, {
      format: "A4",
      includeMealPlans: true,
      includeSupplements: true,
      includeGuidance: true,
    });
  } catch (err) {
    console.error("[pdf/route] Puppeteer error:", err);
    return new Response("Errore durante la generazione del PDF.", {
      status: 500,
    });
  }

  // 5. Build a clean filename from the client name and date
  const clientName = reportData.client.fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_");
  const planDate = reportData.client.planDate.replace(/-/g, "");
  const filename = `Piano_${clientName}_${planDate}.pdf`;

  // The Web Response API accepts ArrayBuffer as BodyInit
  return new Response(pdfBuffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
    },
  });
}
