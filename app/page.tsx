"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, getDay } from "date-fns";
import {
  ChevronLeft, ChevronRight, ShoppingBag, BarChart3, CalendarDays,
  BookTemplate, CalendarClock, Settings, History, Sparkles, Coins,
  CheckCircle2, Clock, AlertCircle, DollarSign, UserCheck, UserX,
  Receipt, Share2, Check, RotateCcw, Wallet, Users, ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card, StatCard } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TopBar, DesktopHeader } from "@/components/layout/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OrderItemsEditor, type Order } from "@/components/orders/OrderItemsEditor";
import { InvoiceViewModal } from "@/components/orders/InvoiceViewModal";

interface DaySummary {
  count: number;
  orderIds: string[];
  orders: Order[];
  invoices: InvoiceRow[];
  totalSpend: number;
  totalPaid: number;
  totalDue: number;
  allPaid: boolean;
  hasUnpaid: boolean;
}

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  total_khr?: number;
  payer_name: string;
  payer_user_id?: string;
  person_count: number;
  paid_count: number;
  unpaid_count: number;
  all_paid: boolean;
  paid_members?: DayMemberPayment[];
  unpaid_members?: DayMemberDebt[];
  details?: any[];
}

interface DayMemberPayment {
  user_id: string;
  user_name: string;
  amount: number;
  amount_khr?: number;
  paid_at?: string;
  payment_id?: string;
  items?: Array<{ item_name?: string; qty?: number; price?: number }>;
}

interface DayMemberDebt {
  user_id: string;
  user_name: string;
  subtotal: number;
  due: number;
  due_khr?: number;
  items?: Array<{ item_name?: string; qty?: number; price?: number }>;
}

interface DayOrderInfo {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  payer_name?: string;
  payer_user_id?: string;
  total: number;
  total_khr?: number;
  item_count?: number;
}

interface DaySummaryResponse {
  date: string;
  chat_id?: string;
  total_spend: number;
  total_paid: number;
  total_due: number;
  total_spend_khr: number;
  total_paid_khr: number;
  total_due_khr: number;
  usd_khr_rate: number;
  paid_count: number;
  unpaid_count: number;
  all_paid: boolean;
  paid_members: DayMemberPayment[];
  unpaid_members: DayMemberDebt[];
  orders: DayOrderInfo[];
}

