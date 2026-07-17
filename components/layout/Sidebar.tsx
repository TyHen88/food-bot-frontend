"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, BookTemplate, CalendarClock,
  Users, Settings, History, ChevronLeft, ChevronRight, UtensilsCrossed, Receipt,
} from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/",          icon: <LayoutDashboard size={18} />, label: "Dashboard" },
  { href: "/orders",    icon: <ShoppingBag size={18} />,     label: "Orders" },
  { href: "/invoices",  icon: <Receipt size={18} />,         label: "Invoices" },
  { href: "/templates", icon: <BookTemplate size={18} />,    label: "Templates", adminOnly: true },
  { href: "/schedule",  icon: <CalendarClock size={18} />,   label: "Schedule",  adminOnly: true },
  { href: "/members",   icon: <Users size={18} />,           label: "Members" },
  { href: "/settings",  icon: <Settings size={18} />,        label: "Settings",  adminOnly: true },
  { href: "/history",   icon: <History size={18} />,         label: "History",   adminOnly: true },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { isAdmin, user, profile, loading } = useAuth();

  const visibleNav = NAV.filter(n => !n.adminOnly || isAdmin);
  const name = user?.first_name
    ? [user.first_name, user?.last_name].filter(Boolean).join(" ")
    : profile?.full_name ?? "User";

  return (
    <aside
      className={clsx(
        "hidden md:flex flex-col sticky top-0 h-screen transition-all duration-300 ease-in-out flex-shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
      style={{
        background:  "var(--surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 h-16 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--color-primary)", color: "#fff" }}
        >
          <UtensilsCrossed size={16} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <span className="font-bold text-sm tracking-tight" style={{ color: "var(--text)" }}>
              Food Bot
            </span>
            <span className="block text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
              Admin Panel
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {!collapsed && (
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Navigation
          </p>
        )}
        {visibleNav.map(({ href, icon, label, adminOnly }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-[var(--radius-md)] transition-all duration-150 group",
                collapsed ? "h-10 w-10 justify-center mx-auto" : "h-10 px-3",
                active
                  ? "font-semibold"
                  : "font-medium hover:bg-[var(--surface-2)]"
              )}
              style={{
                color: active ? "var(--color-primary)" : "var(--text-2)",
                background: active ? "var(--color-primary-light)" : "transparent",
                textDecoration: "none",
              }}
              title={collapsed ? label : undefined}
            >
              <span className="flex-shrink-0">{icon}</span>
              {!collapsed && (
                <span className="text-sm truncate flex-1">{label}</span>
              )}
              {!collapsed && adminOnly && !loading && isAdmin && (
                <Badge variant="admin" className="text-[9px] px-1.5 py-0">
                  Admin
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: user + collapse button */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium transition-colors hover:bg-[var(--surface-2)] border-0 cursor-pointer"
          style={{ color: "var(--text-muted)", background: "transparent" }}
        >
          {collapsed ? <ChevronRight size={14} /> : (
            <>
              <ChevronLeft size={14} />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* User */}
        {!collapsed && (
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{name}</p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                {isAdmin ? "Administrator" : "Member"}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
