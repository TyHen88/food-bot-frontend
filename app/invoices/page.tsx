"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Receipt, ChevronRight, ChevronDown, Calendar, X, ShoppingBag, Wallet, User } from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar, DesktopHeader } from "@/components/layout/TopBar";
import { InvoiceViewModal } from "@/components/orders/InvoiceViewModal";

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  payer_name: string;
  person_count: number;
  sent_count: number;
  last_sent_at: string;
  /** The signed-in caller's own share of this invoice (computed server-side). */
  my_amount?: number;
  /** Riel equivalents, converted at the rate PINNED to this invoice when it
   *  was sent — not today's rate, so historical amounts never move. Null on
   *  invoices sent before exchange rates were recorded. */
  my_amount_khr?: number | null;
  total_khr?: number | null;
  usd_khr_rate?: number;
  rate_date?: string;
}

/** "56,700៛", or null when this invoice has no pinned rate. */
function khr(amount?: number | null): string | null {
  return amount === null || amount === undefined
    ? null
    : `${Math.round(amount).toLocaleString("en-US")}៛`;
}

/** Rows rendered initially and added per "Load more" click. */
const PAGE_SIZE = 15;

export default function InvoicesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // order_date is "yyyy-MM-dd", so plain string comparison sorts correctly.
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");

  // order_date is "yyyy-MM-dd", so plain string comparison sorts correctly.
  const visibleInvoices = useMemo(
    () => invoices.filter(inv => {
      if (fromDate && inv.order_date < fromDate) return false;
      if (toDate && inv.order_date > toDate) return false;
      if (scopeFilter === "mine" && (!inv.my_amount || inv.my_amount <= 0)) return false;
      return true;
    }),
    [invoices, fromDate, toDate, scopeFilter]
  );

  // Riel totals sum the per-invoice riel amounts rather than converting the
  // dollar total once: each invoice was pinned to its own rate, so there is
  // no single rate that could convert the range correctly.
  const stats = useMemo(() => ({
    orders: visibleInvoices.length,
    amount: visibleInvoices.reduce((s, inv) => s + (inv.total ?? 0), 0),
    mine: visibleInvoices.reduce((s, inv) => s + (inv.my_amount ?? 0), 0),
    amountKhr: visibleInvoices.reduce((s, inv) => s + (inv.total_khr ?? 0), 0),
    mineKhr: visibleInvoices.reduce((s, inv) => s + (inv.my_amount_khr ?? 0), 0),
  }), [visibleInvoices]);

  // Pagination state & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate, scopeFilter]);
  const shownInvoices = visibleInvoices.slice(0, visibleCount);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleInvoices.length > visibleCount) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleInvoices.length, visibleCount]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<InvoiceRow[]>(`/invoices${chatIdQuery(true)}`);
      setInvoices(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Wait for AuthContext (it sets the initData auth header) before fetching.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading]);

  return (
    <>
      <TopBar title="Invoices" />
      <main className="page-content">
        <DesktopHeader title="Invoices" subtitle="Sent order invoices" />

        {/* Count cards — reflect the current date range */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-4">
          <Card variant="default" padding="sm" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <ShoppingBag size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-xl font-bold leading-tight truncate" style={{ color: "var(--text)" }}>
                {loading ? "…" : stats.orders}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold truncate" style={{ color: "var(--text-muted)" }}>Total Orders</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
              <Wallet size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-xl font-bold leading-tight truncate font-mono" style={{ color: "var(--text)" }}>
                {loading ? "…" : `$${stats.amount.toFixed(2)}`}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold truncate" style={{ color: "var(--text-muted)" }}>
                Total Amount{!loading && stats.amountKhr > 0 && ` · ${khr(stats.amountKhr)}`}
              </div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="col-span-2 lg:col-span-1 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              <User size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-xl font-bold leading-tight truncate font-mono" style={{ color: "var(--color-primary)" }}>
                {loading ? "…" : `$${stats.mine.toFixed(2)}`}
              </div>
              <div className="text-[10px] sm:text-xs font-semibold truncate" style={{ color: "var(--text-muted)" }}>
                My Amount{!loading && stats.mineKhr > 0 && ` · ${khr(stats.mineKhr)}`}
              </div>
            </div>
          </Card>
        </div>

        {/* Date-range filter & Scope Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
          <div className="flex items-center gap-1.5 bg-[var(--surface-2)] p-1 rounded-[var(--radius-md)] border border-[var(--border)] self-start">
            <button
              onClick={() => setScopeFilter("all")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                scopeFilter === "all"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-sm font-bold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              All Invoices
            </button>
            <button
              onClick={() => setScopeFilter("mine")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                scopeFilter === "mine"
                  ? "bg-[var(--color-primary)] text-white shadow-sm font-bold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              My Invoices Only
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                aria-label="From date"
                className="w-full pl-8 pr-2 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px] sm:w-36"
              />
            </div>
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                aria-label="To date"
                className="w-full pl-8 pr-2 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px] sm:w-36"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(""); setToDate(""); }}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] shrink-0 min-h-[38px]"
                style={{ background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <Card padding="md">
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          </Card>
        ) : visibleInvoices.length === 0 ? (
          (fromDate || toDate || scopeFilter === "mine") ? (
            <EmptyState
              icon={<Receipt size={40} />}
              title="No invoices found"
              description="No invoices match the selected filter options."
            />
          ) : (
            <EmptyState
              icon={<Receipt size={40} />}
              title="No invoices yet"
              description="Invoices appear here after an admin sends one from the Orders page."
            />
          )
        ) : (
          <div className="space-y-2 animate-fade-in">
            {shownInvoices.map(inv => (
              <Card
                key={inv.invoice_id}
                variant="default"
                padding="sm"
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setViewId(inv.invoice_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                    <Receipt size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                        {inv.chat_title || `Order ${inv.order_id.slice(-6)}`}
                      </p>
                      {inv.sent_count > 1 && (
                        <Badge variant="default" className="text-[10px] shrink-0">×{inv.sent_count}</Badge>
                      )}
                      {inv.my_amount && inv.my_amount > 0 ? (
                        <Badge variant="admin" className="text-[10px] shrink-0 font-bold">
                          My Share: ${inv.my_amount.toFixed(2)}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px] shrink-0">
                          Not in order
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {inv.order_date} · {inv.person_count} {inv.person_count === 1 ? "person" : "people"}
                      {inv.payer_name ? ` · 💳 ${inv.payer_name}` : ""}
                    </p>
                  </div>
                  <span className="text-right shrink-0">
                    <span className="text-sm font-bold font-mono block text-[var(--text)]">
                      Total: ${(inv.total ?? 0).toFixed(2)}
                    </span>
                    {khr(inv.total_khr) && (
                      <span className="text-[10px] font-mono block" style={{ color: "var(--text-muted)" }}>
                        {khr(inv.total_khr)}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                </div>
              </Card>
            ))}

            {visibleInvoices.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
              >
                <ChevronDown size={14} />
                Load more ({visibleInvoices.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </main>

      <InvoiceViewModal
        invoiceId={viewId}
        open={!!viewId}
        onClose={() => setViewId(null)}
        isAdmin={isAdmin}
        onResent={load}
      />
    </>
  );
}
