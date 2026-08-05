import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "elevated" | "flat";
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5 sm:p-6",
};

export function Card({
  children,
  variant = "default",
  padding = "md",
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-[var(--radius-lg)] transition-shadow duration-200",
        paddingMap[padding],
        variant === "default"  && "shadow-[var(--shadow-sm)]",
        variant === "elevated" && "shadow-[var(--shadow-md)]",
        variant === "flat"     && "border border-[var(--border)]",
        className
      )}
      style={{ background: "var(--surface)" }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Stat card: icon + value + label */
export function StatCard({
  icon,
  value,
  label,
  color = "primary",
  padding = "sm",
  className,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  color?: "primary" | "accent" | "success" | "warning";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    primary: "var(--color-primary)",
    accent:  "var(--color-accent)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
  };
  const bgMap: Record<string, string> = {
    primary: "var(--color-primary-light)",
    accent:  "var(--color-accent-light)",
    success: "var(--color-success-light)",
    warning: "var(--color-warning-light)",
  };

  return (
    <Card variant="default" padding={padding} className={clsx("flex items-center gap-2.5", className)}>
      <div
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-[var(--radius-md)] flex-shrink-0 text-sm"
        style={{ background: bgMap[color], color: colorMap[color] }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base sm:text-lg font-bold tracking-tight truncate leading-tight" style={{ color: "var(--text)" }}>
          {value}
        </div>
        <div className="text-[10px] sm:text-xs font-medium truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
          {label}
        </div>
      </div>
    </Card>
  );
}
