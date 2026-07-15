import { clsx } from "clsx";

type BadgeVariant = "default" | "admin" | "member" | "active" | "inactive" | "success" | "warning" | "danger" | "primary" | "accent";

const styles: Record<BadgeVariant, { bg: string; text: string }> = {
  default:  { bg: "var(--surface-2)",           text: "var(--text-muted)" },
  admin:    { bg: "var(--color-primary-light)",  text: "var(--color-primary)" },
  member:   { bg: "var(--surface-2)",            text: "var(--text-2)" },
  active:   { bg: "var(--color-success-light)",  text: "var(--color-success)" },
  inactive: { bg: "var(--surface-2)",            text: "var(--text-muted)" },
  success:  { bg: "var(--color-success-light)",  text: "var(--color-success)" },
  warning:  { bg: "var(--color-warning-light)",  text: "var(--color-warning)" },
  danger:   { bg: "var(--color-danger-light)",   text: "var(--color-danger)" },
  primary:  { bg: "var(--color-primary-light)",  text: "var(--color-primary)" },
  accent:   { bg: "var(--color-accent-light)",   text: "var(--color-accent)" },
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const { bg, text } = styles[variant];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        className
      )}
      style={{ background: bg, color: text }}
    >
      {children}
    </span>
  );
}
