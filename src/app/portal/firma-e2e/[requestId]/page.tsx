/**
 * E2E harness route for the signing screen — renders the SAME <SignScreen>
 * client component WITHOUT the (protected) auth gate, so Playwright can drive
 * its behaviour with mocked tRPC responses (no test DB / Supabase session
 * needed). Inert in production: returns 404 unless NEXT_PUBLIC_E2E_SIGN === "1"
 * (set only when the local Playwright dev server is started). It ships nothing
 * usable — the real route is /portal/firma/{requestId} under the auth gate.
 */
import { notFound } from "next/navigation";
import { SignScreen } from "@/components/portal/sign-screen";

export default async function PortalSignE2EPage({ params }: { params: Promise<{ requestId: string }> }) {
  // G23 hard wall: a stray NEXT_PUBLIC_E2E_* in a prod build must NEVER expose this
  // unauthenticated bypass. The production guard runs FIRST, before the flag check.
  if (process.env.NODE_ENV === "production") notFound();
  if (process.env.NEXT_PUBLIC_E2E_SIGN !== "1") notFound();
  const { requestId } = await params;
  return <SignScreen requestId={requestId} />;
}
