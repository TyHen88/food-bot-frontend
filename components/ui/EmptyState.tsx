import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-3">
      {icon && (
        <div className="text-5xl mb-1 opacity-60">{icon}</div>
      )}
      <p className="text-base font-semibold" style={{ color: "var(--text)" }}>{title}</p>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
