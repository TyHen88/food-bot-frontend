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
  AlertCircle,
  Coins,
  Receipt,
  Share2,
  Copy,
  Users
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
import { invalidateInvoiceCache } from "@/lib/invoiceCache";
import { InvoiceViewModal } from "@/components/orders/InvoiceViewModal";
import type { Order, OrderItem } from "@/components/orders/OrderItemsEditor";

interface InvoiceDetailItem {
  item_name: string;
  qty: number;
  price: number;
  cost: number;
}

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
  /** What the caller still owes on this invoice after partial payments. */
  my_due?: number;
  my_amount_khr?: number | null;
  my_due_khr?: number | null;
  usd_khr_rate?: number;
  my_items?: InvoiceDetailItem[];
  is_payer?: boolean;
  payer_unpaid_amount?: number;
  payer_total_to_collect?: number;
  payer_unpaid_count?: number;
  unpaid_members?: UnpaidMemberInfo[];
}

interface UnpaidMemberInfo {
  user_id: string;
  user_name: string;
  due: number;
  items: InvoiceDetailItem[];
}

interface PayerOrderRecord {
  order_id: string;
  order_date: string;
  chat_title?: string;
  total: number;
  totalToCollect: number;
  collectedUSD: number;
  uncollectedUSD: number;
  uncollectedKHR: number;
  progressPct: number;
  unpaidMembers: UnpaidMemberInfo[];
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

/** Normalize dish name by stripping numerals, bullets and list prefixes */
function cleanDishName(name?: string): string {
  if (!name) return "";
  return name.replace(/^[\s\-•*·\d១-១០]+[.)\s]*/u, "").trim().toLowerCase();
}

/** Convert USD to KHR with rounding to nearest note */
function toKhr(usd: number, rate = 4047, rounding = 100): number {
  const exact = (usd || 0) * (rate || 4047);
  if (rounding && rounding > 1) {
    return Math.round(exact / rounding) * rounding;
  }
  return Math.round(exact);
}

/** Local-midnight Date for a "YYYY-MM-DD" order date (ignores any time suffix) */
function parseDay(day: string): Date {
  return new Date(`${(day || "").slice(0, 10)}T00:00:00`);
}

/** Format KHR with thousands separator and riel symbol */
function formatKhr(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return "0៛";
  return `${Math.round(amount).toLocaleString("en-US")}៛`;
}

