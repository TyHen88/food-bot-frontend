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
  SlidersHorizontal
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import type { Order, OrderItem } from "@/components/orders/OrderItemsEditor";

interface Member {
  user_id: string;
  name?: string;
  full_name?: string;
  username?: string;
  phone?: string;
  role: string;
  status: string;
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
}

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  payer_name: string;
  details?: InvoicePersonDetail[];
}

type QuickFilter = "today" | "week" | "month" | "all" | "custom";
const PAGE_SIZE = 10;

export function MemberSpendModal({
  member,
  open,
  onClose,
}: {
  member: Member | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceDetailsMap, setInvoiceDetailsMap] = useState<Record<string, InvoicePersonDetail[]>>({});
  const [loading, setLoading] = useState(false);

  // Date filters
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

  const normName = useCallback((str?: any): string => {
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

  const isMemberIdentity = useCallback((userId?: any, userName?: any): boolean => {
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

  // Load orders & invoices for member spend analysis
  useEffect(() => {
    if (!open || !member) {
      setOrders([]);
      setInvoices([]);
      setInvoiceDetailsMap({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.get<Order[]>(`/orders${chatIdQuery(true)}`),
      api.get<InvoiceRow[]>(`/invoices${chatIdQuery(true)}`),
    ])
      .then(async ([ordersData, invoicesData]) => {
        if (cancelled) return;
        const fetchedOrders = Array.isArray(ordersData) ? ordersData : [];
        const fetchedInvoices = Array.isArray(invoicesData) ? invoicesData : [];

        setOrders(fetchedOrders);
        setInvoices(fetchedInvoices);

        // Fetch invoice details for invoices to get per-person dish costs
        const detailsMap: Record<string, InvoicePersonDetail[]> = {};
        await Promise.all(
          fetchedInvoices.slice(0, 30).map(async (inv) => {
            try {
              const detail = await api.get<{ details?: InvoicePersonDetail[] }>(`/invoices/${inv.invoice_id}`);
              if (detail?.details) {
                detailsMap[inv.order_id || inv.invoice_id] = detail.details;
              }
            } catch (_) {}
          })
        );
        if (!cancelled) {
          setInvoiceDetailsMap(detailsMap);
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

  // Statistics & Payer breakdown calculation
  const stats = useMemo(() => {
    let totalSpend = 0;
    let totalItemsCount = 0;
    const paidToMap = new Map<string, { total: number; count: number }>();

    memberFilteredOrders.forEach((ord) => {
      const inv = invoiceMapByOrderId.get(ord.order_id);
      const payerName = inv?.payer_name || ord.paid_by?.username || "Unknown Payer";

      let orderMemberAmount = 0;
      const invDetails = invoiceDetailsMap[ord.order_id];

      if (invDetails) {
        const mDetail = invDetails.find((d) => isMemberIdentity(d.user_id, d.user_name));
        if (mDetail) orderMemberAmount = mDetail.subtotal;
      }

      totalSpend += orderMemberAmount;

      const orderItemQty = ord.memberItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
      totalItemsCount += orderItemQty;

      // Group amount spent to each payer
      const current = paidToMap.get(payerName) || { total: 0, count: 0 };
      paidToMap.set(payerName, {
        total: current.total + orderMemberAmount,
        count: current.count + 1,
      });
    });

    const paidToList = Array.from(paidToMap.entries()).map(([payerName, stat]) => ({
      payerName,
      amount: stat.total,
      orderCount: stat.count,
    }));

    return {
      totalSpend,
      totalOrdersCount: memberFilteredOrders.length,
      totalItemsCount,
      paidToList,
    };
  }, [memberFilteredOrders, invoiceMapByOrderId, invoiceDetailsMap, isMemberIdentity]);

  const displayName = member?.name || member?.full_name || `User ${member?.user_id}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`💳 ${displayName}'s Spend Details`}
      maxWidth="600px"
      footer={<Button size="sm" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3.5">
        {/* Date Filter Bar */}
        <Card variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "week", label: "This Week" },
              { id: "month", label: "This Month" },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => handleQuickFilter(pill.id as QuickFilter)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors border cursor-pointer ${
                  quickFilter === pill.id
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-sm"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border)]">
            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                From Date
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setQuickFilter("custom");
                  }}
                  className="w-full pl-9 pr-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1">
                To Date
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setQuickFilter("custom");
                  }}
                  className="w-full pl-9 pr-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px]"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Top Summary Stat Cards */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<Wallet size={18} />}
            value={`$${stats.totalSpend.toFixed(2)}`}
            label="Total Spend"
            color="primary"
            padding="sm"
          />
          <StatCard
            icon={<Utensils size={18} />}
            value={`${stats.totalItemsCount} items`}
            label={`Across ${stats.totalOrdersCount} orders`}
            color="accent"
            padding="sm"
          />
        </div>

        {/* Payer Breakdown Card: Amount spent to each payer */}
        <Card variant="default" padding="sm" className="space-y-2">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-1.5">
            <CreditCard size={16} className="text-[var(--color-primary)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Amount Spent To Payers
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {stats.paidToList.length > 0 ? (
              stats.paidToList.map(({ payerName, amount, orderCount }) => (
                <div 
                  key={payerName}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface-2)] text-xs font-medium"
                >
                  <span className="truncate text-[var(--text)] font-semibold">
                    Paid to {payerName}
                  </span>
                  <span className="font-bold text-[var(--color-primary)] whitespace-nowrap ml-2">
                    ${amount.toFixed(2)} <span className="text-[10px] text-[var(--text-muted)] font-normal">({orderCount}x)</span>
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--text-muted)] italic col-span-2">No payer records found</p>
            )}
          </div>
        </Card>

        {/* Items & Dishes Breakdown List */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] px-1">
            Order Breakdown ({memberFilteredOrders.length})
          </h4>

          {loading ? (
            <Card padding="sm" className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : memberFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={28} />}
              title="No spend history"
              description="This member has no recorded food orders matching the date range."
            />
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {shownOrders.map((ord) => {
                const inv = invoiceMapByOrderId.get(ord.order_id);
                const payer = inv?.payer_name || ord.paid_by?.username || "Payer";
                const invDetails = invoiceDetailsMap[ord.order_id];

                let orderSubtotal = 0;
                if (invDetails) {
                  const mDetail = invDetails.find((d) => isMemberIdentity(d.user_id, d.user_name));
                  if (mDetail) orderSubtotal = mDetail.subtotal;
                }

                return (
                  <Card key={ord.order_id} variant="flat" padding="sm" className="space-y-2 border border-[var(--border)]">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--color-primary)]">
                          {format(new Date(ord.order_date + "T00:00:00"), "MMM d, yyyy")}
                        </span>
                        {ord.chat_title && (
                          <Badge variant="member" className="text-[10px]">
                            {ord.chat_title}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="admin" className="text-[10px]">
                        Paid to {payer}
                      </Badge>
                    </div>

                    {/* Member's Dishes */}
                    <div className="space-y-1">
                      {ord.memberItems.map((it, idx) => {
                        const dishName = it.item_name || it.name || "Dish";
                        const qty = Number(it.qty) || 1;

                        let itemPrice: number | null = null;
                        if (invDetails) {
                          const mDetail = invDetails.find((d) => isMemberIdentity(d.user_id, d.user_name));
                          const matchedItem = mDetail?.items.find((dIt) => dIt.item_name === dishName);
                          if (matchedItem) itemPrice = matchedItem.cost;
                        }

                        return (
                          <div 
                            key={idx}
                            className="flex items-center justify-between text-xs py-0.5 px-2 rounded bg-[var(--surface-2)]"
                          >
                            <span className="truncate text-[var(--text)]">
                              • {dishName} <span className="font-bold text-[10px] text-[var(--text-2)]">×{qty}</span>
                            </span>
                            {itemPrice !== null && (
                              <span className="font-bold font-mono text-[var(--text)] whitespace-nowrap">
                                ${itemPrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {orderSubtotal > 0 && (
                      <div className="flex justify-end text-xs font-bold text-[var(--color-primary)] pt-1 border-t border-dashed border-[var(--border)]">
                        Subtotal: ${orderSubtotal.toFixed(2)}
                      </div>
                    )}
                  </Card>
                );
              })}

              {memberFilteredOrders.length > visibleCount && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={14} className="animate-bounce" />
                    Scroll to load more ({memberFilteredOrders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
