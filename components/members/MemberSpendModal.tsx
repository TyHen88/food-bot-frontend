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
  AlertCircle,
  Receipt,
  ArrowLeftRight
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
  payment_id?: string;
  paid_note?: string;
  is_payer?: boolean;
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
  is_payer?: boolean;
  my_amount?: number;
  my_paid?: boolean;
  my_amount_khr?: number | null;
  my_due?: number;
  my_due_khr?: number;
  usd_khr_rate?: number;
  my_items?: InvoiceDetailItem[];
  details?: InvoicePersonDetail[];
}

interface PaymentRecord {
  payment_id: string;
  trx_id: string;
  user_id: string;
  sender_name: string;
  amount: number;
  currency: string;
  amount_usd: number;
  settled_orders: { order_id: string; date?: string; amount?: number }[];
  status: string;
  created_at: string;
}

/** One row of the Payments tab: a bank transaction, or an admin's manual settle. */
interface TransactionRow {
  key: string;
  kind: "bank" | "manual";
  at: string;
  amountUSD: number;
  title: string;
  subtitle: string;
  status: string;
  orderDates: string[];
  /** Set on unmatched transfers so an admin can assign them. */
  payment?: PaymentRecord;
}

type Tab = "orders" | "payments";
type OrderStatusFilter = "all" | "unpaid" | "paid";
type PaymentStatusFilter = "all" | "matched" | "unmatched";

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
const SETTLE_NOTE_MAX = 200; // backend MAX_PAID_NOTE
const PAGE_SIZE = 25;

/** Normalize dish name by stripping numerals, bullets and list prefixes */
function cleanDishName(name?: string): string {
  if (!name) return "";
  return name.replace(/^[\s\-•*·\d១-១០]+[.)\s]*/u, "").trim().toLowerCase();
}

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

