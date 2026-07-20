"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import {
  Activity,
  Bell,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  Receipt,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Oggi", icon: LayoutDashboard },
  { href: "/clients", label: "Atleti", icon: Users },
  { href: "/plans", label: "Piani", icon: ClipboardList },
  { href: "/plans/new", label: "Nuovo atleta", icon: UserPlus },
  { href: "/invoices", label: "Fatturazione", icon: Receipt },
  { href: "/monitoring", label: "Monitoraggio", icon: Activity },
  { href: "/monitoring/training", label: "Allenamenti", icon: Dumbbell },
  { href: "/monitoring/notifications", label: "Notifiche", icon: Bell },
  { href: "/settings", label: "Impostazioni", icon: Settings },
] as const;

interface SidebarProps {
  partnerName: string;
  onNavigate?: () => void;
}

export function Sidebar({ partnerName, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-line-2 bg-secondary">
      {/* Brand */}
      <div className="px-6 pb-6 pt-6">
        <div className="font-display text-[18px] font-semibold text-ink">Scrigna</div>
        <div className="text-xs text-ink-3">Nutrizione Sportiva</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" &&
              href !== "/plans/new" &&
              pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border border-border bg-card text-ink"
                  : "border border-transparent text-muted-foreground hover:bg-card hover:text-ink"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-line-2 px-4 py-4">
        <div className="mb-3 truncate text-sm font-medium text-ink">
          {partnerName}
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-ink"
        >
          Esci
        </button>
      </div>
    </aside>
  );
}
