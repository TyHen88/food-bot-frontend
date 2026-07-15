"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface TopBarProps {
  title: string;
  actions?: ReactNode;
}

export function TopBar({ title, actions }: TopBarProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("fb_theme", next ? "dark" : "light"); } catch (_) {}
    setDark(next);
  }

  return (
    <header
      className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4"
      style={{
        height:        "var(--topbar-h)",
        background:    "var(--surface)",
        borderBottom:  "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <h1 className="flex-1 text-base font-bold tracking-tight" style={{ color: "var(--text)", margin: 0 }}>
        {title}
      </h1>

      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={toggleDark}
          className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
          style={{ background: "transparent", color: "var(--text-muted)" }}
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

/** Desktop page header with dark mode toggle */
export function DesktopHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("fb_theme", next ? "dark" : "light"); } catch (_) {}
    setDark(next);
  }

  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={toggleDark}
          className="hidden md:flex w-9 h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] transition-colors hover:bg-[var(--surface-2)] cursor-pointer"
          style={{ background: "transparent", color: "var(--text-muted)" }}
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </div>
  );
}
