"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/applications", label: "Applications", icon: BriefcaseBusiness },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/reminders", label: "Reminders", icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "DELETE" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-900 px-4 py-6 text-slate-300 md:flex">
      <Link href="/" className="mb-10 flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-bold text-white shadow-lg shadow-brand-500/30">
          AT
        </span>
        <span className="text-base font-bold tracking-tight text-white">
          ApplyTrack
        </span>
      </Link>

      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        Menu
      </p>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-white/10 text-white shadow-inner"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs leading-relaxed text-slate-400">
        <p className="font-semibold text-white">Chrome Extension</p>
        <p className="mt-1">
          Load the <code className="rounded bg-white/10 px-1 text-slate-200">extension/</code>{" "}
          folder in <code className="rounded bg-white/10 px-1 text-slate-200">chrome://extensions</code>{" "}
          to auto-capture applications.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-[18px] w-[18px]" />
        Log out
      </button>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden">
      <div className="flex items-center gap-2.5 bg-ink-900 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-white">
          AT
        </span>
        <span className="text-sm font-bold tracking-tight text-white">
          ApplyTrack
        </span>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium",
                active ? "bg-brand-50 text-brand-700" : "text-slate-600",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
