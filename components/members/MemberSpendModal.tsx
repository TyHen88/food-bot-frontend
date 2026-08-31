"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { 
  Wallet, 
  Utensils, 
  CreditCard, 
  ShoppingBag, 
  Calendar,
  ChevronDown, 
  Phone, 
  User, 
  Shield, 
  CheckCircle2, 
  Check, 
  RotateCcw, 
  Zap, 
  Loader2,
  DollarSign,
  Landmark,
  AlertCircle
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { 
  getInvoiceFromCache, 
  invalidateInvoiceCache, 
  type Invoice, 
  type InvoiceDetailEntry 
} from "@/lib/invoiceCache";
import type { Order, OrderItem } from "@/components/orders/OrderItemsEditor";

interface Member {
  user_id: string;
  name?: string;
  full_name?: string;
  username?: string;
  phone?: string;
  role: string;
  status: string;
  last_active_at?: string;
}

interface InvoiceDetailItem {
  item_name: string;
  qty: number;
  price: number;
  cost: number;
}

interface InvoicePersonDetail {
  user_id?: string;
  user_name?: string;
  items: InvoiceDetailItem[];
  subtotal: number;
  paid?: boolean;
  paid_at?: string;
  paid_amount?: number;
}

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  payer_name: string;
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
const PAGE_SIZE = 25;

