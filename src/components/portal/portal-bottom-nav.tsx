"use client";

/**
 * #27 Stage 1 — mobile bottom-tab navigation for the patient portal. Fixed to
 * the bottom on all viewports (mobile-first), four tabs: Home / Piano / Diario /
 * Progressi. The pure tab config + active-matcher are exported for testing; the
 * presentational `BottomNavBar` takes pathname as a prop (testable via SSR); the
 * default export `PortalBottomNav` is the thin client wrapper that reads the
 * current path.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface PortalNavTab {
  href: string;
  label: string;
  icon: string;
}

export const PORTAL_NAV_TABS: PortalNavTab[] = [
  { href: "/portal/dashboard", label: "Home", icon: "🏠" },
  { href: "/portal/plan", label: "Piano", icon: "🍽️" },
  { href: "/portal/diary", label: "Diario", icon: "📓" },
  { href: "/portal/progress", label: "Progressi", icon: "📈" },
];

/** A tab is active when the path equals or is nested under its href. */
export function isTabActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Navigazione portale"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: "flex",
        background: "#ffffff",
        borderTop: "1px solid #e2e8f0",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {PORTAL_NAV_TABS.map((tab) => {
        const active = isTabActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              padding: "8px 4px 10px",
              textDecoration: "none",
              color: active ? "#1a1a2e" : "#9ca3af",
              fontWeight: active ? 700 : 500,
            }}
          >
            <span style={{ fontSize: "20px", lineHeight: "22px", opacity: active ? 1 : 0.7 }} aria-hidden>
              {tab.icon}
            </span>
            <span style={{ fontSize: "11px" }}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function PortalBottomNav() {
  const pathname = usePathname();
  return <BottomNavBar pathname={pathname} />;
}
