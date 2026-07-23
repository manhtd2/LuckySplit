"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarClock, PlusCircle, History } from "lucide-react";
import { Logo } from "./Logo";
import { WalletCard } from "./WalletCard";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/events", label: "My Events", icon: CalendarClock },
  { href: "/dashboard/create", label: "Create Event", icon: PlusCircle },
  { href: "/dashboard/history", label: "History", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between border-r border-white/8 px-4 py-6">
      <div>
        <div className="px-2 mb-8">
          <Logo />
        </div>
        <nav className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-to-r from-violet/25 to-magenta/25 text-white border border-violet/30"
                    : "text-muted hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white font-medium">Arc Testnet</span>
          <span className="flex items-center gap-1.5 text-green text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> Connected
          </span>
        </div>
        <WalletCard compact />
        <button
          onClick={logout}
          className="w-full rounded-lg border border-white/10 py-2 text-xs font-medium text-muted hover:text-white hover:bg-white/5 transition"
        >
          Switch profile
        </button>
      </div>
    </aside>
  );
}
