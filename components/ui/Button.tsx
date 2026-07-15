import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "accent";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-[var(--radius-md)] " +
    "transition-all duration-150 cursor-pointer select-none focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed " +
    "active:scale-[0.97] border-0";

  const variants: Record<string, string> = {
    primary:   "bg-[var(--color-primary)]   text-white hover:bg-[var(--color-primary-hover)]",
    accent:    "bg-[var(--color-accent)]    text-white hover:bg-[var(--color-accent-hover)]",
    danger:    "bg-[var(--color-danger)]    text-white hover:opacity-90",
    secondary: "text-[var(--text)] hover:bg-[var(--surface-2)] border border-[var(--border)] bg-[var(--surface)]",
    ghost:     "text-[var(--text-muted)] hover:bg-[var(--surface-2)] bg-transparent",
  };

  const sizes: Record<string, string> = {
    sm: "h-8  px-3 text-xs rounded-[var(--radius-sm)]",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], fullWidth && "w-full", className)}
      disabled={disabled || loading}
      style={variant === "primary" || variant === "accent" || variant === "danger"
        ? { background: variant === "primary" ? "var(--color-primary)"
            : variant === "accent" ? "var(--color-accent)" : "var(--color-danger)" }
        : undefined}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}
