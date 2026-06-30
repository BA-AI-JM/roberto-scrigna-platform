/**
 * E2E harness route for the #10 session kcal estimate + override. Inert in
 * production: 404 unless NEXT_PUBLIC_E2E_KCAL === "1" (set only when the local
 * Playwright dev server starts). The real surface is the weekly grid in the
 * coach client edit page.
 */
import { notFound } from "next/navigation";
import { KcalE2EHarness } from "./harness";

export default function KcalE2EPage() {
  if (process.env.NEXT_PUBLIC_E2E_KCAL !== "1") notFound();
  return <KcalE2EHarness />;
}
