/**
 * Root layout for the Roberto Scrigna platform.
 * T3.2: identity fonts (DIRECTION.md) — Fraunces carries the voice, IBM Plex Sans
 * carries the numbers (tabular/lining) — self-hosted via next/font, zero layout shift.
 */

import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Roberto Scrigna — Nutrizione Sportiva",
  description: "La piattaforma dello studio Scrigna: piani, monitoraggio e portale atleti.",
  icons: {
    icon: "/favicon.svg",
  },
};

/**
 * Root layout wrapping all pages with tRPC provider.
 * data-theme is the single theme switch (DIRECTION theme ruling): "light" default;
 * the portal shell may set "dark". Both themes resolve from the same semantic tokens.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" data-theme="light" className={`${display.variable} ${body.variable}`}>
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
