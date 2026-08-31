"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { 
  Receipt, 
  ChevronRight, 
  ChevronDown, 
  Calendar, 
  ShoppingBag, 
  Wallet, 
  Landmark, 
  DollarSign, 
  RefreshCw,
  Search
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
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
  my_amount?: number;
  my_paid?: boolean;
  my_amount_khr?: number | null;
  total_khr?: number | null;
  usd_khr_rate?: number;
  rate_date?: string;
}

interface ExchangeRateData {
  available: boolean;
  rate_date?: string | null;
  usd_khr?: number | null;
  display?: string | null;
  source?: string | null;
  khr_rounding?: number;
  stale?: boolean;
  today?: string;
}

interface PaginatedInvoicesResponse {
  items: InvoiceRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  stats: {
    orders: number;
    amount: number;
    amountKhr?: number;
    amount_khr?: number;
  };
}

type QuickFilter = "today" | "week" | "month" | "all" | "custom";

const PAGE_SIZE = 10;

/** Convert USD to KHR with rounding to nearest note */
function toKhr(usd: number, rate = 4047, rounding = 100): number {
  const exact = (usd || 0) * (rate || 4047);
  if (rounding && rounding > 1) {
    return Math.round(exact / rounding) * rounding;
  }
  return Math.round(exact);
}

/** Format KHR with thousands separator and riel symbol */
function formatKhr(amount?: number | null): string {
  if (amount === null || amount === undefined) return "0៛";
  return `${Math.round(amount).toLocaleString("en-US")}៛`;
}

