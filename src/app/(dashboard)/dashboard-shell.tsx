"use client";

import { useState, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";

interface DashboardShellProps {
  partnerName: string;
  children: React.ReactNode;
}

export function DashboardShell({ partnerName, children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — always visible at lg+ */}
      <div className="hidden lg:flex lg:shrink-0">
        <Sidebar partnerName={partnerName} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar — slides in */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col transition-transform duration-200 ease-in-out lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar partnerName={partnerName} onNavigate={closeSidebar} />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center gap-4 border-b border-zinc-200 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            aria-label="Apri menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">
            Roberto Scrigna
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-zinc-50 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