export default function MyOrdersPage() {
  const { user, profile, loading: authLoading } = useAuth();
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

  // Load orders, invoices, and official NBC exchange rate. Each call gets a
  // sequence number so a slow response for a previous filter can't overwrite
  // the data for the filter now selected. `silent` refreshes in place
  // without the skeleton.
  const requestSeq = useRef(0);
  const loadData = useCallback(async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) setLoading(true);
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
      if (seq !== requestSeq.current) return;

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

      // The invoice modal reads a 5-minute cache; drop it so opening an
      // invoice shows the same paid status as the list just fetched.
      invalidateInvoiceCache();
      setOrders(fetchedOrders);
      setInvoices(fetchedInvoices);
      if (exchangeRateData) {
        setRateInfo(exchangeRateData);
      }
    } catch (e: unknown) {
      if (seq === requestSeq.current) toast((e as Error).message, "error");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [fromDate, toDate, toast]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [loadData, authLoading]);

  // Paying happens outside the Mini App (ABA app, or an admin marking it),
  // so re-fetch whenever the user comes back to it — otherwise the order
  // keeps showing "Owes" until they think to press Refresh.
  useEffect(() => {
    if (authLoading) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") loadData(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  // Orders in the date range that contain my dishes. Orders I only paid for
  // (no dishes of mine) are listed under "Orders Paid by Me" instead, so they
  // don't inflate the order/dish counts here.
  const myFilteredOrders = useMemo(() => {
    return orders
      .filter((ord) => {
        const day = (ord.order_date || "").slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        return true;
      })
      .map((ord) => ({ ...ord, myItems: (ord.items || []).filter(isMyItem) }))
      .filter((ord) => ord.myItems.length > 0);
  }, [orders, fromDate, toDate, isMyItem]);

  // Pagination state & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate, quickFilter]);

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

  // One record per order with my share of it, so the summary cards, the
  // unpaid badges and each order card all read the same numbers. Amount and
  // paid status come from the server's invoice list (my_amount / my_due),
  // fetched fresh on every load — never from the 5-minute invoice cache,
  // which is what kept orders showing "Owes" after they were paid.
  const myOrderRows = useMemo(() => {
    const fallbackRate = rateInfo?.usd_khr && rateInfo.usd_khr > 0 ? rateInfo.usd_khr : 4047;
    const rounding = rateInfo?.khr_rounding || 100;
    return myFilteredOrders.map((ord) => {
      const inv = invoiceMapByOrderId.get(ord.order_id);
      const isMeThePayer = Boolean(
        (inv?.payer_user_id && isMyIdentity(inv.payer_user_id, inv.payer_name)) ||
        Boolean(inv?.is_payer)
      );
      const payerName = inv?.payer_name || "";
      const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : fallbackRate;
      const amountUSD = inv?.my_amount ?? 0;
      // my_due is what's left after partial payments; read strictly from invoice
      const dueUSD = !inv ? 0 : (inv.my_due ?? (inv.my_paid ? 0 : amountUSD));
      const amountKHR = inv?.my_amount_khr && inv.my_amount_khr > 0
        ? inv.my_amount_khr
        : toKhr(amountUSD, orderRate, rounding);
      const dueKHR = inv?.my_due_khr != null ? inv.my_due_khr : toKhr(dueUSD, orderRate, rounding);
      return {
        ord,
        inv,
        isMeThePayer,
        payerName,
        orderRate,
        amountUSD,
        amountKHR,
        dueUSD,
        dueKHR,
        owes: dueUSD > 0.009,
      };
    });
  }, [myFilteredOrders, invoiceMapByOrderId, isMyIdentity, rateInfo]);

  const shownOrders = useMemo(() => myOrderRows.slice(0, visibleCount), [myOrderRows, visibleCount]);

  // Calculate my spend, my debts to other payers, and what group members owe me (as payer)
  const statistics = useMemo(() => {
    let totalSpendUSD = 0;
    let totalUnpaidUSD = 0;
    let totalSpendKHR = 0;
    let totalUnpaidKHR = 0;
    let totalItemsCount = 0;
    let unpaidOrdersCount = 0;

    let totalReceivablesUSD = 0;
    let totalReceivablesKHR = 0;

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

    // 1. Process orders where I ate food
    myOrderRows.forEach((row) => {
      totalSpendUSD += row.amountUSD;
      totalSpendKHR += row.amountKHR;
      if (row.owes) {
        totalUnpaidUSD += row.dueUSD;
        totalUnpaidKHR += row.dueKHR;
        unpaidOrdersCount += 1;
      }
      totalItemsCount += row.ord.myItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);

      // Group by who paid (debt to payers)
      if (!row.isMeThePayer) {
        const payerName = row.payerName || "Unknown Payer";
        const currentPayer = paidByMap.get(payerName) || {
          totalUSD: 0,
          totalKHR: 0,
          count: 0,
          unpaidUSD: 0,
          unpaidKHR: 0,
          unpaidCount: 0
        };
        paidByMap.set(payerName, {
          totalUSD: currentPayer.totalUSD + row.amountUSD,
          totalKHR: currentPayer.totalKHR + row.amountKHR,
          count: currentPayer.count + 1,
          unpaidUSD: currentPayer.unpaidUSD + (row.owes ? row.dueUSD : 0),
          unpaidKHR: currentPayer.unpaidKHR + (row.owes ? row.dueKHR : 0),
          unpaidCount: currentPayer.unpaidCount + (row.owes ? 1 : 0),
        });
      }
    });

    // 2. Process orders where I AM THE PAYER (Receivables from members)
    const payerOrdersList: PayerOrderRecord[] = [];

    invoices.forEach((inv) => {
      const isMePayer = Boolean(inv.is_payer) || isMyIdentity(inv.payer_user_id, inv.payer_name);
      if (!isMePayer) return;

      const orderRate = inv.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : activeRate;
      const uncollected = inv.payer_unpaid_amount ?? 0;
      const toCollect = inv.payer_total_to_collect ?? (inv.total || 0);
      const collected = Math.max(0, toCollect - uncollected);
      const progress = toCollect > 0 ? Math.min(100, Math.round((collected / toCollect) * 100)) : 100;
      const uncollectedKHR = toKhr(uncollected, orderRate, rounding);

      totalReceivablesUSD += uncollected;
      totalReceivablesKHR += uncollectedKHR;

      payerOrdersList.push({
        order_id: inv.order_id,
        order_date: inv.order_date,
        chat_title: inv.chat_title,
        total: inv.total || 0,
        totalToCollect: toCollect,
        collectedUSD: collected,
        uncollectedUSD: uncollected,
        uncollectedKHR: uncollectedKHR,
        progressPct: progress,
        unpaidMembers: inv.unpaid_members || [],
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
      totalUnpaidUSD,
      totalSpendKHR,
      totalUnpaidKHR,
      totalReceivablesUSD,
      totalReceivablesKHR,
      totalOrdersCount: myOrderRows.length,
      unpaidOrdersCount,
      totalItemsCount,
      paidByList,
      payerOrdersList,
      rateUsed: activeRate,
      rateDisplay: rateInfo?.display || `${activeRate.toLocaleString()} KHR / USD`,
      rateDate: rateInfo?.rate_date || rateInfo?.today,
    };
  }, [myOrderRows, isMyIdentity, rateInfo, invoices]);

  // Copy Telegram reminder message for unpaid members
  const handleCopyReminder = (pOrd: PayerOrderRecord) => {
    if (!pOrd.unpaidMembers || pOrd.unpaidMembers.length === 0) return;
    const myName = profile?.full_name || profile?.username || user?.first_name || "the payer";
    const dateFormatted = format(parseDay(pOrd.order_date), "d MMM yyyy");
    const lines = [
      `📢 Lunch Payment Reminder (${dateFormatted})`,
      `Please scan KHQR to settle with ${myName}:`,
    ];
    pOrd.unpaidMembers.forEach((m: UnpaidMemberInfo) => {
      lines.push(`• ${m.user_name}: $${m.due.toFixed(2)} (${formatKhr(toKhr(m.due, statistics.rateUsed))})`);
    });
    lines.push("Thank you! 🙏");
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => toast("Payment reminder copied to clipboard! Paste in Telegram.", "success"),
      () => toast("Failed to copy reminder", "error")
    );
  };

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
              onClick={() => loadData()}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
              className="shrink-0 w-9 h-9 p-0 flex items-center justify-center rounded-[var(--radius-md)] hover:bg-[var(--surface-2)] active:scale-95 transition-all"
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
                className="w-full pl-8 pr-2 py-1 text-xs rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer h-8"
              />
            </div>
          </div>
        </Card>

        {/* 2. Redesigned Financial Overview: I Owe vs Owed to Me vs Food Spend */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* Card 1: I Owe (Debts to other payers) */}
          <Card 
            variant="default" 
            padding="sm" 
            className={`space-y-1.5 border transition-all ${
              statistics.totalUnpaidUSD > 0.009
                ? "bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/30"
                : "border-[var(--border)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                  statistics.totalUnpaidUSD > 0.009
                    ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                    : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {statistics.totalUnpaidUSD > 0.009 ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">
                    I Owe (To Payers)
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {statistics.totalUnpaidUSD > 0.009 ? `${statistics.unpaidOrdersCount} unpaid order(s)` : "All settled"}
                  </span>
                </div>
              </div>
              <Badge 
                variant={statistics.totalUnpaidUSD > 0.009 ? "danger" : "success"} 
                className="text-[9px] px-1.5 py-0.2"
              >
                {statistics.totalUnpaidUSD > 0.009 ? "Unpaid" : "✓ Clear"}
              </Badge>
            </div>
            <div className="pt-1">
              <div className="text-xl font-extrabold text-[var(--text)] font-mono">
                ${statistics.totalUnpaidUSD.toFixed(2)}
              </div>
              <div className="text-xs font-semibold text-[var(--text-muted)] font-mono">
                ≈ {formatKhr(statistics.totalUnpaidKHR)}
              </div>
            </div>
          </Card>

          {/* Card 2: Owed to Me (Payer Receivables) */}
          <Card 
            variant="default" 
            padding="sm" 
            className={`space-y-1.5 border transition-all ${
              statistics.totalReceivablesUSD > 0.009
                ? "bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/30"
                : "border-[var(--border)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                  <Coins size={14} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">
                    Owed to Me (Payer)
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {statistics.totalReceivablesUSD > 0.009 ? "Waiting for members" : "No pending collections"}
                  </span>
                </div>
              </div>
              <Badge 
                variant={statistics.totalReceivablesUSD > 0.009 ? "warning" : "default"} 
                className="text-[9px] px-1.5 py-0.2"
              >
                {statistics.totalReceivablesUSD > 0.009 ? "Collecting" : "Settled"}
              </Badge>
            </div>
            <div className="pt-1">
              <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                ${statistics.totalReceivablesUSD.toFixed(2)}
              </div>
              <div className="text-xs font-semibold text-[var(--text-muted)] font-mono">
                ≈ {formatKhr(statistics.totalReceivablesKHR)}
              </div>
            </div>
          </Card>

          {/* Card 3: Food Spending */}
          <Card variant="default" padding="sm" className="space-y-1.5 border border-[var(--border)] sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                  <ShoppingBag size={14} />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block leading-none">
                    Total Food Spend
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {statistics.totalItemsCount} dishes in {statistics.totalOrdersCount} orders
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                {statistics.rateDisplay}
              </span>
            </div>
            <div className="pt-1">
              <div className="text-xl font-extrabold text-[var(--color-primary)] font-mono">
                ${statistics.totalSpendUSD.toFixed(2)}
              </div>
              <div className="text-xs font-semibold text-[var(--text-muted)] font-mono">
                ≈ {formatKhr(statistics.totalSpendKHR)}
              </div>
            </div>
          </Card>
        </div>

        {/* 3. Payer Hub: Orders where I am the Payer (Collecting from Group) */}
        {statistics.payerOrdersList.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Coins size={12} />
                </div>
                <h2 className="text-xs font-bold tracking-tight text-[var(--text)] uppercase">
                  Orders Paid by Me — Group Collections ({statistics.payerOrdersList.length})
                </h2>
              </div>
              {statistics.totalReceivablesUSD > 0.009 ? (
                <Badge variant="warning" className="text-[10px] py-0.2 px-2 font-bold">
                  ${statistics.totalReceivablesUSD.toFixed(2)} to collect
                </Badge>
              ) : (
                <Badge variant="success" className="text-[10px] py-0.2 px-2 font-bold">
                  ✓ All Members Settled
                </Badge>
              )}
            </div>

            <div className="space-y-2.5">
              {statistics.payerOrdersList.map((pOrd) => (
                <Card key={pOrd.order_id} variant="default" padding="sm" className="space-y-2.5 border border-[var(--border)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text)]">
                          {format(parseDay(pOrd.order_date), "EEEE, MMM d, yyyy")}
                        </span>
                        {pOrd.chat_title && (
                          <Badge variant="member" className="text-[9px] py-0 px-1.5">
                            {pOrd.chat_title}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Restaurant Total: <strong className="text-[var(--text)] font-mono">${pOrd.total.toFixed(2)}</strong> · Group Share: <strong className="text-[var(--text)] font-mono">${pOrd.totalToCollect.toFixed(2)}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      {pOrd.uncollectedUSD > 0.009 ? (
                        <div>
                          <span className="text-xs font-bold text-rose-600 dark:text-rose-400 block font-mono">
                            ${pOrd.uncollectedUSD.toFixed(2)} Unpaid
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] block font-mono">
                            ≈ {formatKhr(pOrd.uncollectedKHR)}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="success" className="text-[10px] py-0.5 px-2 font-bold">
                          ✓ Fully Collected
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1 font-medium">
                      <span>Collection Progress</span>
                      <span className="text-[var(--text)] font-mono">
                        ${pOrd.collectedUSD.toFixed(2)} of ${pOrd.totalToCollect.toFixed(2)} ({pOrd.progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--border)]">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          pOrd.progressPct === 100 ? "bg-emerald-500" : "bg-amber-500"
                        }`} 
                        style={{ width: `${pOrd.progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Unpaid Members List (Remaining not paid yet) */}
                  <div className="rounded-[var(--radius-sm)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden bg-[var(--surface-2)]/30">
                    {pOrd.unpaidMembers.length > 0 ? (
                      pOrd.unpaidMembers.map((m, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                            <span className="font-bold text-[var(--text)] truncate">{m.user_name}</span>
                            {m.items?.length > 0 && (
                              <span className="text-[10px] text-[var(--text-muted)] truncate hidden sm:inline">
                                ({m.items.map((it: InvoiceDetailItem) => `${it.qty}x ${it.item_name}`).join(", ")})
                              </span>
                            )}
                          </div>
                          <Badge variant="danger" className="text-[10px] font-mono font-bold shrink-0">
                            ${m.due.toFixed(2)}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ All members have paid you for this order!
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-0.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-[11px] h-7 gap-1"
                      onClick={() => setViewInvoiceId(pOrd.order_id)}
                    >
                      <Receipt size={12} /> View Full Invoice
                    </Button>

                    {pOrd.unpaidMembers.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        className="text-[11px] h-7 gap-1 bg-amber-600 hover:bg-amber-700 font-bold"
                        onClick={() => handleCopyReminder(pOrd)}
                      >
                        <Share2 size={12} /> Copy Reminder for Telegram
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* 4. Payers Breakdown Summary (Who I Owe / Have Paid) */}
        {statistics.paidByList.length > 0 && (
          <Card variant="flat" padding="sm" className="space-y-1.5 border border-[var(--border)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
              <div className="flex items-center gap-1.5">
                <CreditCard size={13} className="text-[var(--color-primary)]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Payers I Have Ordered From
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)]">
                {statistics.paidByList.length} payer(s)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {statistics.paidByList.map(({ payerName, amountUSD, amountKHR, orderCount, unpaidUSD, unpaidCount }) => (
                <div 
                  key={payerName}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-xs"
                >
                  <span className="truncate font-semibold text-[var(--text)] text-[11px]">{payerName}</span>
                  <div className="text-right ml-1.5 whitespace-nowrap font-mono">
                    <span className="font-bold text-[11px] text-[var(--text)]">
                      ${amountUSD.toFixed(2)}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)] block leading-tight">
                      {orderCount} order(s) {unpaidCount > 0 ? (
                        <span className="text-rose-500 font-bold">· Owes ${unpaidUSD.toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">· Settled</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 5. Detailed UI List of My Orders */}
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
              {shownOrders.map((row) => {
                const { ord, inv, isMeThePayer, orderRate, owes, dueUSD } = row;
                const payer = row.payerName || "Not assigned";
                const myOrderSubtotal = row.amountUSD;
                const myOrderSubtotalKHR = row.amountKHR;
                const isPartlyPaid = owes && dueUSD < myOrderSubtotal - 0.009;

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
                          {format(parseDay(ord.order_date), "EEE, MMM d, yyyy")}
                        </span>
                        {ord.chat_title && (
                          <Badge variant="member" className="text-[9px] py-0 px-1.5">
                            {ord.chat_title}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isMeThePayer && (
                          <Badge variant="member" className="text-[10px] font-semibold px-1.5 py-0.2">
                            Ordered by You
                          </Badge>
                        )}
                        {!isMeThePayer && payer && (
                          <Badge variant="admin" className="text-[10px] font-semibold px-1.5 py-0.2">
                            Payer: {payer}
                          </Badge>
                        )}
                        {inv ? (
                          owes ? (
                            <Badge variant="danger" className="text-[9px] py-0 px-1.5 font-bold">
                              Owes {payer ? `${payer}` : "Lunch"}{isPartlyPaid ? ` · $${dueUSD.toFixed(2)} left` : ""}
                            </Badge>
                          ) : (
                            <Badge variant="success" className="text-[9px] py-0 px-1.5 font-bold">
                              ✓ Paid
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
                        {(ord.myItems || []).map((it, idx) => {
                          const dishName = it.item_name || it.name || "Dish";
                          const qty = Number(it.qty) || 1;
                          const cleanName = cleanDishName(dishName);
                          
                          let itemPrice: number | null = null;
                          if (inv?.my_items?.length) {
                            const matchedItem = inv.my_items.find(
                              (dIt) => cleanDishName(dIt.item_name) === cleanName || dIt.item_name === dishName
                            );
                            if (matchedItem) itemPrice = matchedItem.cost || (matchedItem.price * qty);
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
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 font-mono">
                                <span className="text-[10px] text-[var(--text-muted)]">x{qty}</span>
                                {itemPrice !== null ? (
                                  <div className="text-right">
                                    <span className="font-bold text-[11px] text-[var(--text)]">
                                      ${itemPrice.toFixed(2)}
                                    </span>
                                    {itemPriceKHR !== null && (
                                      <span className="text-[9px] text-[var(--text-muted)] block leading-tight">
                                        {formatKhr(itemPriceKHR)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[var(--text-muted)] italic">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Subtotal Footer */}
                      <div className="flex items-center justify-between pt-1 text-xs border-t border-[var(--border)] mt-1.5">
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">
                          Order Share:
                        </span>
                        <div className="text-right font-mono">
                          <span className="text-xs font-bold text-[var(--color-primary)]">
                            ${myOrderSubtotal.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] ml-1.5">
                            ({formatKhr(myOrderSubtotalKHR)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {/* Load More Button / Infinite Scroll Anchor */}
              <div ref={observerTarget} className="py-2 text-center">
                {visibleCount < myFilteredOrders.length && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                    className="gap-1 text-xs"
                  >
                    <ChevronDown size={13} /> Load More ({myFilteredOrders.length - visibleCount} remaining)
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Invoice Breakdown Modal */}
      <InvoiceViewModal
        invoiceId={viewInvoiceId}
        open={Boolean(viewInvoiceId)}
        onClose={() => setViewInvoiceId(null)}
        isAdmin={false}
      />
    </div>
  );
}