const QUICK_ACTIONS = [
  { href: "/ai", icon: Sparkles, label: "Ask AI", desc: "Chat about your orders",
    iconClass: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500" },
  { href: "/templates", icon: BookTemplate, label: "Templates", desc: "Manage food menus",
    iconClass: "bg-[var(--color-primary-light)] text-[var(--color-primary)]", adminOnly: true },
  { href: "/schedule", icon: CalendarClock, label: "Schedule", desc: "Timing & reminders",
    iconClass: "bg-blue-50 dark:bg-blue-950/30 text-blue-500", adminOnly: true },
  { href: "/settings", icon: Settings, label: "Settings", desc: "Configure global keys",
    iconClass: "bg-orange-50 dark:bg-orange-950/30 text-orange-500", adminOnly: true },
  { href: "/history", icon: History, label: "History", desc: "Audit logs & events",
    iconClass: "bg-purple-50 dark:bg-purple-950/30 text-purple-500", adminOnly: true },
];

export default function DashboardPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(() => new Date());
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [rateData, setRateData] = useState<{ usd_khr?: number; display?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Selected day & detail modal
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummaryResponse | null>(null);
  const [loadingDaySummary, setLoadingDaySummary] = useState(false);
  const [dayModalTab, setDayModalTab] = useState<"paid" | "unpaid" | "orders">("paid");

  // Secondary invoice full modal
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  // Settle confirmation dialog inside calendar day modal
  const [settleMemberTarget, setSettleMemberTarget] = useState<DayMemberDebt | null>(null);
  const [settlingMember, setSettlingMember] = useState(false);

  const loadMonth = useCallback(async (m: Date) => {
    setLoading(true);
    try {
      const from = format(startOfMonth(m), "yyyy-MM-dd");
      const to   = format(endOfMonth(m),   "yyyy-MM-dd");
      const [ordersRes, invoicesRes, rateRes] = await Promise.all([
        api.get<Order[] | { items: Order[] }>(`/orders?from=${from}&to=${to}${chatIdQuery()}`).catch(() => []),
        api.get<InvoiceRow[] | { items: InvoiceRow[] }>(`/invoices?from=${from}&to=${to}${chatIdQuery()}`).catch(() => []),
        api.get<{ usd_khr?: number; display?: string }>(`/exchange-rate${chatIdQuery()}`).catch(() => null),
      ]);

      const rawOrders = Array.isArray(ordersRes)
        ? ordersRes
        : (ordersRes && "items" in ordersRes && Array.isArray(ordersRes.items))
        ? ordersRes.items
        : [];
      const rawInvoices = Array.isArray(invoicesRes)
        ? invoicesRes
        : (invoicesRes && "items" in invoicesRes && Array.isArray(invoicesRes.items))
        ? invoicesRes.items
        : [];

      setOrders(rawOrders);
      setInvoices(rawInvoices);
      if (rateRes) setRateData(rateRes);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
      setOrders([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    loadMonth(month);
  }, [month, loadMonth, authLoading]);

  // Load Day Summary when a date is clicked
  const handleSelectDay = useCallback(async (day: Date) => {
    setSelectedDay(day);
    setDayModalTab("paid");
    setLoadingDaySummary(true);
    const dateStr = format(day, "yyyy-MM-dd");

    try {
      const res = await api.get<DaySummaryResponse>(`/invoices/day-summary?date=${dateStr}${chatIdQuery()}`);
      setDaySummary(res);
      // Auto-focus on Unpaid tab if there are unpaid members
      if (res.unpaid_count > 0 && res.paid_count === 0) {
        setDayModalTab("unpaid");
      }
    } catch (e: unknown) {
      // Fallback: build from month invoices and orders cache
      const dayInvs = invoices.filter(inv => (inv.order_date || "").slice(0, 10) === dateStr);
      const dayOrds = orders.filter(o => (o.order_date || "").slice(0, 10) === dateStr);
      
      const paidMembers: DayMemberPayment[] = [];
      const unpaidMembers: DayMemberDebt[] = [];
      let totalSpend = 0;
      let totalPaid = 0;
      let totalDue = 0;

      dayInvs.forEach(inv => {
        totalSpend += inv.total || 0;
        if (inv.paid_members) {
          paidMembers.push(...inv.paid_members);
          totalPaid += inv.paid_members.reduce((s, m) => s + (m.amount || 0), 0);
        }
        if (inv.unpaid_members) {
          unpaidMembers.push(...inv.unpaid_members);
          totalDue += inv.unpaid_members.reduce((s, m) => s + (m.due || 0), 0);
        }
      });

      setDaySummary({
        date: dateStr,
        total_spend: totalSpend,
        total_paid: totalPaid,
        total_due: totalDue,
        total_spend_khr: Math.round(totalSpend * (rateData?.usd_khr || 4047)),
        total_paid_khr: Math.round(totalPaid * (rateData?.usd_khr || 4047)),
        total_due_khr: Math.round(totalDue * (rateData?.usd_khr || 4047)),
        usd_khr_rate: rateData?.usd_khr || 4047,
        paid_count: paidMembers.length,
        unpaid_count: unpaidMembers.length,
        all_paid: dayInvs.length > 0 && unpaidMembers.length === 0,
        paid_members: paidMembers,
        unpaid_members: unpaidMembers,
        orders: dayOrds.map(o => ({
          invoice_id: o.order_id,
          order_id: o.order_id,
          chat_id: o.chat_id || "",
          chat_title: o.chat_title,
          payer_name: o.paid_by?.username || "",
          total: 0,
          item_count: o.items?.length || 0,
        })),
      });
    } finally {
      setLoadingDaySummary(false);
    }
  }, [invoices, orders, rateData]);

  // Handle instant admin settlement from Calendar Day Modal
  const handleSettleMember = async () => {
    if (!settleMemberTarget || !settleMemberTarget.user_id) return;
    setSettlingMember(true);
    try {
      await api.post(`/members/${settleMemberTarget.user_id}/settle${chatIdQuery()}`, {});
      toast(`Marked all debts as paid for ${settleMemberTarget.user_name}`, "success");
      setSettleMemberTarget(null);
      if (selectedDay) {
        handleSelectDay(selectedDay);
      }
      loadMonth(month);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSettlingMember(false);
    }
  };

  // Copy Telegram reminder text for unpaid member
  const handleCopyReminder = (m: DayMemberDebt) => {
    const dayLabel = selectedDay ? format(selectedDay, "EEEE, d MMM yyyy") : "lunch order";
    const khr = m.due_khr ? ` (${m.due_khr.toLocaleString()} ៛)` : "";
    const dishes = (m.items || []).map(it => it.item_name).filter(Boolean).join(", ");
    const dishLine = dishes ? `\n🍴 Dishes: ${dishes}` : "";
    const msg = `📢 Lunch Payment Reminder (${dayLabel}):\n• ${m.user_name}: $${m.due.toFixed(2)}${khr}${dishLine}\n\nPlease scan ABA KHQR to settle. Thank you! 🙏`;

    navigator.clipboard.writeText(msg).then(
      () => toast(`Reminder copied for ${m.user_name}! Paste in Telegram group.`, "success"),
      () => toast("Failed to copy reminder", "error")
    );
  };

  // Build per-day summaries from orders and invoices
  const dayMap = useMemo(() => {
    const map: Record<string, DaySummary> = {};

    for (const o of orders) {
      const key = o.order_date?.slice(0, 10) ?? "";
      if (!key) continue;
      if (!map[key]) {
        map[key] = {
          count: 0,
          orderIds: [],
          orders: [],
          invoices: [],
          totalSpend: 0,
          totalPaid: 0,
          totalDue: 0,
          allPaid: true,
          hasUnpaid: false,
        };
      }
      map[key].count += o.item_count ?? o.items?.length ?? 1;
      map[key].orderIds.push(o.order_id);
      map[key].orders.push(o);
    }

    for (const inv of invoices) {
      const key = inv.order_date?.slice(0, 10) ?? "";
      if (!key) continue;
      if (!map[key]) {
        map[key] = {
          count: 0,
          orderIds: [],
          orders: [],
          invoices: [],
          totalSpend: 0,
          totalPaid: 0,
          totalDue: 0,
          allPaid: true,
          hasUnpaid: false,
        };
      }
      map[key].invoices.push(inv);
      map[key].totalSpend += inv.total || 0;
      const unpaidDue = (inv.unpaid_members || []).reduce((s, m) => s + (m.due || 0), 0);
      map[key].totalDue += unpaidDue;
      const paidAmt = (inv.paid_members || []).reduce((s, m) => s + (m.amount || 0), 0);
      map[key].totalPaid += paidAmt;
      if (unpaidDue > 0.009) {
        map[key].allPaid = false;
        map[key].hasUnpaid = true;
      }
    }

    return map;
  }, [orders, invoices]);

  // Monthly KPIs
  const totalItemsOrdered = orders.reduce((s, o) => s + (o.item_count ?? o.items?.length ?? 1), 0);
  const activeDaysCount = Object.keys(dayMap).length;
  const monthTotalSpend = invoices.reduce((s, inv) => s + (inv.total || 0), 0);
  const monthTotalDue = invoices.reduce((s, inv) => s + ((inv.unpaid_members || []).reduce((a, b) => a + (b.due || 0), 0)), 0);
  const monthTotalPaid = Math.max(0, monthTotalSpend - monthTotalDue);
  const monthPaidPercent = monthTotalSpend > 0 ? Math.round((monthTotalPaid / monthTotalSpend) * 100) : 100;

  // Calendar dates
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const firstDow = getDay(days[0]);
  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="page-content max-w-5xl mx-auto px-3.5 sm:px-4 pt-3.5 space-y-4">
        <DesktopHeader
          title="Dashboard"
          subtitle={format(month, "MMMM yyyy")}
        />

        {/* 1. Monthly Financial KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {loading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          ) : (
            <>
              <StatCard 
                icon={<ShoppingBag size={18} />}  
                value={`$${monthTotalSpend.toFixed(2)}`}  
                label="Monthly Spend"   
                color="primary" 
                padding="sm" 
              />
              <StatCard 
                icon={<CheckCircle2 size={18} />}    
                value={`$${monthTotalPaid.toFixed(2)}`} 
                label={`Paid (${monthPaidPercent}%)`} 
                color="success"  
                padding="sm" 
              />
              <StatCard 
                icon={<AlertCircle size={18} />} 
                value={`$${monthTotalDue.toFixed(2)}`}  
                label="Unpaid Balance"      
                color={monthTotalDue > 0 ? "warning" : "success"} 
                padding="sm" 
              />
              <StatCard 
                icon={<Coins size={18} />}        
                value={rateData?.usd_khr ? `${rateData.usd_khr.toLocaleString()} ៛ / $` : "4,047 ៛ / $"} 
                label="Exchange Rate" 
                color="warning"
                padding="sm"
              />
            </>
          )}
        </div>

        {/* 2. Interactive Calendar with Who's Paid Indicators */}
        <Card variant="default" padding="none" className="overflow-hidden border border-[var(--border)] shadow-xs">
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() - 1); return n; })}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] active:scale-95 transition-all cursor-pointer border-0 text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <h2 className="text-sm sm:text-base font-bold text-[var(--text)] m-0">
                {format(month, "MMMM yyyy")}
              </h2>
              <button
                onClick={() => setMonth(m => { const n = new Date(m); n.setMonth(n.getMonth() + 1); return n; })}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] active:scale-95 transition-all cursor-pointer border-0 text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="text-[11px] h-7 px-2.5 rounded-full"
                onClick={() => setMonth(new Date())}
              >
                Today
              </Button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 px-2 pt-2.5 pb-1 bg-[var(--surface-2)]/40 border-b border-[var(--border)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-[var(--text-muted)] tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 p-2 sm:p-2.5 bg-[var(--surface)]">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[58px] sm:min-h-[74px] rounded-lg bg-transparent opacity-20" />
            ))}

            {days.map(day => {
              const key = format(day, "yyyy-MM-dd");
              const info = dayMap[key];
              const today = isToday(day);
              const isSelected = selectedKey === key;
              const hasOrders = Boolean(info && info.count > 0);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`relative flex flex-col justify-between p-1.5 sm:p-2 rounded-xl border transition-all text-left cursor-pointer min-h-[58px] sm:min-h-[74px] select-none ${
                    isSelected
                      ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 shadow-xs"
                      : today
                      ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5"
                      : hasOrders
                      ? "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]/60 hover:border-[var(--color-primary)]/40"
                      : "border-transparent hover:bg-[var(--surface-2)]/40"
                  }`}
                >
                  {/* Date number header */}
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-xs font-bold leading-none ${
                      today
                        ? "w-5 h-5 flex items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-xs"
                        : isSelected
                        ? "text-[var(--color-primary)]"
                        : "text-[var(--text)]"
                    }`}>
                      {format(day, "d")}
                    </span>

                    {hasOrders && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                        {info.count}
                      </span>
                    )}
                  </div>

                  {/* Payment Status Pill on Calendar Tile */}
                  <div className="mt-1 w-full">
                    {hasOrders ? (
                      info.allPaid ? (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[9px] sm:text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/40 truncate">
                          <Check size={10} className="shrink-0" />
                          <span className="truncate">All Paid</span>
                        </div>
                      ) : info.totalDue > 0 ? (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[9px] sm:text-[10px] font-bold border border-rose-200 dark:border-rose-800/40 truncate">
                          <Clock size={10} className="shrink-0" />
                          <span className="truncate">${info.totalDue.toFixed(2)} due</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 text-[9px] sm:text-[10px] font-bold border border-amber-200 dark:border-amber-800/40 truncate">
                          <span>Pending</span>
                        </div>
                      )
                    ) : (
                      <div className="h-4" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 3. Quick Actions Grid */}
        {!authLoading && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] m-0">
              Quick Shortcuts
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {QUICK_ACTIONS.filter(a => !a.adminOnly || isAdmin).map(({ href, icon: Icon, label, desc, iconClass }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 p-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all cursor-pointer no-underline group shadow-2xs hover:border-[var(--color-primary-light)]"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconClass} group-hover:scale-105 transition-transform`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight m-0 text-[var(--text)] group-hover:text-[var(--color-primary)] transition-colors">
                      {label}
                    </p>
                    <p className="text-[10px] m-0 truncate text-[var(--text-muted)]">
                      {desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 4. MODAL: "Who's Has Paid" Day Breakdown */}
        <Modal
          open={!!selectedDay}
          onClose={() => setSelectedDay(null)}
          title={selectedDay ? `📅 ${format(selectedDay, "EEEE, d MMMM yyyy")}` : "Day Details"}
          maxWidth="640px"
        >
          {loadingDaySummary ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : !daySummary || (daySummary.orders.length === 0 && daySummary.paid_members.length === 0 && daySummary.unpaid_members.length === 0) ? (
            <div className="text-center py-10 space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)]">
                <ShoppingBag size={24} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)] m-0">No Lunch Orders on this Day</p>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                No orders or payments were recorded for {selectedDay ? format(selectedDay, "d MMMM yyyy") : "this date"}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Financial KPI Summary Banner for this date */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border)] space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                    <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Total Lunch</div>
                    <div className="text-base font-extrabold text-[var(--text)] mt-0.5">
                      ${daySummary.total_spend.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)]">
                      {daySummary.total_spend_khr ? `${daySummary.total_spend_khr.toLocaleString()} ៛` : ""}
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Paid & Settled</div>
                    <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ${daySummary.total_paid.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-emerald-600/80 dark:text-emerald-400/80">
                      {daySummary.paid_count} member(s)
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40">
                    <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Unpaid Due</div>
                    <div className="text-base font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                      ${daySummary.total_due.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-rose-600/80 dark:text-rose-400/80">
                      {daySummary.unpaid_count} member(s)
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[var(--text-muted)]">
                    <span>Payment Completion</span>
                    <span>
                      {daySummary.total_spend > 0
                        ? `${Math.round((daySummary.total_paid / daySummary.total_spend) * 100)}%`
                        : "100%"}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${daySummary.total_spend > 0
                          ? Math.min(100, Math.round((daySummary.total_paid / daySummary.total_spend) * 100))
                          : 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Tab Selector: Who's Paid vs Who's Unpaid vs Orders */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setDayModalTab("paid")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                    dayModalTab === "paid"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <UserCheck size={14} />
                  <span>Who Has Paid ({daySummary.paid_members.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDayModalTab("unpaid")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                    dayModalTab === "unpaid"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <UserX size={14} />
                  <span>Not Paid ({daySummary.unpaid_members.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDayModalTab("orders")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border-0 cursor-pointer ${
                    dayModalTab === "orders"
                      ? "bg-[var(--color-primary)] text-white shadow-xs"
                      : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <ShoppingBag size={14} />
                  <span>Orders ({daySummary.orders.length})</span>
                </button>
              </div>

              {/* Tab 1: Who Has Paid List */}
              {dayModalTab === "paid" && (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {daySummary.paid_members.length === 0 ? (
                    <div className="p-6 text-center rounded-xl bg-[var(--surface-2)]/40 border border-dashed border-[var(--border)] space-y-1">
                      <p className="text-xs font-bold text-[var(--text-muted)] m-0">No Payments Recorded Yet</p>
                      <p className="text-[11px] text-[var(--text-muted)] m-0">
                        None of the diners on this date have a verified ABA PayWay transaction or admin settlement.
                      </p>
                    </div>
                  ) : (
                    daySummary.paid_members.map((m, idx) => (
                      <Card
                        key={`${m.user_id || m.user_name}-${idx}`}
                        variant="flat"
                        padding="sm"
                        className="border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {(m.user_name || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text)] truncate">
                                {m.user_name}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                                {m.payment_id ? (
                                  <span className="font-mono truncate">Ref: {m.payment_id}</span>
                                ) : (
                                  <span>Settled</span>
                                )}
                                {m.paid_at && (
                                  <span>• {format(new Date(m.paid_at), "HH:mm")}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                              ${m.amount.toFixed(2)}
                            </div>
                            {m.amount_khr && (
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                {m.amount_khr.toLocaleString()} ៛
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Dishes list */}
                        {m.items && m.items.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-emerald-200/50 dark:border-emerald-900/30">
                            {m.items.map((it, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"
                              >
                                {it.qty && it.qty > 1 ? `${it.qty}x ` : ""}{it.item_name || "Dish"}
                              </span>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Who Has Not Paid List */}
              {dayModalTab === "unpaid" && (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {daySummary.unpaid_members.length === 0 ? (
                    <div className="p-6 text-center rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 space-y-1">
                      <div className="w-9 h-9 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <Check size={18} />
                      </div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 m-0">All Lunch Orders Settled!</p>
                      <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 m-0">
                        Everyone on this day has completed their lunch payment.
                      </p>
                    </div>
                  ) : (
                    daySummary.unpaid_members.map((m, idx) => (
                      <Card
                        key={`${m.user_id || m.user_name}-${idx}`}
                        variant="flat"
                        padding="sm"
                        className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {(m.user_name || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text)] truncate">
                                {m.user_name}
                              </div>
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                                Pending payment
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm font-extrabold text-rose-600 dark:text-rose-400 font-mono">
                              ${m.due.toFixed(2)}
                            </div>
                            {m.due_khr && (
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                {m.due_khr.toLocaleString()} ៛
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Dishes list */}
                        {m.items && m.items.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {m.items.map((it, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]"
                              >
                                {it.qty && it.qty > 1 ? `${it.qty}x ` : ""}{it.item_name || "Dish"}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action buttons: Copy Telegram reminder + Mark as Paid (admin) */}
                        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-rose-200/50 dark:border-rose-900/30">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-[11px] h-7 gap-1 px-2.5 rounded-md"
                            onClick={() => handleCopyReminder(m)}
                          >
                            <Share2 size={12} />
                            <span>Copy Reminder</span>
                          </Button>

                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="primary"
                              className="text-[11px] h-7 gap-1 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setSettleMemberTarget(m)}
                            >
                              <Check size={12} />
                              <span>Mark Paid</span>
                            </Button>
                          )}
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Day Orders & Items */}
              {dayModalTab === "orders" && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {daySummary.orders.map(o => (
                    <Card key={o.order_id} variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--border)]">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--text)] truncate block">
                            {o.chat_title || `Order #${o.order_id.slice(-6)}`}
                          </span>
                          {o.payer_name && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              Ordered by: <span className="font-semibold text-[var(--color-primary)]">{o.payer_name}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-[10px] h-6 px-2 gap-1"
                            onClick={() => setViewInvoiceId(o.invoice_id || o.order_id)}
                          >
                            <Receipt size={11} />
                            <span>Invoice</span>
                          </Button>
                        </div>
                      </div>

                      {/* Find matching order from state for editor */}
                      {orders.find(ord => ord.order_id === o.order_id) && (
                        <OrderItemsEditor
                          order={orders.find(ord => ord.order_id === o.order_id)!}
                          isAdmin={isAdmin}
                          onSaved={() => {
                            if (selectedDay) handleSelectDay(selectedDay);
                            loadMonth(month);
                          }}
                        />
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* 5. Full Invoice View Modal */}
        {viewInvoiceId && (
          <InvoiceViewModal
            invoiceId={viewInvoiceId}
            open={!!viewInvoiceId}
            onClose={() => setViewInvoiceId(null)}
            isAdmin={isAdmin}
            onResent={() => toast("Invoice resent successfully", "success")}
          />
        )}

        {/* 6. Admin Confirm Settle Dialog */}
        <ConfirmDialog
          open={!!settleMemberTarget}
          title="Confirm Member Settlement"
          message={`Are you sure you want to mark all lunch debts as PAID for ${settleMemberTarget?.user_name} ($${settleMemberTarget?.due.toFixed(2)})?`}
          confirmText="Yes, Mark Paid"
          cancelText="Cancel"
          variant="success"
          loading={settlingMember}
          onConfirm={handleSettleMember}
          onClose={() => setSettleMemberTarget(null)}
        />
      </main>
    </>
  );
}
