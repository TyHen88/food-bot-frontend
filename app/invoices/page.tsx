"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  const visibleInvoices = useMemo(
    () => invoices.filter(inv =>
      (!fromDate || inv.order_date >= fromDate) &&
      (!toDate || inv.order_date <= toDate)
    ),
    [invoices, fromDate, toDate]
  );

  const stats = useMemo(() => ({
    orders: visibleInvoices.length,
    amount: visibleInvoices.reduce((s, inv) => s + (inv.total ?? 0), 0),
    mine: visibleInvoices.reduce((s, inv) => s + (inv.my_amount ?? 0), 0),
  }), [visibleInvoices]);

  // Pagination is render-only: the cards above always cover the whole
  // filtered range. Picking a new range starts back at the first page.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate]);
  const shownInvoices = visibleInvoices.slice(0, visibleCount);

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
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
          <Card variant="default" padding="sm" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <ShoppingBag size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-xl font-bold leading-tight truncate" style={{ color: "var(--text)" }}>
                {loading ? "…" : stats.orders}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Total Orders</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
              <Wallet size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-xl font-bold leading-tight truncate font-mono" style={{ color: "var(--text)" }}>
                {loading ? "…" : `$${stats.amount.toFixed(2)}`}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>Total Amount</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              <User size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-xl font-bold leading-tight truncate font-mono" style={{ color: "var(--color-primary)" }}>
                {loading ? "…" : `$${stats.mine.toFixed(2)}`}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>My Amount</div>
            </div>
          </Card>
        </div>

        {/* Date-range filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[128px] sm:max-w-[180px]">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              aria-label="From date"
              className="w-full pl-9 pr-2 py-2 text-xs font-medium rounded-[var(--radius-md)] border focus:outline-none focus:ring-1 cursor-pointer"
              style={{ background: "var(--surface)", color: fromDate ? "var(--text)" : "var(--text-muted)", borderColor: "var(--border)" }}
            />
          </div>
          <span className="text-[10px] font-semibold shrink-0" style={{ color: "var(--text-muted)" }}>to</span>
          <div className="relative flex-1 min-w-[128px] sm:max-w-[180px]">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              aria-label="To date"
              className="w-full pl-9 pr-2 py-2 text-xs font-medium rounded-[var(--radius-md)] border focus:outline-none focus:ring-1 cursor-pointer"
              style={{ background: "var(--surface)", color: toDate ? "var(--text)" : "var(--text-muted)", borderColor: "var(--border)" }}
            />
          </div>
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)]"
              style={{ background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {loading ? (
          <Card padding="md">
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          </Card>
        ) : visibleInvoices.length === 0 ? (
          (fromDate || toDate) ? (
            <EmptyState
              icon={<Receipt size={40} />}
              title="No invoices in this range"
              description="Nothing was invoiced in the selected dates. Try a different range or clear the filter."
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
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {inv.order_date} · {inv.person_count} {inv.person_count === 1 ? "person" : "people"}
                      {inv.payer_name ? ` · 💳 ${inv.payer_name}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono shrink-0" style={{ color: "var(--color-primary)" }}>
                    ${(inv.total ?? 0).toFixed(2)}
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
