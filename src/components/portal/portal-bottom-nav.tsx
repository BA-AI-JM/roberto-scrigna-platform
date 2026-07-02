"use client";

/**
 * Patient-portal navigation — responsive across mobile and desktop under one
 * brand. Mobile (< lg): a fixed bottom tab bar (thumb-reachable). Desktop (lg+):
 * a pinned top nav bar with a brand wordmark — so the portal is a real desktop
 * app, not a lonely phone column with a stranded mobile tab bar.
 *
 * The pure tab config + active-matcher and the presentational bars are exported
 * for testing; PortalBottomNav is the client wrapper that reads the path and
 * renders both bars (each gated by breakpoint).
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

/** Mobile: fixed bottom tab bar (hidden on lg+). */
export function BottomNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Navigazione portale"
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-background lg:hidden"
      style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.04)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {PORTAL_NAV_TABS.map((tab) => {
        const active = isTabActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-1 pb-2.5 pt-2 no-underline ${
              active ? "text-brand-deep" : "text-muted-foreground"
            }`}
            style={{ fontWeight: active ? 500 : 400 }}
          >
            <span className="text-[20px] leading-[22px]" style={{ opacity: active ? 1 : 0.7 }} aria-hidden>
              {tab.icon}
            </span>
            <span className="text-[11px]">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop: pinned top nav bar with a brand wordmark (shown on lg+). */
export function TopNavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Navigazione portale"
      className="fixed inset-x-0 top-0 z-50 hidden h-14 items-center gap-1 border-b border-border bg-background/90 px-6 backdrop-blur lg:flex"
    >
      <Link href="/portal/dashboard" className="mr-4 flex items-center gap-2 no-underline">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-[14px]" aria-hidden>
          🥗
        </span>
        <span className="text-sm font-medium text-ink">Roberto Scrigna</span>
      </Link>
      <div className="flex items-center gap-1">
        {PORTAL_NAV_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm no-underline transition-colors ${
                active ? "bg-brand-wash text-brand-deep" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontWeight: active ? 500 : 400 }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function PortalBottomNav() {
  const pathname = usePathname();
  return (
    <>
      <TopNavBar pathname={pathname} />
      <BottomNavBar pathname={pathname} />
    </>
  );
}
