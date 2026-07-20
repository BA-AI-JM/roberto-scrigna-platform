/**
 * E2E harness route for the #10 session kcal estimate + override. Inert in
 * production: 404 unless NEXT_PUBLIC_E2E_KCAL === "1" (set only when the local
 * Playwright dev server starts). The real surface is the weekly grid in the
 * coach client edit page.
 */
import { notFound } from "next/navigation";
import { KcalE2EHarness } from "./harness";

export default function KcalE2EPage() {
  // G23 hard wall: a stray NEXT_PUBLIC_E2E_* in a prod build must NEVER expose this
  // unauthenticated bypass. The production guard runs FIRST, before the flag check.
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_E2E_KCAL !== "1") notFound();
  return <KcalE2EHarness />;
}