export default function InvoicesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [rateInfo, setRateInfo] = useState<ExchangeRateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ orders: 0, amount: 0, amountKhr: 0 });
  const [viewId, setViewId] = useState<string | null>(null);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const observerTarget = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async (pageNum = 1, isAppend = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("page_size", String(PAGE_SIZE));
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const [invoicesRes, exchangeRateRes] = await Promise.all([
        api.get<PaginatedInvoicesResponse | InvoiceRow[]>(`/invoices?${params.toString()}${chatIdQuery()}`),
        api.get<ExchangeRateData>(`/exchange-rate${chatIdQuery()}`).catch(() => null),
      ]);

      if (exchangeRateRes) {
        setRateInfo(exchangeRateRes);
      }

      if (invoicesRes && "items" in invoicesRes) {
        const fetched = invoicesRes.items || [];
        setInvoices((prev) => (isAppend ? [...prev, ...fetched] : fetched));
        setTotalCount(invoicesRes.total ?? 0);
        setTotalPages(invoicesRes.total_pages ?? 1);
        setPage(invoicesRes.page ?? pageNum);
        if (invoicesRes.stats) {
          const sysRate = exchangeRateRes?.usd_khr || 4047;
          const totalAmt = invoicesRes.stats.amount ?? 0;
          const amtKhr = invoicesRes.stats.amount_khr ?? invoicesRes.stats.amountKhr ?? toKhr(totalAmt, sysRate);
          setStats({
            orders: invoicesRes.stats.orders ?? 0,
            amount: totalAmt,
            amountKhr: amtKhr,
          });
        }
      } else if (Array.isArray(invoicesRes)) {
        setInvoices(invoicesRes);
        setTotalCount(invoicesRes.length);
        setTotalPages(1);
        const sysRate = exchangeRateRes?.usd_khr || 4047;
        const totalAmt = invoicesRes.reduce((s, i) => s + (i.total || 0), 0);
        setStats({
          orders: invoicesRes.length,
          amount: totalAmt,
          amountKhr: toKhr(totalAmt, sysRate),
        });
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fromDate, toDate, searchQuery, toast]);

  useEffect(() => {
    if (authLoading) return;
    setPage(1);
    loadData(1, false);
  }, [loadData, authLoading, fromDate, toDate, searchQuery]);

  function handleQuickFilter(type: QuickFilter) {
    setQuickFilter(type);
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (type === "today") {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === "week") {
      const start = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      setFromDate(start);
      setToDate(todayStr);
    } else if (type === "month") {
      const start = format(startOfMonth(new Date()), "yyyy-MM-dd");
      setFromDate(start);
      setToDate(todayStr);
    } else if (type === "all") {
      setFromDate("");
      setToDate("");
    }
  }

  const loadMore = useCallback(() => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadData(nextPage, true);
  }, [loading, loadingMore, page, totalPages, loadData]);

  // Infinite Scroll Trigger
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page < totalPages && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [page, totalPages, loading, loadingMore, loadMore]);

  const activeRate = rateInfo?.usd_khr || 4047;
  const rateDisplay = rateInfo?.display || `${activeRate.toLocaleString()} KHR / USD`;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <TopBar title="Invoices" />
      <main className="page-content max-w-4xl mx-auto px-3.5 sm:px-4 pt-3.5 space-y-3.5">
        <DesktopHeader title="Invoices" subtitle="Sent order invoices & billing overview" />

        {/* 1. Date Filter & Tab Bar */}
        <Card variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none flex-1">
              {[
                { id: "all", label: "All Time" },
                { id: "week", label: "This Week" },
                { id: "month", label: "This Month" },
                { id: "today", label: "Today" },
              ].map((tab) => {
                const isActive = quickFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleQuickFilter(tab.id as QuickFilter)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer ${
                      isActive
                        ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
              {quickFilter === "custom" && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/30 whitespace-nowrap">
                  Custom Range
                </span>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(1, false)}
              disabled={loading}
              className="shrink-0 w-8.5 h-8.5 p-0 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--surface-2)] active:scale-95 transition-all"
              title="Refresh Invoices"
              aria-label="Refresh Invoices"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-[var(--color-primary)]" : "text-[var(--text-2)]"} />
            </Button>
          </div>

          {/* Compact Date Range Pickers */}
          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-[var(--border)]">
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setQuickFilter("custom");
                }}
                aria-label="From Date"
                className="w-full pl-8 pr-2 py-1 text-xs rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer h-8"
              />
            </div>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setQuickFilter("custom");
                }}
                aria-label="To Date"
                className="w-full pl-8 pr-2 py-1 text-xs rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer h-8"
              />
            </div>
          </div>
        </Card>

        {/* 2. Distinct USD ($) and KHR (៛) Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card 1: Total Orders */}
          <Card variant="default" padding="sm" className="flex items-center gap-2.5 border border-[var(--border)]">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-extrabold text-[var(--text)] leading-tight truncate">
                {loading ? "…" : `${stats.orders} orders`}
              </div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">
                Total Invoiced
              </div>
            </div>
          </Card>

          {/* Card 2: USD Summary */}
          <Card variant="default" padding="sm" className="flex items-center gap-2.5 border border-[var(--border)]">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <DollarSign size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-extrabold text-[var(--color-primary)] leading-tight truncate font-mono">
                {loading ? "…" : `$${stats.amount.toFixed(2)}`}
              </div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">
                USD Total Amount
              </div>
            </div>
          </Card>

          {/* Card 3: KHR Summary */}
          <Card variant="default" padding="sm" className="flex items-center gap-2.5 border border-[var(--border)]">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
              <Landmark size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm sm:text-base font-extrabold text-[var(--color-accent)] leading-tight truncate font-mono">
                {loading ? "…" : formatKhr(stats.amountKhr)}
              </div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate flex items-center justify-between">
                <span>KHR Total</span>
                <span className="font-normal text-[var(--text-2)]">{rateDisplay}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* 3. Invoices List */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold tracking-tight text-[var(--text-muted)] uppercase">
              Sent Invoices ({invoices.length})
            </h2>
            <span className="text-[10px] text-[var(--text-muted)]">
              Rate: {rateDisplay}
            </span>
          </div>

          {loading ? (
            <Card padding="md" className="space-y-2.5 border border-[var(--border)]">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt size={36} />}
              title="No invoices found"
              description="Invoices appear here after an order invoice is sent."
            />
          ) : (
            <div className="space-y-2 animate-fade-in">
              {invoices.map((inv) => {
                const myShare = inv.my_amount ?? 0;
                const invRate = inv.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : activeRate;
                const invTotalKhr = inv.total_khr && inv.total_khr > 0 ? inv.total_khr : toKhr(inv.total, invRate);
                const myShareKhr = inv.my_amount_khr && inv.my_amount_khr > 0 ? inv.my_amount_khr : (myShare > 0 ? toKhr(myShare, invRate) : null);

                return (
                  <Card
                    key={inv.invoice_id}
                    variant="default"
                    padding="sm"
                    className="cursor-pointer hover:border-[var(--color-primary-light)] transition-all border border-[var(--border)]"
                    onClick={() => setViewId(inv.invoice_id)}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}
                      >
                        <Receipt size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold truncate text-[var(--text)]">
                            {inv.chat_title || `Order #${inv.order_id.slice(-6)}`}
                          </p>
                          {inv.sent_count > 1 && (
                            <Badge variant="default" className="text-[9px] px-1.5 py-0.2 shrink-0">
                              ×{inv.sent_count} sent
                            </Badge>
                          )}
                          {myShare > 0 ? (
                            <Badge variant="admin" className="text-[10px] px-1.5 py-0.2 shrink-0 font-bold">
                              My Share: ${myShare.toFixed(2)} {myShareKhr ? `(${formatKhr(myShareKhr)})` : ""}
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-[9px] px-1.5 py-0.2 shrink-0">
                              Not in order
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] truncate text-[var(--text-muted)] mt-0.5">
                          {inv.order_date} · {inv.person_count} {inv.person_count === 1 ? "person" : "people"}
                          {inv.payer_name ? ` · 💳 Payer: ${inv.payer_name}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-extrabold font-mono block text-[var(--color-primary)]">
                          ${(inv.total ?? 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold font-mono block text-[var(--color-accent)] leading-none mt-0.5">
                          {formatKhr(invTotalKhr)}
                        </span>
                      </div>
                      <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                    </div>
                  </Card>
                );
              })}

              {page < totalPages && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={13} className={loadingMore ? "animate-spin" : "animate-bounce"} />
                    {loadingMore ? "Loading more..." : `Load more (${totalCount - invoices.length} remaining)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <InvoiceViewModal
        invoiceId={viewId}
        open={!!viewId}
        onClose={() => setViewId(null)}
        isAdmin={isAdmin}
        onResent={() => loadData(1, false)}
      />
    </div>
  );
}