/** Status filter chips with counts, shared by the Orders and Payments tabs. */
function StatusChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; count: number; tone?: "danger" | "success" }[];
}) {
  return (
    <div className="flex items-center gap-1.5 px-1 overflow-x-auto scrollbar-none">
      {options.map((o) => {
        const active = value === o.id;
        const activeCls =
          o.tone === "danger"
            ? "bg-rose-600 text-white border-rose-600"
            : o.tone === "success"
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-[var(--color-primary)] text-white border-[var(--color-primary)]";
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap border transition-all cursor-pointer ${
              active
                ? `${activeCls} shadow-xs`
                : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"
            }`}
          >
            {o.label} <span className="opacity-75">({o.count})</span>
          </button>
        );
      })}
    </div>
  );
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
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [tab, setTab] = useState<Tab>("orders");
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("all");
  // Group-wide transfers nobody was matched to (admin only) — candidates to assign to this member.
  const [unmatchedPayments, setUnmatchedPayments] = useState<PaymentRecord[]>([]);
  const [assignTarget, setAssignTarget] = useState<PaymentRecord | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [rateInfo, setRateInfo] = useState<ExchangeRateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingPaidOrderId, setUpdatingPaidOrderId] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [confirmBulkSettle, setConfirmBulkSettle] = useState(false);
  const [settleNote, setSettleNote] = useState("");
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
      setPayments([]);
      setUnmatchedPayments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const orderParams = new URLSearchParams();
    const invoiceParams = new URLSearchParams();
    const paymentParams = new URLSearchParams();
    const unmatchedParams = new URLSearchParams({ status: "UNMATCHED" });
    orderParams.set("user_id", String(member.user_id));
    invoiceParams.set("user_id", String(member.user_id));
    paymentParams.set("user_id", String(member.user_id));
    if (fromDate) {
      invoiceParams.set("from", fromDate);
      paymentParams.set("from", fromDate);
      unmatchedParams.set("from", fromDate);
    }
    if (toDate) {
      invoiceParams.set("to", toDate);
      paymentParams.set("to", toDate);
      unmatchedParams.set("to", toDate);
    }

    Promise.all([
      api.get<Order[] | { items: Order[] }>(`/orders?${orderParams.toString()}${chatIdQuery()}`),
      api.get<InvoiceRow[] | { items: InvoiceRow[] }>(`/invoices?${invoiceParams.toString()}${chatIdQuery()}`),
      api.get<ExchangeRateData>(`/exchange-rate${chatIdQuery()}`).catch(() => null),
      // Members only get their own transactions back; viewing someone
      // else's detail just shows an empty Payments tab.
      api.get<PaymentRecord[]>(`/payments?${paymentParams.toString()}`).catch(() => [] as PaymentRecord[]),
      isAdmin
        ? api.get<PaymentRecord[]>(`/payments?${unmatchedParams.toString()}`).catch(() => [] as PaymentRecord[])
        : Promise.resolve([] as PaymentRecord[]),
    ])
      .then(([ordersData, invoicesData, exchangeRateData, paymentsData, unmatchedData]) => {
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
        setPayments(Array.isArray(paymentsData) ? paymentsData : []);
        setUnmatchedPayments(Array.isArray(unmatchedData) ? unmatchedData : []);
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
  }, [open, member, fromDate, toDate, toast, isAdmin]);

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

  // This member's share of one order, and whether it's paid. Paid is the
  // server's verdict only (my_paid / detail.paid already count the invoice's
  // own payer as paid); isPayerSelf just labels the row.
  const orderPayment = useCallback((orderId: string) => {
    const inv = invoiceMapByOrderId.get(orderId);
    const isPayerSelf = Boolean(
      (inv?.payer_user_id && isMemberIdentity(inv.payer_user_id, inv.payer_name)) ||
      Boolean(inv?.is_payer)
    );
    const cachedInv = getInvoiceFromCache(orderId) || (inv?.invoice_id ? getInvoiceFromCache(inv.invoice_id) : undefined);
    let amountUSD = 0;
    let isPaid = false;
    if (inv?.my_amount !== undefined && inv.my_amount > 0) {
      amountUSD = inv.my_amount;
      isPaid = Boolean(inv.my_paid);
    } else if (cachedInv?.details) {
      const mDetail = cachedInv.details.find((d) => isMemberIdentity(d.user_id, d.user_name));
      if (mDetail) {
        amountUSD = mDetail.subtotal;
        isPaid = Boolean(mDetail.paid);
      }
    } else if (inv?.my_items?.length) {
      amountUSD = inv.my_items.reduce((sum, item) => sum + (item.cost || (item.price * (item.qty || 1))), 0);
      isPaid = Boolean(inv.my_paid);
    }
    return { inv, cachedInv, isPayerSelf, amountUSD, isPaid };
  }, [invoiceMapByOrderId, isMemberIdentity]);

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

  // Unpaid / Paid chips only look at invoiced orders; "Pending Invoice"
  // orders owe nothing yet, so they show under All only.
  const orderStatusCounts = useMemo(() => {
    let unpaid = 0;
    let paid = 0;
    memberFilteredOrders.forEach((ord) => {
      if (!ord.has_invoice) return;
      if (orderPayment(ord.order_id).isPaid) paid += 1;
      else unpaid += 1;
    });
    return { all: memberFilteredOrders.length, unpaid, paid };
  }, [memberFilteredOrders, orderPayment]);

  const statusFilteredOrders = useMemo(() => {
    if (orderStatus === "all") return memberFilteredOrders;
    return memberFilteredOrders.filter((ord) => {
      if (!ord.has_invoice) return false;
      const { isPaid } = orderPayment(ord.order_id);
      return orderStatus === "paid" ? isPaid : !isPaid;
    });
  }, [memberFilteredOrders, orderStatus, orderPayment]);

  // Pagination state & Infinite Scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [fromDate, toDate, quickFilter, orderStatus]);
  const shownOrders = useMemo(() => statusFilteredOrders.slice(0, visibleCount), [statusFilteredOrders, visibleCount]);

  const observerTarget = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && statusFilteredOrders.length > visibleCount) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [statusFilteredOrders.length, visibleCount]);

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
      const {
        inv,
        isPayerSelf,
        amountUSD: orderMemberAmountUSD,
        isPaid: orderIsPaid,
      } = orderPayment(ord.order_id);
      const payerName = isPayerSelf ? "Self (Payer)" : (inv?.payer_name || "Unknown Payer");

      const orderRate = inv?.usd_khr_rate && inv.usd_khr_rate > 0 ? inv.usd_khr_rate : activeRate;

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

      // Group amount spent to each payer (exclude self orders from unpaid debt)
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
  }, [memberFilteredOrders, orderPayment, rateInfo]);

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

  // Unpaid bills inside the selected From → To range. /invoices is already
  // range-filtered server-side, so settling exactly these is "what you see".
  // Already-paid ones are skipped, or their real PayWay payment record would
  // be overwritten with an ADMIN_ settle.
  const rangeUnpaid = useMemo(() => {
    const list = invoices
      .filter((inv) => (inv.my_amount ?? 0) > 0 && !inv.my_paid && !inv.is_payer)
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
    const dueUSD = list.reduce((sum, inv) => sum + (inv.my_due ?? inv.my_amount ?? 0), 0);
    const dueKHR = list.reduce((sum, inv) => sum + (inv.my_due_khr ?? inv.my_amount_khr ?? 0), 0);
    return { list, dueUSD, dueKHR };
  }, [invoices]);

  const rangeLabel = useMemo(() => {
    const fmt = (d: string) => format(new Date(d + "T00:00:00"), "MMM d, yyyy");
    if (!fromDate && !toDate) return "All time";
    if (fromDate && toDate) return fromDate === toDate ? fmt(fromDate) : `${fmt(fromDate)} → ${fmt(toDate)}`;
    return fromDate ? `From ${fmt(fromDate)}` : `Up to ${fmt(toDate)}`;
  }, [fromDate, toDate]);

  const handleBulkMarkPaid = async () => {
    if (!member) return;
    const unpaidInvoiceIds = rangeUnpaid.list.map((inv) => inv.invoice_id || inv.order_id);

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
        note: settleNote.trim(),
      });

      invalidateInvoiceCache();

      setSettleNote("");
      toast(`Settled ${unpaidInvoiceIds.length} ${unpaidInvoiceIds.length === 1 ? "bill" : "bills"} (${rangeLabel})`, "success");
      loadData();
      onUpdated?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setBulkUpdating(false);
    }
  };

  // Payments tab: bank transfers matched to this member, plus admin manual
  // settles (those leave no payment row, only ADMIN_<id> on the bill).
  const transactions = useMemo(() => {
    const rows: TransactionRow[] = payments.map((p) => ({
      key: `bank-${p.payment_id}`,
      kind: "bank",
      at: p.created_at,
      amountUSD: p.amount_usd || 0,
      title: p.sender_name || "Bank transfer",
      subtitle: [
        p.currency && p.currency !== "USD" ? `${p.amount.toLocaleString()} ${p.currency}` : "",
        p.trx_id ? `Trx ${p.trx_id}` : "",
      ].filter(Boolean).join(" · "),
      status: p.status || "MATCHED",
      orderDates: (p.settled_orders || []).map((o) => o.date || "").filter(Boolean),
    }));

    // Group a member's admin-settled bills by settle time: one "Mark All as
    // Paid" click becomes one transaction, not one row per bill.
    const manual = new Map<string, TransactionRow>();
    invoices.forEach((inv) => {
      (inv.details || []).forEach((d) => {
        if (!isMemberIdentity(d.user_id, d.user_name) || !d.paid || d.is_payer) return;
        if (!String(d.payment_id || "").startsWith("ADMIN_")) return;
        const at = d.paid_at || "";
        const groupKey = `manual-${at.slice(0, 16)}-${d.payment_id}`;
        const row = manual.get(groupKey) || {
          key: groupKey,
          kind: "manual" as const,
          at,
          amountUSD: 0,
          title: "Marked paid by admin",
          subtitle: d.paid_note || "Cash / manual settle",
          status: "MANUAL",
          orderDates: [],
        };
        row.amountUSD += d.paid_amount || d.subtotal || 0;
        row.orderDates.push(inv.order_date);
        manual.set(groupKey, row);
      });
    });

    // Transfers the bot couldn't tie to anyone (no user_id, so never in the
    // member's own list). Shown so an admin can assign one to this member.
    const unmatched: TransactionRow[] = unmatchedPayments.map((p) => ({
      key: `unmatched-${p.payment_id}`,
      kind: "bank",
      at: p.created_at,
      amountUSD: p.amount_usd || 0,
      title: p.sender_name || "Unknown sender",
      subtitle: p.trx_id ? `Trx ${p.trx_id}` : "",
      status: "UNMATCHED",
      orderDates: [],
      payment: p,
    }));

    return [...rows, ...manual.values(), ...unmatched].sort((a, b) => b.at.localeCompare(a.at));
  }, [payments, unmatchedPayments, invoices, isMemberIdentity]);

  const paymentStatusCounts = useMemo(() => {
    const unmatched = transactions.filter((t) => t.status === "UNMATCHED").length;
    return { all: transactions.length, matched: transactions.length - unmatched, unmatched };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    if (paymentStatus === "all") return transactions;
    return transactions.filter((t) =>
      paymentStatus === "unmatched" ? t.status === "UNMATCHED" : t.status !== "UNMATCHED"
    );
  }, [transactions, paymentStatus]);

  const transactionsTotalUSD = useMemo(
    () => transactions.reduce((sum, t) => sum + (t.status === "UNMATCHED" ? 0 : t.amountUSD), 0),
    [transactions]
  );

  // Assign an unmatched transfer to this member: the backend records the
  // user_id and re-runs settlement, paying their oldest unpaid bills FIFO.
  const handleAssignPayment = async () => {
    if (!member || !assignTarget) return;
    setAssigning(true);
    try {
      await api.post(`/payments/${encodeURIComponent(assignTarget.payment_id)}/assign`, {
        user_id: member.user_id,
      });
      invalidateInvoiceCache();
      toast(`Assigned $${(assignTarget.amount_usd || 0).toFixed(2)} to ${displayName}`, "success");
      setAssignTarget(null);
      loadData();
      onUpdated?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setAssigning(false);
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
              <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" /> Total Paid
                </div>
                <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                  ${stats.totalPaidUSD.toFixed(2)}
                </div>
                <div className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  {stats.paidOrdersCount} {stats.paidOrdersCount === 1 ? "order" : "orders"} paid
                </div>
              </div>

              <div className={`px-3 py-2 rounded-[var(--radius-sm)] border transition-all ${
                stats.totalUnpaidUSD > 0.009 
                  ? "bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/30" 
                  : "bg-[var(--surface-2)] border-[var(--border)]"
              }`}>
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  stats.totalUnpaidUSD > 0.009 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                }`}>
                  <AlertCircle size={12} className={stats.totalUnpaidUSD > 0.009 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"} /> Unpaid Debt
                </div>
                <div className={`text-sm font-extrabold mt-1 ${
                  stats.totalUnpaidUSD > 0.009 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                }`}>
                  ${stats.totalUnpaidUSD.toFixed(2)}
                </div>
                <div className={`text-[10px] mt-0.5 ${
                  stats.totalUnpaidUSD > 0.009 ? "text-rose-700/90 dark:text-rose-400/90 font-semibold" : "text-[var(--text-muted)] font-medium"
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
              <div className="px-3 py-2 rounded-[var(--radius-sm)] bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" /> Total Paid
                </div>
                <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                  {formatKhr(stats.totalPaidKHR)}
                </div>
                <div className="text-[10px] font-medium text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  {stats.paidOrdersCount} {stats.paidOrdersCount === 1 ? "order" : "orders"} paid
                </div>
              </div>

              <div className={`px-3 py-2 rounded-[var(--radius-sm)] border transition-all ${
                stats.totalUnpaidKHR > 0.009 
                  ? "bg-rose-500/10 dark:bg-rose-500/15 border-rose-500/30" 
                  : "bg-[var(--surface-2)] border-[var(--border)]"
              }`}>
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  stats.totalUnpaidKHR > 0.009 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                }`}>
                  <AlertCircle size={12} className={stats.totalUnpaidKHR > 0.009 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"} /> Unpaid Debt
                </div>
                <div className={`text-sm font-extrabold mt-1 ${
                  stats.totalUnpaidKHR > 0.009 ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"
                }`}>
                  {formatKhr(stats.totalUnpaidKHR)}
                </div>
                <div className={`text-[10px] mt-0.5 ${
                  stats.totalUnpaidKHR > 0.009 ? "text-rose-700/90 dark:text-rose-400/90 font-semibold" : "text-[var(--text-muted)] font-medium"
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

        {/* Tabs: Orders (bills) | Payments (transactions) */}
        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)]"
        >
          {([
            { id: "orders", label: "Orders (Bills)", icon: <Receipt size={13} />, count: memberFilteredOrders.length },
            { id: "payments", label: "Payments", icon: <ArrowLeftRight size={13} />, count: paymentStatusCounts.matched },
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                tab === t.id
                  ? "bg-[var(--surface)] text-[var(--color-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.icon} {t.label}
              <span className="text-[10px] font-semibold opacity-70">({t.count})</span>
            </button>
          ))}
        </div>

        {tab === "orders" && (
        <>
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

        {/* Admin: settle every unpaid bill in the From → To range above */}
        {isAdmin && rangeUnpaid.list.length > 0 && (
          <div className="flex items-center justify-between p-2.5 rounded-[var(--radius-md)] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 shadow-xs gap-2">
            <div className="text-xs min-w-0">
              <span className="font-bold text-amber-900 dark:text-amber-200 block text-xs">
                ⚡ Unpaid {rangeLabel}: ${rangeUnpaid.dueUSD.toFixed(2)} ({formatKhr(rangeUnpaid.dueKHR)})
              </span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                Settles {rangeUnpaid.list.length} unpaid {rangeUnpaid.list.length === 1 ? "bill" : "bills"} in this date range. Change From / To above to settle a different period.
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
              Settle Range
            </Button>
          </div>
        )}

        {/* Items & Dishes Breakdown List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Complete Order History ({statusFilteredOrders.length})
            </h4>
            {stats.unpaidOrdersCount > 0 && (
              <Badge variant="danger" className="text-[9px] py-0.2 px-1.5 font-bold">
                {stats.unpaidOrdersCount} Unpaid
              </Badge>
            )}
          </div>

          <StatusChips
            value={orderStatus}
            onChange={setOrderStatus}
            options={[
              { id: "all", label: "All", count: orderStatusCounts.all },
              { id: "unpaid", label: "Unpaid", count: orderStatusCounts.unpaid, tone: "danger" },
              { id: "paid", label: "Paid", count: orderStatusCounts.paid, tone: "success" },
            ]}
          />

          {loading ? (
            <Card padding="sm" className="space-y-2 border border-[var(--border)]">
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : statusFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={28} />}
              title={orderStatus === "all" ? "No spend history" : orderStatus === "unpaid" ? "No unpaid bills" : "No paid bills"}
              description={
                orderStatus === "all"
                  ? "This member has no recorded food orders matching the selected date range."
                  : `No ${orderStatus} bills for this member in the selected date range.`
              }
            />
          ) : (
            <div className="space-y-2.5">
              {shownOrders.map((ord) => {
                const {
                  inv,
                  cachedInv,
                  isPayerSelf,
                  amountUSD: orderSubtotal,
                  isPaid,
                } = orderPayment(ord.order_id);
                const payer = inv?.payer_name || "Payer";
                const paidNote = isPaid
                  ? (inv?.details || []).find((d) => isMemberIdentity(d.user_id, d.user_name) && d.paid_note)?.paid_note
                  : undefined;

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
                          {isPayerSelf ? "Payer (Self)" : `Payer: ${payer}`}
                        </Badge>
                        {ord.has_invoice ? (
                          <>
                            {isPayerSelf && isPaid ? (
                              <Badge variant="success" className="text-[9px] py-0 px-1.5 font-bold">
                                ✓ Paid (Payer)
                              </Badge>
                            ) : isPaid ? (
                              <Badge variant="success" className="text-[9px] py-0 px-1.5 font-bold">
                                ✓ Paid
                              </Badge>
                            ) : (
                              <Badge variant="danger" className="text-[9px] py-0 px-1.5 font-bold">
                                Unpaid
                              </Badge>
                            )}
                            {isAdmin && !isPayerSelf && (
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
                        const cleanName = cleanDishName(dishName);

                        let itemPrice: number | null = null;
                        if (inv?.my_items?.length) {
                          const matchedItem = inv.my_items.find(
                            (dIt) => cleanDishName(dIt.item_name) === cleanName || dIt.item_name === dishName
                          );
                          if (matchedItem) itemPrice = matchedItem.cost || (matchedItem.price * qty);
                        }
                        if (itemPrice === null && cachedInv?.details) {
                          const mDetail = cachedInv.details.find((d) => isMemberIdentity(d.user_id, d.user_name));
                          const matchedItem = mDetail?.items.find(
                            (dIt) => cleanDishName(dIt.item_name) === cleanName || dIt.item_name === dishName
                          );
                          if (matchedItem) itemPrice = matchedItem.cost || (matchedItem.price * qty);
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

                    {paidNote && (
                      <div className="text-[10px] text-[var(--text-muted)] italic px-1">
                        📝 {paidNote}
                      </div>
                    )}

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

              {statusFilteredOrders.length > visibleCount && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={13} className="animate-bounce" />
                    Load more ({statusFilteredOrders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </>
        )}

        {tab === "payments" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Transactions · {rangeLabel}
              </h4>
              <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                ${transactionsTotalUSD.toFixed(2)} received
              </span>
            </div>

            <StatusChips
              value={paymentStatus}
              onChange={setPaymentStatus}
              options={[
                { id: "all", label: "All", count: paymentStatusCounts.all },
                { id: "matched", label: "Matched", count: paymentStatusCounts.matched, tone: "success" },
                // Unmatched transfers are admin-only data (members only see their own).
                ...(isAdmin
                  ? [{ id: "unmatched" as const, label: "Not matched", count: paymentStatusCounts.unmatched, tone: "danger" as const }]
                  : []),
              ]}
            />

            {loading ? (
              <Card padding="sm" className="space-y-2 border border-[var(--border)]">
                <SkeletonRow />
                <SkeletonRow />
              </Card>
            ) : filteredTransactions.length === 0 ? (
              <EmptyState
                icon={<Wallet size={28} />}
                title={paymentStatus === "unmatched" ? "No unmatched transfers" : "No payments"}
                description={
                  paymentStatus === "unmatched"
                    ? "Every bank transfer in the selected date range is matched to a member."
                    : "No bank transfers or manual settlements for this member in the selected date range."
                }
              />
            ) : (
              <div className="space-y-2">
                {paymentStatus !== "matched" && paymentStatusCounts.unmatched > 0 && (
                  <p className="text-[10px] text-[var(--text-muted)] px-1">
                    Not matched = transfers the bot couldn&apos;t tie to any member. If one is from {displayName}, tap Assign to settle their oldest unpaid bills with it.
                  </p>
                )}
                {filteredTransactions.map((t) => {
                  const statusVariant =
                    t.status === "UNMATCHED" ? "danger" : t.kind === "manual" ? "admin" : "success";
                  const when = t.at ? new Date(t.at) : null;
                  const dates = [...new Set(t.orderDates)].sort();
                  return (
                    <Card key={t.key} variant="flat" padding="sm" className="border border-[var(--border)] space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            t.kind === "bank"
                              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-[var(--surface-2)] text-[var(--text-muted)]"
                          }`}>
                            {t.kind === "bank" ? <Landmark size={13} /> : <User size={13} />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-[var(--text)] truncate">{t.title}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">
                              {when && !isNaN(when.getTime()) ? format(when, "MMM d, yyyy · HH:mm") : "—"}
                              {t.subtitle ? ` · ${t.subtitle}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <div className="text-xs font-extrabold text-[var(--color-primary)]">
                            ${t.amountUSD.toFixed(2)}
                          </div>
                          <Badge variant={statusVariant} className="text-[9px] py-0 px-1.5 font-bold">
                            {t.status === "UNMATCHED" ? "NOT MATCHED" : t.status}
                          </Badge>
                        </div>
                      </div>
                      {isAdmin && t.payment && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={assigning}
                            onClick={() => setAssignTarget(t.payment ?? null)}
                            className="px-2 py-0.5 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-60"
                          >
                            <Check size={10} /> Assign to {displayName}
                          </button>
                        </div>
                      )}
                      {dates.length > 0 && (
                        <div className="text-[10px] text-[var(--text-muted)] pl-9">
                          Settled bills: {dates.map((d) => format(new Date(d + "T00:00:00"), "MMM d")).join(", ")}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation: Assign an unmatched transfer to this member */}
      <ConfirmDialog
        open={!!assignTarget}
        onClose={() => { if (!assigning) setAssignTarget(null); }}
        onConfirm={handleAssignPayment}
        title="Assign Transfer"
        variant="success"
        confirmText="Yes, Assign & Settle"
        loading={assigning}
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              Assign <strong>${(assignTarget?.amount_usd || 0).toFixed(2)}</strong> from{" "}
              <span className="font-bold">{assignTarget?.sender_name || "Unknown sender"}</span> to{" "}
              <span className="font-bold">{displayName}</span>?
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              It settles {displayName}&apos;s oldest unpaid bills first
              {assignTarget?.trx_id ? <> · Trx <span className="font-mono">{assignTarget.trx_id}</span></> : null}.
            </p>
          </div>
        }
      />

      {/* Confirmation: Bulk Settle All for this Member */}
      <ConfirmDialog
        open={confirmBulkSettle}
        onClose={() => setConfirmBulkSettle(false)}
        onConfirm={() => {
          setConfirmBulkSettle(false);
          handleBulkMarkPaid();
        }}
        title="Confirm Settle Range"
        variant="success"
        confirmText="Yes, Mark as Paid"
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              Mark {rangeUnpaid.list.length} unpaid {rangeUnpaid.list.length === 1 ? "bill" : "bills"} as{" "}
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span> for{" "}
              <span className="font-bold">{displayName}</span>?
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Range: <strong className="text-[var(--text)]">{rangeLabel}</strong>
              {rangeUnpaid.list.length > 0 && (
                <> ({rangeUnpaid.list.map((inv) => format(new Date(inv.order_date + "T00:00:00"), "MMM d")).join(", ")})</>
              )}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Total to settle: <strong className="text-[var(--text)]">${rangeUnpaid.dueUSD.toFixed(2)} ({formatKhr(rangeUnpaid.dueKHR)})</strong>.
            </p>
            <label className="block text-left mt-3">
              <span className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-0.5">
                Note (optional)
              </span>
              <textarea
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                maxLength={SETTLE_NOTE_MAX}
                rows={2}
                placeholder="e.g. Paid cash to Tii, ABA transfer from wife's account…"
                className="w-full px-2.5 py-1.5 text-xs rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
              />
              <span className="block text-right text-[9px] text-[var(--text-muted)]">
                {settleNote.length}/{SETTLE_NOTE_MAX}
              </span>
            </label>
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
