/**
 * Root layout for the Roberto Scrigna platform.
 */

import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roberto Scrigna — Nutrition Platform",
  description: "Professional nutrition planning and client management platform.",
};

/**
 * Root layout wrapping all pages with tRPC provider.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
