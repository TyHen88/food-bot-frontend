"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, Users, Settings, CalendarClock,
} from "lucide-react";
import { clsx } from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { hapticImpact } from "@/lib/telegram";

const NAV = [
  { href: "/",         icon: LayoutDashboard, label: "Dashboard" },
  { href: "/orders",   icon: ShoppingBag,     label: "Orders" },
  { href: "/schedule", icon: CalendarClock,   label: "Schedule", adminOnly: true },
  { href: "/members",  icon: Users,           label: "Members" },
  { href: "/settings", icon: Settings,        label: "Settings", adminOnly: true },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin, loading } = useAuth();

  const visible = NAV.filter(n => !n.adminOnly || isAdmin);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="flex items-stretch"
        style={{ height: "var(--bottom-nav-h)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {!loading && visible.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => hapticImpact("light")}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-1 pb-1 transition-all duration-150 active:scale-90",
                active ? "opacity-100" : "opacity-50 hover:opacity-75"
              )}
              style={{
                color: active ? "var(--color-primary)" : "var(--text-muted)",
                textDecoration: "none",
              }}
            >
              <div
                className={clsx(
                  "flex items-center justify-center w-8 h-6 rounded-full transition-all duration-200",
                  active && "bg-[var(--color-primary-light)]"
                )}
              >
                <Icon size={active ? 20 : 18} strokeWidth={active ? 2.5 : 1.8} />
              </div>
              <span className={clsx("text-[10px] font-semibold leading-none", active && "font-bold")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
