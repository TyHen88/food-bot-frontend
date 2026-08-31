"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { 
  ShoppingBag, 
  Wallet, 
  RefreshCw, 
  Utensils, 
  CreditCard, 
  ChevronDown, 
  Calendar,
  DollarSign,
  Landmark,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { 
  getInvoiceFromCache, 
  type Invoice, 
  type InvoiceDetailEntry 
} from "@/lib/invoiceCache";
import { InvoiceViewModal } from "@/components/orders/InvoiceViewModal";
import type { Order, OrderItem } from "@/components/orders/OrderItemsEditor";

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  payer_name: string;
  payer_user_id?: string;
  my_amount?: number;
  my_paid?: boolean;
  my_amount_khr?: number | null;
  usd_khr_rate?: number;
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
function formatKhr(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")}៛`;
}

export default function MyOrdersPage() {
  const { user, profile, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [rateInfo, setRateInfo] = useState<ExchangeRateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("week");
  const [fromDate, setFromDate] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Normalization helpers for user matching
  const myUserId = useMemo(() => {
    return String(user?.id || profile?.user_id || "").trim();
  }, [user?.id, profile?.user_id]);

  const normName = useCallback((str?: unknown): string => {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
  }, []);

  const myNames = useMemo(() => {
    const set = new Set<string>();
    if (profile && "name" in profile && typeof profile.name === "string") set.add(normName(profile.name));
    if (profile?.username) set.add(normName(profile.username));
    if (profile?.full_name) set.add(normName(profile.full_name));
    if (user?.username) set.add(normName(user.username));
    if (user?.first_name) set.add(normName(user.first_name));
    if (user?.last_name) set.add(normName(user.last_name));
    const combined = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
    if (combined) set.add(normName(combined));
    return set;
  }, [profile, user, normName]);

  const isMyIdentity = useCallback((userId?: unknown, userName?: unknown): boolean => {
    const uidStr = String(userId || "").trim();
    if (uidStr) {
      return Boolean(myUserId) && uidStr === myUserId;
    }
    const nameStr = normName(userName);
    if (!nameStr) return false;
    return myNames.has(nameStr);
  }, [myUserId, myNames, normName]);

  const isMyItem = useCallback((it: OrderItem): boolean => {
    return isMyIdentity(it.user_id, it.name);
  }, [isMyIdentity]);

  // Load orders, invoices, and official NBC exchange rate
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orderParams = new URLSearchParams();
      const invoiceParams = new URLSearchParams();
      if (fromDate) {
        orderParams.set("from", fromDate);
        invoiceParams.set("from", fromDate);
      }
      if (toDate) {
        orderParams.set("to", toDate);
        invoiceParams.set("to", toDate);
      }
      orderParams.set("my_only", "true");

      const [ordersData, invoicesData, exchangeRateData] = await Promise.all([
        api.get<Order[] | { items: Order[] }>(`/orders?${orderParams.toString()}${chatIdQuery()}`),
        api.get<InvoiceRow[] | { items: InvoiceRow[] }>(`/invoices?${invoiceParams.toString()}${chatIdQuery()}`),
        api.get<ExchangeRateData>(`/exchange-rate${chatIdQuery()}`).catch(() => null),
      ]);

      const fetchedOrders = Array.isArray(ordersData)
        ? ordersData
        : ordersData && "items" in ordersData && Array.isArray(ordersData.items)
        ? ordersData.items
        : [];
      const fetchedInvoices = Array.isArray(invoicesData)
        ? invoicesData
        : invoicesData && "items" in invoicesData && Array.isArray(invoicesData.items)
        ? invoicesData.items
        : [];

      setOrders(fetchedOrders);
      setInvoices(fetchedInvoices);
      if (exchangeRateData) {
        setRateInfo(exchangeRateData);
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, toast]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [loadData, authLoading]);

  // Quick filter tab handler
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

  // Filter orders by date, and filter items ONLY to user's items
  const myFilteredOrders = useMemo(() => {
    return orders
      .filter((ord) => {
        if (fromDate && ord.order_date < fromDate) return false;
        if (toDate && ord.order_date > toDate) return false;
        return true;
      })
      .map((ord) => {
        // Keep ONLY my items in this order
        const myItems = (ord.items || []).filter(isMyItem);
        return {
          ...ord,
          myItems,
        };
      })
      .filter((ord) => ord.myItems.length > 0);
  }, [orders, fromDate, toDate, isMyItem]);

  // Pagination state & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate, quickFilter]);
  const shownOrders = useMemo(() => myFilteredOrders.slice(0, visibleCount), [myFilteredOrders, visibleCount]);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && myFilteredOrders.length > visibleCount) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [myFilteredOrders.length, visibleCount]);

  // Invoice map for quick lookup
  const invoiceMapByOrderId = useMemo(() => {
    const map = new Map<string, InvoiceRow>();
    invoices.forEach((inv) => {
      map.set(inv.order_id, inv);
    });
    return map;
  }, [invoices]);

  // Calculate my spend, paid, unpaid debt, item counts, and payer breakdown in USD & KHR
  const statistics = useMemo(() => {
    let totalSpendUSD = 0;
    let totalPaidUSD = 0;
    let totalUnpaidUSD = 0;

    let totalSpendKHR = 0;
    let totalPaidKHR = 0;
    let totalUnpaidKHR = 0;

    let totalItemsCount = 0;
    let paidOrdersCount = 0;
    let unpaidOrdersCount = 0;

    const activeRate = rateInfo?.usd_khr && rateInfo.usd_khr > 0 ? rateInfo.usd_khr : 4047;
    const rounding = rateInfo?.khr_rounding || 100;

    const paidByMap = new Map<string, { 
      totalUSD: number; 
      totalKHR: number; 
      count: number;
      unpaidUSD: number;
      unpaidKHR: number;
      unpaidCount: number;
    }>();

    myFilteredOrders.forEach((ord) => {
      const inv = invoiceMapByOrderId.get(ord.order_id);
      const payerName = inv?.payer_name || ord.paid_by?.username || "Unknown Payer";

      // Pinned rate from invoice or active NBC system rate
      const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : activeRate;

      // Check if invoice detail is cached in memory
      const cachedInv = getInvoiceFromCache(ord.order_id) || (inv?.invoice_id ? getInvoiceFromCache(inv.invoice_id) : undefined);
      let orderMyAmountUSD = 0;
      let orderIsPaid = false;

      if (cachedInv?.details) {
        const myDetail = cachedInv.details.find((d) => isMyIdentity(d.user_id, d.user_name));
        if (myDetail) {
          orderMyAmountUSD = myDetail.subtotal;
          orderIsPaid = Boolean(myDetail.paid);
        }
      } else if (inv?.my_amount !== undefined) {
        orderMyAmountUSD = inv.my_amount;
        orderIsPaid = Boolean(inv.my_paid);
      }

      // KHR equivalent calculation
      const orderMyAmountKHR = (inv?.my_amount_khr && inv.my_amount_khr > 0)
        ? inv.my_amount_khr
        : toKhr(orderMyAmountUSD, orderRate, rounding);

      totalSpendUSD += orderMyAmountUSD;
      totalSpendKHR += orderMyAmountKHR;

      if (ord.has_invoice) {
        if (orderIsPaid) {
          totalPaidUSD += orderMyAmountUSD;
          totalPaidKHR += orderMyAmountKHR;
          paidOrdersCount += 1;
        } else {
          totalUnpaidUSD += orderMyAmountUSD;
          totalUnpaidKHR += orderMyAmountKHR;
          unpaidOrdersCount += 1;
        }
      }

      const orderItemQty = ord.myItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
      totalItemsCount += orderItemQty;

      // Group by who paid
      const currentPayer = paidByMap.get(payerName) || { 
        totalUSD: 0, 
        totalKHR: 0, 
        count: 0,
        unpaidUSD: 0,
        unpaidKHR: 0,
        unpaidCount: 0
      };
      paidByMap.set(payerName, {
        totalUSD: currentPayer.totalUSD + orderMyAmountUSD,
        totalKHR: currentPayer.totalKHR + orderMyAmountKHR,
        count: currentPayer.count + 1,
        unpaidUSD: currentPayer.unpaidUSD + (ord.has_invoice && !orderIsPaid ? orderMyAmountUSD : 0),
        unpaidKHR: currentPayer.unpaidKHR + (ord.has_invoice && !orderIsPaid ? orderMyAmountKHR : 0),
        unpaidCount: currentPayer.unpaidCount + (ord.has_invoice && !orderIsPaid ? 1 : 0),
      });
    });

    const paidByList = Array.from(paidByMap.entries()).map(([name, stat]) => ({
      payerName: name,
      amountUSD: stat.totalUSD,
      amountKHR: stat.totalKHR,
      orderCount: stat.count,
      unpaidUSD: stat.unpaidUSD,
      unpaidKHR: stat.unpaidKHR,
      unpaidCount: stat.unpaidCount,
    }));

    return {
      totalSpendUSD,
      totalPaidUSD,
      totalUnpaidUSD,
      totalSpendKHR,
      totalPaidKHR,
      totalUnpaidKHR,
      totalOrdersCount: myFilteredOrders.length,
      paidOrdersCount,
      unpaidOrdersCount,
      totalItemsCount,
      paidByList,
      rateUsed: activeRate,
      rateDisplay: rateInfo?.display || `${activeRate.toLocaleString()} KHR / USD`,
      rateDate: rateInfo?.rate_date || rateInfo?.today,
    };
  }, [myFilteredOrders, invoiceMapByOrderId, isMyIdentity, rateInfo]);

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* Top Header */}
      <TopBar title="My Orders" />
      
      <div className="max-w-4xl mx-auto px-3.5 sm:px-4 pt-3.5 space-y-3.5">

        {/* 1. Filter Section (Sleek Tab Buttons & Compact Custom Date Range) */}
        <Card variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            {/* Tab Filter Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none flex-1">
              {[
                { id: "week", label: "This Week" },
                { id: "month", label: "This Month" },
                { id: "today", label: "Today" },
                { id: "all", label: "All Time" },
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

            {/* Refresh Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
              className="shrink-0 w-9 h-9 p-0 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--surface-2)] active:scale-95 transition-all"
            >
              <RefreshCw size={19} className={loading ? "animate-spin text-[var(--color-primary)]" : "text-[var(--text-2)]"} />
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

        {/* 2. Separate 2 Cards: USD ($) and KHR (៛) with Live Exchange Rate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Card 1: USD Overview */}
          <Card variant="default" padding="sm" className="space-y-2 border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs">
                  <DollarSign size={13} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  USD Summary ($)
                </span>
              </div>
              <span className="text-sm font-extrabold text-[var(--color-primary)]">
                ${statistics.totalSpendUSD.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                  <CheckCircle2 size={11} className="text-emerald-500" /> Total Paid
                </div>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ${statistics.totalPaidUSD.toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {statistics.paidOrdersCount} orders paid
                </div>
              </div>

              <div className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] ${
                statistics.totalUnpaidUSD > 0.009 
                  ? "bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40" 
                  : "bg-[var(--surface-2)]"
              }`}>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  <AlertCircle size={11} className={statistics.totalUnpaidUSD > 0.009 ? "text-rose-500" : "text-emerald-500"} /> Unpaid Debt
                </div>
                <div className={`text-xs font-bold mt-0.5 ${
                  statistics.totalUnpaidUSD > 0.009 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  ${statistics.totalUnpaidUSD.toFixed(2)}
                </div>
                <div className={`text-[10px] ${
                  statistics.totalUnpaidUSD > 0.009 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-[var(--text-muted)]"
                }`}>
                  {statistics.unpaidOrdersCount > 0 ? `${statistics.unpaidOrdersCount} unpaid` : "All settled"}
                </div>
              </div>
            </div>
          </Card>

          {/* Card 2: KHR Overview */}
          <Card variant="default" padding="sm" className="space-y-2 border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-[var(--radius-sm)] bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center font-bold text-xs">
                  <Landmark size={13} />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  KHR Summary (៛)
                </span>
              </div>
              <span className="text-sm font-extrabold text-[var(--color-accent)]">
                {formatKhr(statistics.totalSpendKHR)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                  <CheckCircle2 size={11} className="text-emerald-500" /> Total Paid
                </div>
                <div className="text-xs font-bold text-[var(--text)] mt-0.5">
                  {formatKhr(statistics.totalPaidKHR)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {statistics.paidOrdersCount} orders paid
                </div>
              </div>

              <div className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] ${
                statistics.totalUnpaidKHR > 0.009 
                  ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40" 
                  : "bg-[var(--surface-2)]"
              }`}>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  <AlertCircle size={11} className={statistics.totalUnpaidKHR > 0.009 ? "text-amber-500" : "text-emerald-500"} /> Unpaid Debt
                </div>
                <div className={`text-xs font-bold mt-0.5 ${
                  statistics.totalUnpaidKHR > 0.009 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  {formatKhr(statistics.totalUnpaidKHR)}
                </div>
                <div className={`text-[10px] ${
                  statistics.totalUnpaidKHR > 0.009 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-[var(--text-muted)]"
                }`}>
                  {statistics.unpaidOrdersCount > 0 ? `${statistics.unpaidOrdersCount} unpaid` : "All settled"}
                </div>
              </div>
            </div>

            {/* Exchange Rate Badge */}
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-0.5">
              <span>🏦 NBC Official Rate</span>
              <span className="font-semibold text-[var(--text-2)]">{statistics.rateDisplay}</span>
            </div>
          </Card>
        </div>

        {/* 3. Secondary Stats & Paid By Aggregation Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Dishes & Order Counts */}
          <Card variant="flat" padding="sm" className="flex items-center gap-2.5 border border-[var(--border)]">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
              <Utensils size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[var(--text)] truncate">
                {statistics.totalItemsCount} dishes
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                Across {statistics.totalOrdersCount} orders {statistics.unpaidOrdersCount > 0 && `(${statistics.unpaidOrdersCount} unpaid)`}
              </div>
            </div>
          </Card>

          {/* Paid By Summary Breakdown */}
          <Card variant="flat" padding="sm" className="sm:col-span-2 space-y-1.5 border border-[var(--border)] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
              <div className="flex items-center gap-1.5">
                <CreditCard size={13} className="text-[var(--color-primary)]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Paid By Summary
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {statistics.paidByList.length} payers
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {statistics.paidByList.length > 0 ? (
                statistics.paidByList.map(({ payerName, amountUSD, amountKHR, orderCount, unpaidCount }) => (
                  <div 
                    key={payerName}
                    className="flex items-center justify-between px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-xs"
                  >
                    <span className="truncate font-medium text-[var(--text)] text-[11px]">{payerName}</span>
                    <div className="text-right ml-1.5 whitespace-nowrap">
                      <span className="font-bold text-[11px] text-[var(--color-primary)]">
                        ${amountUSD.toFixed(2)}
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)] block leading-tight">
                        {formatKhr(amountKHR)} · {orderCount}x {unpaidCount > 0 && <span className="text-rose-500 font-semibold">({unpaidCount} unpaid)</span>}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-[var(--text-muted)] italic py-0.5">No payer records found</p>
              )}
            </div>
          </Card>
        </div>

        {/* 4. Detailed UI List of My Orders */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold tracking-tight text-[var(--text-muted)] uppercase">
              My Order History ({myFilteredOrders.length})
            </h2>
            {statistics.unpaidOrdersCount > 0 && (
              <Badge variant="danger" className="text-[10px] py-0.2 px-2 font-bold">
                {statistics.unpaidOrdersCount} Unpaid Orders
              </Badge>
            )}
          </div>

          {loading ? (
            <Card variant="flat" padding="sm" className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : myFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={28} />}
              title="No Personal Orders Found"
              description="You don't have any food order items matching the selected filters."
            />
          ) : (
            <>
              {shownOrders.map((ord) => {
                const inv = invoiceMapByOrderId.get(ord.order_id);
                const payer = inv?.payer_name || ord.paid_by?.username || "Not assigned";
                const cachedInv = getInvoiceFromCache(ord.order_id) || (inv?.invoice_id ? getInvoiceFromCache(inv.invoice_id) : undefined);

                const myDetail = cachedInv?.details ? cachedInv.details.find((d) => isMyIdentity(d.user_id, d.user_name)) : null;
                let myOrderSubtotal = 0;
                if (myDetail) {
                  myOrderSubtotal = myDetail.subtotal;
                } else if (inv?.my_amount) {
                  myOrderSubtotal = inv.my_amount;
                }

                const isPaid = Boolean(myDetail?.paid || inv?.my_paid);
                const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : (rateInfo?.usd_khr || 4047);
                const myOrderSubtotalKHR = (inv?.my_amount_khr && inv.my_amount_khr > 0)
                  ? inv.my_amount_khr
                  : toKhr(myOrderSubtotal, orderRate, rateInfo?.khr_rounding || 100);

                return (
                  <Card 
                    key={ord.order_id} 
                    variant="default" 
                    padding="sm"
                    className="hover:border-[var(--color-primary-light)] transition-colors space-y-2 cursor-pointer border border-[var(--border)]"
                    onClick={() => {
                      if (inv?.invoice_id || ord.has_invoice) {
                        setViewInvoiceId(inv?.invoice_id || ord.order_id);
                      }
                    }}
                  >
                    {/* Header info */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--border)] pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[var(--color-primary)]">
                          {format(new Date(ord.order_date + "T00:00:00"), "EEE, MMM d, yyyy")}
                        </span>
                        {ord.chat_title && (
                          <Badge variant="member" className="text-[9px] py-0 px-1.5">
                            {ord.chat_title}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge variant="admin" className="text-[10px] font-semibold px-1.5 py-0.2">
                          Payer: {payer}
                        </Badge>
                        {ord.has_invoice ? (
                          isPaid ? (
                            <Badge variant="success" className="text-[9px] py-0 px-1.5 font-bold">
                              ✓ Paid
                            </Badge>
                          ) : (
                            <Badge variant="danger" className="text-[9px] py-0 px-1.5 font-bold">
                              Unpaid
                            </Badge>
                          )
                        ) : (
                          <Badge variant="default" className="text-[9px] py-0 px-1.5">
                            Pending Invoice
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Items List (MY ITEMS ONLY) */}
                    <div className="space-y-1">
                      <div className="grid grid-cols-1 gap-1">
                        {ord.myItems.map((it, idx) => {
                          const dishName = it.item_name || it.name || "Dish";
                          const qty = Number(it.qty) || 1;
                          
                          let itemPrice: number | null = null;
                          if (cachedInv?.details) {
                            const matchedDetail = cachedInv.details.find((d) => isMyIdentity(d.user_id, d.user_name));
                            const matchedItem = matchedDetail?.items.find((dIt) => dIt.item_name === dishName);
                            if (matchedItem) itemPrice = matchedItem.cost;
                          }

                          const itemPriceKHR = itemPrice !== null ? toKhr(itemPrice, orderRate, rateInfo?.khr_rounding || 100) : null;

                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                                <span className="font-medium text-[var(--text)] truncate text-[11px]">
                                  {dishName}
                                </span>
                                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-[var(--surface)] text-[var(--text-2)]">
                                  ×{qty}
                                </span>
                              </div>

                              {itemPrice !== null ? (
                                <div className="text-right whitespace-nowrap ml-2">
                                  <span className="font-bold text-[11px] text-[var(--text)]">
                                    ${itemPrice.toFixed(2)}
                                  </span>
                                  {itemPriceKHR !== null && (
                                    <span className="text-[9px] text-[var(--text-muted)] block leading-none">
                                      ≈ {formatKhr(itemPriceKHR)}
                                    </span>
                                  )}
                                </div>
                              ) : myOrderSubtotal > 0 ? (
                                <span className="text-[10px] text-[var(--text-muted)] italic">
                                  In subtotal
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)] italic">
                                  Pending
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Order Footer Subtotal */}
                    {myOrderSubtotal > 0 && (
                      <div className="flex items-center justify-between pt-1 text-xs border-t border-dashed border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Rate: {orderRate.toLocaleString()} ៛/$
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">My Total:</span>
                          <span className="font-extrabold text-xs text-[var(--color-primary)]">
                            ${myOrderSubtotal.toFixed(2)}
                          </span>
                          <span className="text-[11px] font-bold text-[var(--color-accent)]">
                            ({formatKhr(myOrderSubtotalKHR)})
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {myFilteredOrders.length > visibleCount && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={13} className="animate-bounce" />
                    Load more ({myFilteredOrders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <InvoiceViewModal
        invoiceId={viewInvoiceId}
        open={!!viewInvoiceId}
        onClose={() => setViewInvoiceId(null)}
        isAdmin={isAdmin}
        onResent={loadData}
      />
    </div>
  );
}
