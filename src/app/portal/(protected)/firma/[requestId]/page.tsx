/**
 * Patient SES signing route — /portal/firma/{requestId} (#29).
 *
 * Behind the existing patient auth gate (the (protected) layout). Thin server
 * wrapper that resolves the route param and renders the client signing screen.
 */
import { SignScreen } from "@/components/portal/sign-screen";

export default async function PortalSignPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <SignScreen requestId={requestId} />;
}
