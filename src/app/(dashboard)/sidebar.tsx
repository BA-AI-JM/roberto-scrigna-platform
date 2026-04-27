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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clienti", icon: Users },
  { href: "/plans", label: "Piani", icon: ClipboardList },
  { href: "/plans/new", label: "Nuovo Cliente", icon: UserPlus },
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
    <aside className="flex h-full w-64 flex-col border-r border-zinc-200 bg-white">
      {/* Brand */}
      <div className="border-b border-zinc-200 px-6 py-5">
        <div className="text-lg font-bold tracking-tight text-zinc-900">
          Roberto Scrigna
        </div>
        <div className="text-xs text-zinc-400">Nutrition & Performance</div>
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
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-200 px-4 py-4">
        <div className="mb-3 truncate text-sm font-medium text-zinc-700">
          {partnerName}
        </div>
        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
        >
          Esci
        </button>
      </div>
    </aside>
  );
}