const AVATAR_COLORS = [
  { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-blue-100 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300" },
  { bg: "bg-purple-100 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300" },
  { bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300" },
];

function getAvatarStyle(name?: string) {
  if (!name) return AVATAR_COLORS[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

export function MemberSpendModal({
  member,
  open,
  onClose,
  onUpdated,
}: {
  member: Member | null;
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [rateInfo, setRateInfo] = useState<ExchangeRateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingPaidOrderId, setUpdatingPaidOrderId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [confirmBulkSettle, setConfirmBulkSettle] = useState(false);
  const [confirmSingleOrder, setConfirmSingleOrder] = useState<{
    orderId: string;
    isPaid: boolean;
    date: string;
    subtotal: number;
  } | null>(null);

  // Date filters — default to "week" (This Week)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("week");
  const [fromDate, setFromDate] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const handleQuickFilter = (type: QuickFilter) => {
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
  };

  const memberUserId = useMemo(() => {
    return String(member?.user_id || "").trim();
  }, [member?.user_id]);

  const normName = useCallback((str?: unknown): string => {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
  }, []);

  const memberNames = useMemo(() => {
    const set = new Set<string>();
    if (!member) return set;
    if (member.name) set.add(normName(member.name));
    if (member.full_name) set.add(normName(member.full_name));
    if (member.username) set.add(normName(member.username));
    return set;
  }, [member, normName]);

  const isMemberIdentity = useCallback((userId?: unknown, userName?: unknown): boolean => {
    const uidStr = String(userId || "").trim();
    if (uidStr) {
      return Boolean(memberUserId) && uidStr === memberUserId;
    }
    const nameStr = normName(userName);
    if (!nameStr) return false;
    return memberNames.has(nameStr);
  }, [memberUserId, memberNames, normName]);

  const isMemberItem = useCallback((it: OrderItem): boolean => {
    return isMemberIdentity(it.user_id, it.name);
  }, [isMemberIdentity]);

  // Load orders, invoices, and NBC official exchange rate
  const loadData = useCallback(() => {
    if (!open || !member) {
      setOrders([]);
      setInvoices([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const orderParams = new URLSearchParams();
    const invoiceParams = new URLSearchParams();
    orderParams.set("user_id", String(member.user_id));

    Promise.all([
      api.get<Order[] | { items: Order[] }>(`/orders?${orderParams.toString()}${chatIdQuery()}`),
      api.get<InvoiceRow[] | { items: InvoiceRow[] }>(`/invoices?${invoiceParams.toString()}${chatIdQuery()}`),
      api.get<ExchangeRateData>(`/exchange-rate${chatIdQuery()}`).catch(() => null),
    ])
      .then(([ordersData, invoicesData, exchangeRateData]) => {
        if (cancelled) return;
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
      })
      .catch((e: unknown) => {
        if (!cancelled) toast((e as Error).message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, member, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Map invoices by order_id
  const invoiceMapByOrderId = useMemo(() => {
    const map = new Map<string, InvoiceRow>();
    invoices.forEach((inv) => {
      map.set(inv.order_id, inv);
    });
    return map;
  }, [invoices]);

  // Filter orders for this member with date bounds
  const memberFilteredOrders = useMemo(() => {
    return orders
      .filter((ord) => {
        if (fromDate && ord.order_date < fromDate) return false;
        if (toDate && ord.order_date > toDate) return false;
        return true;
      })
      .map((ord) => {
        const memberItems = (ord.items || []).filter(isMemberItem);
        return {
          ...ord,
          memberItems,
        };
      })
      .filter((ord) => ord.memberItems.length > 0);
  }, [orders, fromDate, toDate, isMemberItem]);

  // Pagination state & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate, quickFilter]);
  const shownOrders = useMemo(() => memberFilteredOrders.slice(0, visibleCount), [memberFilteredOrders, visibleCount]);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && memberFilteredOrders.length > visibleCount) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [memberFilteredOrders.length, visibleCount]);

  // Statistics & Payer breakdown calculation in USD and KHR
  const stats = useMemo(() => {
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

    const paidToMap = new Map<string, { 
      totalUSD: number; 
      totalKHR: number; 
      count: number;
      unpaidUSD: number;
      unpaidKHR: number;
      unpaidCount: number;
    }>();

    memberFilteredOrders.forEach((ord) => {
      const inv = invoiceMapByOrderId.get(ord.order_id);
      const payerName = inv?.payer_name || ord.paid_by?.username || "Unknown Payer";

      const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : activeRate;

      const cachedInv = getInvoiceFromCache(ord.order_id) || (inv?.invoice_id ? getInvoiceFromCache(inv.invoice_id) : undefined);
      let orderMemberAmountUSD = 0;
      let orderIsPaid = false;

      if (cachedInv?.details) {
        const mDetail = cachedInv.details.find((d) => isMemberIdentity(d.user_id, d.user_name));
        if (mDetail) {
          orderMemberAmountUSD = mDetail.subtotal;
          orderIsPaid = Boolean(mDetail.paid);
        }
      } else if (inv?.my_amount !== undefined) {
        orderMemberAmountUSD = inv.my_amount;
        orderIsPaid = Boolean(inv.my_paid);
      }

      const orderMemberAmountKHR = (inv?.my_amount_khr && inv.my_amount_khr > 0)
        ? inv.my_amount_khr
        : toKhr(orderMemberAmountUSD, orderRate, rounding);

      totalSpendUSD += orderMemberAmountUSD;
      totalSpendKHR += orderMemberAmountKHR;

      if (ord.has_invoice) {
        if (orderIsPaid) {
          totalPaidUSD += orderMemberAmountUSD;
          totalPaidKHR += orderMemberAmountKHR;
          paidOrdersCount += 1;
        } else {
          totalUnpaidUSD += orderMemberAmountUSD;
          totalUnpaidKHR += orderMemberAmountKHR;
          unpaidOrdersCount += 1;
        }
      }

      const orderItemQty = ord.memberItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
      totalItemsCount += orderItemQty;

      // Group amount spent to each payer
      const current = paidToMap.get(payerName) || { 
        totalUSD: 0, 
        totalKHR: 0, 
        count: 0,
        unpaidUSD: 0,
        unpaidKHR: 0,
        unpaidCount: 0
      };
      paidToMap.set(payerName, {
        totalUSD: current.totalUSD + orderMemberAmountUSD,
        totalKHR: current.totalKHR + orderMemberAmountKHR,
        count: current.count + 1,
        unpaidUSD: current.unpaidUSD + (ord.has_invoice && !orderIsPaid ? orderMemberAmountUSD : 0),
        unpaidKHR: current.unpaidKHR + (ord.has_invoice && !orderIsPaid ? orderMemberAmountKHR : 0),
        unpaidCount: current.unpaidCount + (ord.has_invoice && !orderIsPaid ? 1 : 0),
      });
    });

    const paidToList = Array.from(paidToMap.entries()).map(([payerName, stat]) => ({
      payerName,
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
      totalOrdersCount: memberFilteredOrders.length,
      paidOrdersCount,
      unpaidOrdersCount,
      totalItemsCount,
      paidToList,
      rateUsed: activeRate,
      rateDisplay: rateInfo?.display || `${activeRate.toLocaleString()} KHR / USD`,
      rateDate: rateInfo?.rate_date || rateInfo?.today,
    };
  }, [memberFilteredOrders, invoiceMapByOrderId, isMemberIdentity, rateInfo]);

  const handleToggleSinglePaid = async (orderId: string, currentPaid: boolean) => {
    if (!member) return;
    const inv = invoiceMapByOrderId.get(orderId);
    const invoiceId = inv?.invoice_id || orderId;
    setUpdatingPaidOrderId(orderId);
    try {
      await api.post(`/invoices/${invoiceId}/mark-paid`, {
        user_id: member.user_id,
        user_name: member.name || member.full_name || member.username,
        paid: !currentPaid,
      });

      invalidateInvoiceCache(invoiceId);
      invalidateInvoiceCache(orderId);

      toast(!currentPaid ? "Marked as Paid" : "Unmarked payment", "success");
      loadData();
      onUpdated?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setUpdatingPaidOrderId(null);
    }
  };

  const handleBulkMarkPaid = async () => {
    if (!member) return;
    const unpaidInvoiceIds: string[] = [];
    memberFilteredOrders.forEach((ord) => {
      if (!ord.has_invoice) return;
      const inv = invoiceMapByOrderId.get(ord.order_id);
      unpaidInvoiceIds.push(inv?.invoice_id || ord.order_id);
    });

    if (unpaidInvoiceIds.length === 0) {
      toast("No unpaid invoices to settle", "info");
      return;
    }

    setBulkUpdating(true);
    try {
      await api.post("/invoices/mark-paid-bulk", {
        invoice_ids: unpaidInvoiceIds,
        user_id: member.user_id,
        user_name: member.name || member.full_name || member.username,
        paid: true,
      });

      invalidateInvoiceCache();

      toast(`Successfully settled ${unpaidInvoiceIds.length} orders!`, "success");
      loadData();
      onUpdated?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setBulkUpdating(false);
    }
  };

  const displayName = member?.name || member?.full_name || `User ${member?.user_id}`;
  const isAdm = member?.role?.toLowerCase() === "admin";
  const isActive = member?.status?.toLowerCase() === "active";
  const avatarStyle = getAvatarStyle(displayName);
  const initials = getInitials(displayName);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👤 Member Detail & Spend History"
      maxWidth="650px"
      fullHeight={true}
      footer={<Button size="sm" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3.5">
        {/* Full Member Profile Banner */}
        <Card variant="flat" padding="sm" className="bg-[var(--surface-2)] border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${avatarStyle.bg} ${avatarStyle.text}`}>
                {initials}
              </div>
              <span 
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--surface)] ${
                  isActive ? "bg-emerald-500" : "bg-neutral-400"
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[var(--text)] m-0 truncate">{displayName}</h3>
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                  isAdm 
                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                    : "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                }`}>
                  {isAdm ? "Admin" : "Member"}
                </span>
                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 size={11} /> Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mt-0.5 flex-wrap">
                <span>{member?.username ? `@${member.username}` : `ID: ${member?.user_id}`}</span>
                {member?.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone size={10} /> {member.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Date Filter Bar */}
        <Card variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {[
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
              { id: "today", label: "Today" },
              { id: "all", label: "All Time" },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => handleQuickFilter(pill.id as QuickFilter)}
                className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer ${
                  quickFilter === pill.id
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"
                }`}
              >
                {pill.label}
              </button>
            ))}
            {quickFilter === "custom" && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] border border-[var(--color-accent)]/30 whitespace-nowrap">
                Custom Range
              </span>
            )}
          </div>

          {/* Custom Date Pickers */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                From Date
              </label>
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
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                To Date
              </label>
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
          </div>
        </Card>

        {/* 2 Separate Cards: USD ($) and KHR (៛) with Exchange Rate */}
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
                ${stats.totalSpendUSD.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                  <CheckCircle2 size={11} className="text-emerald-500" /> Total Paid
                </div>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  ${stats.totalPaidUSD.toFixed(2)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {stats.paidOrdersCount} orders paid
                </div>
              </div>

              <div className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] ${
                stats.totalUnpaidUSD > 0.009 
                  ? "bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40" 
                  : "bg-[var(--surface-2)]"
              }`}>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  <AlertCircle size={11} className={stats.totalUnpaidUSD > 0.009 ? "text-rose-500" : "text-emerald-500"} /> Unpaid Debt
                </div>
                <div className={`text-xs font-bold mt-0.5 ${
                  stats.totalUnpaidUSD > 0.009 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  ${stats.totalUnpaidUSD.toFixed(2)}
                </div>
                <div className={`text-[10px] ${
                  stats.totalUnpaidUSD > 0.009 ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-[var(--text-muted)]"
                }`}>
                  {stats.unpaidOrdersCount > 0 ? `${stats.unpaidOrdersCount} unpaid` : "All settled"}
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
                {formatKhr(stats.totalSpendKHR)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase">
                  <CheckCircle2 size={11} className="text-emerald-500" /> Total Paid
                </div>
                <div className="text-xs font-bold text-[var(--text)] mt-0.5">
                  {formatKhr(stats.totalPaidKHR)}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {stats.paidOrdersCount} orders paid
                </div>
              </div>

              <div className={`px-2.5 py-1.5 rounded-[var(--radius-sm)] ${
                stats.totalUnpaidKHR > 0.009 
                  ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40" 
                  : "bg-[var(--surface-2)]"
              }`}>
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">
                  <AlertCircle size={11} className={stats.totalUnpaidKHR > 0.009 ? "text-amber-500" : "text-emerald-500"} /> Unpaid Debt
                </div>
                <div className={`text-xs font-bold mt-0.5 ${
                  stats.totalUnpaidKHR > 0.009 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                }`}>
                  {formatKhr(stats.totalUnpaidKHR)}
                </div>
                <div className={`text-[10px] ${
                  stats.totalUnpaidKHR > 0.009 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-[var(--text-muted)]"
                }`}>
                  {stats.unpaidOrdersCount > 0 ? `${stats.unpaidOrdersCount} unpaid` : "All settled"}
                </div>
              </div>
            </div>

            {/* Exchange Rate Badge */}
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-0.5">
              <span>🏦 NBC Official Rate</span>
              <span className="font-semibold text-[var(--text-2)]">{stats.rateDisplay}</span>
            </div>
          </Card>
        </div>

        {/* Payer Breakdown Card */}
        <Card variant="default" padding="sm" className="space-y-1.5 border border-[var(--border)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-1">
            <div className="flex items-center gap-1.5">
              <CreditCard size={13} className="text-[var(--color-primary)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Amount Spent To Payers
              </span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {stats.paidToList.length} payers
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {stats.paidToList.length > 0 ? (
              stats.paidToList.map(({ payerName, amountUSD, amountKHR, orderCount, unpaidCount }) => (
                <div 
                  key={payerName}
                  className="flex items-center justify-between px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-xs"
                >
                  <span className="truncate text-[var(--text)] font-semibold text-[11px]">
                    Paid to {payerName}
                  </span>
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
              <p className="text-[11px] text-[var(--text-muted)] italic col-span-2 py-0.5">No payer records found</p>
            )}
          </div>
        </Card>

        {/* Admin Bulk Mark Paid Banner */}
        {isAdmin && stats.totalUnpaidUSD > 0.009 && (
          <div className="flex items-center justify-between p-2.5 rounded-[var(--radius-md)] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 shadow-xs gap-2">
            <div className="text-xs">
              <span className="font-bold text-amber-900 dark:text-amber-200 block text-xs">
                ⚡ Unpaid Balance: ${stats.totalUnpaidUSD.toFixed(2)} ({formatKhr(stats.totalUnpaidKHR)})
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                Settle all {stats.unpaidOrdersCount} unpaid orders for this member in one click.
              </span>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirmBulkSettle(true)}
              disabled={bulkUpdating}
              className="shrink-0 font-bold text-xs h-7.5 py-1 px-2.5"
            >
              {bulkUpdating ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <Zap size={12} className="mr-1" />
              )}
              Mark All as Paid
            </Button>
          </div>
        )}

        {/* Items & Dishes Breakdown List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Complete Order History ({memberFilteredOrders.length})
            </h4>
            {stats.unpaidOrdersCount > 0 && (
              <Badge variant="danger" className="text-[9px] py-0.2 px-1.5 font-bold">
                {stats.unpaidOrdersCount} Unpaid
              </Badge>
            )}
          </div>

          {loading ? (
            <Card padding="sm" className="space-y-2 border border-[var(--border)]">
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : memberFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={28} />}
              title="No spend history"
              description="This member has no recorded food orders matching the selected date range."
            />
          ) : (
            <div className="space-y-2.5">
              {shownOrders.map((ord) => {
                const inv = invoiceMapByOrderId.get(ord.order_id);
                const payer = inv?.payer_name || ord.paid_by?.username || "Payer";
                const cachedInv = getInvoiceFromCache(ord.order_id) || (inv?.invoice_id ? getInvoiceFromCache(inv.invoice_id) : undefined);

                let orderSubtotal = 0;
                let isPaid = false;
                if (cachedInv?.details) {
                  const mDetail = cachedInv.details.find((d) => isMemberIdentity(d.user_id, d.user_name));
                  if (mDetail) {
                    orderSubtotal = mDetail.subtotal;
                    isPaid = Boolean(mDetail.paid);
                  }
                } else if (inv?.my_amount !== undefined) {
                  orderSubtotal = inv.my_amount;
                  isPaid = Boolean(inv.my_paid);
                }

                const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : (rateInfo?.usd_khr || 4047);
                const orderSubtotalKHR = (inv?.my_amount_khr && inv.my_amount_khr > 0)
                  ? inv.my_amount_khr
                  : toKhr(orderSubtotal, orderRate, rateInfo?.khr_rounding || 100);

                return (
                  <Card key={ord.order_id} variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
                    <div className="flex items-center justify-between gap-1.5 border-b border-[var(--border)] pb-1 text-xs flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[var(--color-primary)] text-xs">
                          {format(new Date(ord.order_date + "T00:00:00"), "MMM d, yyyy")}
                        </span>
                        {ord.chat_title && (
                          <Badge variant="member" className="text-[9px] py-0 px-1.5">
                            {ord.chat_title}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="admin" className="text-[9px] py-0 px-1.5">
                          Payer: {payer}
                        </Badge>
                        {ord.has_invoice ? (
                          <>
                            {isPaid ? (
                              <Badge variant="success" className="text-[9px] py-0 px-1.5 font-bold">
                                ✓ Paid
                              </Badge>
                            ) : (
                              <Badge variant="danger" className="text-[9px] py-0 px-1.5 font-bold">
                                Unpaid
                              </Badge>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={updatingPaidOrderId === ord.order_id}
                                onClick={() =>
                                  setConfirmSingleOrder({
                                    orderId: ord.order_id,
                                    isPaid,
                                    date: ord.order_date,
                                    subtotal: orderSubtotal,
                                  })
                                }
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all ${
                                  isPaid
                                    ? "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-[var(--border)]"
                                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                                }`}
                                title={isPaid ? "Unmark as paid" : "Mark this order as paid"}
                              >
                                {updatingPaidOrderId === ord.order_id ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : isPaid ? (
                                  <>
                                    <RotateCcw size={9} /> Unmark
                                  </>
                                ) : (
                                  <>
                                    <Check size={9} /> Mark Paid
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        ) : (
                          <Badge variant="default" className="text-[9px] py-0 px-1.5">
                            Pending Invoice
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Member's Dishes */}
                    <div className="space-y-1">
                      {ord.memberItems.map((it, idx) => {
                        const dishName = it.item_name || it.name || "Dish";
                        const qty = Number(it.qty) || 1;

                        let itemPrice: number | null = null;
                        if (cachedInv?.details) {
                          const mDetail = cachedInv.details.find((d) => isMemberIdentity(d.user_id, d.user_name));
                          const matchedItem = mDetail?.items.find((dIt) => dIt.item_name === dishName);
                          if (matchedItem) itemPrice = matchedItem.cost;
                        }

                        const itemPriceKHR = itemPrice !== null ? toKhr(itemPrice, orderRate, rateInfo?.khr_rounding || 100) : null;

                        return (
                          <div 
                            key={idx}
                            className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-[var(--surface-2)] font-medium"
                          >
                            <span className="truncate text-[var(--text)] text-[11px]">
                              • {dishName} <span className="font-bold text-[9px] text-[var(--text-2)]">×{qty}</span>
                            </span>
                            {itemPrice !== null && (
                              <div className="text-right whitespace-nowrap ml-1.5">
                                <span className="font-bold font-mono text-[var(--text)] text-[11px]">
                                  ${itemPrice.toFixed(2)}
                                </span>
                                {itemPriceKHR !== null && (
                                  <span className="text-[9px] text-[var(--text-muted)] block leading-none">
                                    ≈ {formatKhr(itemPriceKHR)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {orderSubtotal > 0 && (
                      <div className="flex items-center justify-between pt-1 text-xs border-t border-dashed border-[var(--border)]">
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Rate: {orderRate.toLocaleString()} ៛/$
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">Subtotal:</span>
                          <span className="font-extrabold text-xs text-[var(--color-primary)]">
                            ${orderSubtotal.toFixed(2)}
                          </span>
                          <span className="text-[11px] font-bold text-[var(--color-accent)]">
                            ({formatKhr(orderSubtotalKHR)})
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {memberFilteredOrders.length > visibleCount && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={13} className="animate-bounce" />
                    Load more ({memberFilteredOrders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation: Bulk Settle All for this Member */}
      <ConfirmDialog
        open={confirmBulkSettle}
        onClose={() => setConfirmBulkSettle(false)}
        onConfirm={() => {
          setConfirmBulkSettle(false);
          handleBulkMarkPaid();
        }}
        title="Confirm Mark All as Paid"
        variant="success"
        confirmText="Yes, Mark All as Paid"
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              Mark all unpaid orders as <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span> for{" "}
              <span className="font-bold">{displayName}</span>?
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Total unpaid balance to settle: <strong className="text-[var(--text)]">${stats.totalUnpaidUSD.toFixed(2)} ({formatKhr(stats.totalUnpaidKHR)})</strong>.
            </p>
          </div>
        }
      />

      {/* Confirmation: Single Order Toggle */}
      <ConfirmDialog
        open={!!confirmSingleOrder}
        onClose={() => setConfirmSingleOrder(null)}
        onConfirm={() => {
          if (confirmSingleOrder) {
            const { orderId, isPaid } = confirmSingleOrder;
            setConfirmSingleOrder(null);
            handleToggleSinglePaid(orderId, isPaid);
          }
        }}
        title={confirmSingleOrder?.isPaid ? "Confirm Unmark Payment" : "Confirm Mark as Paid"}
        variant={confirmSingleOrder?.isPaid ? "danger" : "success"}
        confirmText={confirmSingleOrder?.isPaid ? "Yes, Unmark" : "Yes, Mark Paid"}
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              {confirmSingleOrder?.isPaid ? (
                <>
                  Unmark this order as unpaid for <span className="font-bold">{displayName}</span>?
                </>
              ) : (
                <>
                  Mark order on <span className="font-bold">{confirmSingleOrder ? format(new Date(confirmSingleOrder.date + "T00:00:00"), "MMM d, yyyy") : ""}</span> as <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span> for <span className="font-bold">{displayName}</span>?
                </>
              )}
            </p>
            {confirmSingleOrder && confirmSingleOrder.subtotal > 0 && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Order amount: <strong className="text-[var(--text)]">${confirmSingleOrder.subtotal.toFixed(2)}</strong>.
              </p>
            )}
          </div>
        }
      />
    </Modal>
  );
}
