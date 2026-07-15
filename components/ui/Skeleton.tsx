import { clsx } from "clsx";

interface SkeletonProps { className?: string; }

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx("rounded-[var(--radius-md)] animate-pulse", className)}
      style={{ background: "var(--surface-2)" }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="p-4 rounded-[var(--radius-lg)] space-y-3" style={{ background: "var(--surface)" }}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-6 w-14 rounded-full" />
    </div>
  );
}
