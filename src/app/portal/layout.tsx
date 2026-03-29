/**
 * Portal root layout.
 *
 * Provides the tRPC + React Query context for all portal pages.
 * Auth protection is applied in the (protected) sub-layout.
 */

import { TRPCProvider } from "@/lib/trpc/provider";

/** Root portal layout — TRPCProvider only, no auth check. */
export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCProvider>
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          backgroundColor: "#f8fafc",
        }}
      >
        {children}
      </div>
    </TRPCProvider>
  );
}
