"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { 
  ShoppingBag, 
  Wallet, 
  SlidersHorizontal,
  RefreshCw,
  Utensils,
  CreditCard,
  ChevronDown,
  Calendar
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar, DesktopHeader } from "@/components/layout/TopBar";
import type { Order, OrderItem } from "@/components/orders/OrderItemsEditor";

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
  payer_user_id?: string;
  my_amount?: number;
  my_amount_khr?: number | null;
  usd_khr_rate?: number;
  details?: InvoicePersonDetail[];
}

type QuickFilter = "today" | "week" | "month" | "all" | "custom";

const PAGE_SIZE = 15;

export default function MyOrdersPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceDetailsMap, setInvoiceDetailsMap] = useState<Record<string, InvoicePersonDetail[]>>({});
  const [loading, setLoading] = useState(true);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Normalization helpers for user matching
  const myUserId = useMemo(() => {
    return String(user?.id || profile?.user_id || "").trim();
  }, [user?.id, profile?.user_id]);

  const normName = useCallback((str?: any): string => {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, " ").trim();
  }, []);

  const myNames = useMemo(() => {
    const set = new Set<string>();
    if ((profile as any)?.name) set.add(normName((profile as any).name));
    if (profile?.username) set.add(normName(profile.username));
    if (profile?.full_name) set.add(normName(profile.full_name));
    if (user?.username) set.add(normName(user.username));
    if (user?.first_name) set.add(normName(user.first_name));
    if (user?.last_name) set.add(normName(user.last_name));
    const combined = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
    if (combined) set.add(normName(combined));
    return set;
  }, [profile, user, normName]);

  const isMyIdentity = useCallback((userId?: any, userName?: any): boolean => {
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

  // Load orders & invoices
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersData, invoicesData] = await Promise.all([
        api.get<Order[]>(`/orders${chatIdQuery(true)}`),
        api.get<InvoiceRow[]>(`/invoices${chatIdQuery(true)}`),
      ]);

      const fetchedOrders = Array.isArray(ordersData) ? ordersData : [];
      const fetchedInvoices = Array.isArray(invoicesData) ? invoicesData : [];

      setOrders(fetchedOrders);
      setInvoices(fetchedInvoices);

      // Fetch invoice details for invoices to get exact prices & subtotals per user
      const detailsMap: Record<string, InvoicePersonDetail[]> = {};
      await Promise.all(
        fetchedInvoices.slice(0, 100).map(async (inv) => {
          try {
            const detail = await api.get<{ details?: InvoicePersonDetail[] }>(`/invoices/${inv.invoice_id}`);
            if (detail?.details) {
              if (inv.order_id) detailsMap[inv.order_id] = detail.details;
              if (inv.invoice_id) detailsMap[inv.invoice_id] = detail.details;
            }
          } catch (_) {
            // Ignore single invoice fetch failure
          }
        })
      );
      setInvoiceDetailsMap(detailsMap);

    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [loadData, authLoading]);

  // Quick filter handlers
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

  // Calculate my spend & paid-by breakdown
  const statistics = useMemo(() => {
    let totalSpendUSD = 0;
    let totalItemsCount = 0;
    const paidByMap = new Map<string, { total: number; count: number }>();

    myFilteredOrders.forEach((ord) => {
      const inv = invoiceMapByOrderId.get(ord.order_id);
      const payerName = inv?.payer_name || ord.paid_by?.username || "Unknown Payer";

      // Items calculation
      let orderMyAmount = 0;
      const invDetails = invoiceDetailsMap[ord.order_id];

      if (invDetails) {
        // Find my subtotal in invoice details if available
        const myDetail = invDetails.find((d) => isMyIdentity(d.user_id, d.user_name));
        if (myDetail) {
          orderMyAmount = myDetail.subtotal;
        }
      } else if (inv?.my_amount) {
        orderMyAmount = inv.my_amount;
      }

      totalSpendUSD += orderMyAmount;

      const orderItemQty = ord.myItems.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
      totalItemsCount += orderItemQty;

      // Group by who paid
      const currentPayer = paidByMap.get(payerName) || { total: 0, count: 0 };
      paidByMap.set(payerName, {
        total: currentPayer.total + orderMyAmount,
        count: currentPayer.count + 1,
      });
    });

    const paidByList = Array.from(paidByMap.entries()).map(([name, stat]) => ({
      payerName: name,
      amount: stat.total,
      orderCount: stat.count,
    }));

    return {
      totalSpendUSD,
      totalOrdersCount: myFilteredOrders.length,
      totalItemsCount,
      paidByList,
    };
  }, [myFilteredOrders, invoiceMapByOrderId, invoiceDetailsMap, myUserId, myNames]);

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {/* Top Header */}
      <TopBar title="My Orders" />
      
      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-5">

        {/* 1. Filter Section (Dropdown Selection & Custom Date Range) */}
        <Card variant="flat" padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 sm:flex-none">
              <span className="text-xs font-semibold text-[var(--text-muted)] hidden sm:inline-flex items-center gap-1">
                <SlidersHorizontal size={14} /> Filter:
              </span>
              <div className="relative flex-1 sm:w-44">
                <SlidersHorizontal size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none z-10" />
                <select
                  value={quickFilter}
                  onChange={(e) => handleQuickFilter(e.target.value as QuickFilter)}
                  className="w-full pl-9 pr-8 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px] appearance-none"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  {quickFilter === "custom" && <option value="custom">Custom Range</option>}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none z-10" />
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-1.5 text-xs shrink-0"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setQuickFilter("custom");
                }}
                aria-label="From Date"
                className="w-full pl-9 pr-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px]"
              />
            </div>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] z-10" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setQuickFilter("custom");
                }}
                aria-label="To Date"
                className="w-full pl-9 pr-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:border-[var(--color-primary)] cursor-pointer min-h-[38px]"
              />
            </div>
          </div>
        </Card>

        {/* 2. Card Group: Summary & Paid By Aggregation */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {/* My Total Spend Card */}
          <StatCard
            icon={<Wallet size={18} />}
            value={`$${statistics.totalSpendUSD.toFixed(2)}`}
            label="My Total Spend"
            color="primary"
          />

          {/* My Items & Orders Count */}
          <StatCard
            icon={<Utensils size={18} />}
            value={`${statistics.totalItemsCount} items`}
            label={`Across ${statistics.totalOrdersCount} orders`}
            color="accent"
          />

          {/* Paid By Group Summary Card */}
          <Card variant="default" padding="sm" className="col-span-2 lg:col-span-1 flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={18} className="text-[var(--color-primary)]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Paid By Summary
              </span>
            </div>
            <div className="space-y-1.5">
              {statistics.paidByList.length > 0 ? (
                statistics.paidByList.map(({ payerName, amount, orderCount }) => (
                  <div 
                    key={payerName}
                    className="flex items-center justify-between px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-xs font-medium"
                  >
                    <span className="truncate font-semibold text-[var(--text)]">{payerName}</span>
                    <span className="font-bold text-[var(--color-primary)] ml-2 whitespace-nowrap">
                      ${amount.toFixed(2)} <span className="text-[10px] text-[var(--text-muted)] font-normal">({orderCount}x)</span>
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-muted)] italic">No paid records found</p>
              )}
            </div>
          </Card>
        </div>

        {/* 3. Detailed UI List of My Orders */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold tracking-tight text-[var(--text-muted)] uppercase px-1">
            My Order History ({myFilteredOrders.length})
          </h2>

          {loading ? (
            <Card variant="flat" padding="md" className="space-y-2">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          ) : myFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={32} />}
              title="No Personal Orders Found"
              description="You don't have any food order items matching the selected filters."
            />
          ) : (
            <>
              {shownOrders.map((ord) => {
                const inv = invoiceMapByOrderId.get(ord.order_id);
                const payer = inv?.payer_name || ord.paid_by?.username || "Not assigned";
                const invDetails = invoiceDetailsMap[ord.order_id];

                // Calculate order subtotal for my items
                let myOrderSubtotal = 0;
                if (invDetails) {
                  const myDetail = invDetails.find((d) => isMyIdentity(d.user_id, d.user_name));
                  if (myDetail) myOrderSubtotal = myDetail.subtotal;
                } else if (inv?.my_amount) {
                  myOrderSubtotal = inv.my_amount;
                }

                return (
                  <Card 
                    key={ord.order_id} 
                    variant="default" 
                    padding="md"
                    className="hover:border-[var(--color-primary-light)] transition-colors space-y-3"
                  >
                    {/* Header info */}
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--color-primary)]">
                            {format(new Date(ord.order_date + "T00:00:00"), "EEE, MMM d, yyyy")}
                          </span>
                          {ord.chat_title && (
                            <Badge variant="member" className="text-[10px]">
                              {ord.chat_title}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="admin" className="text-xs font-semibold px-2 py-0.5">
                          Paid by {payer}
                        </Badge>
                        {ord.has_invoice && (
                          <Badge variant="success" className="text-[10px]">
                            Invoiced
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Items List (MY ITEMS ONLY) */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        My Dishes ({ord.myItems.length})
                      </p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {ord.myItems.map((it, idx) => {
                          const dishName = it.item_name || it.name || "Dish";
                          const qty = Number(it.qty) || 1;
                          
                          // Try to find individual item price from invoice details
                          let itemPrice: number | null = null;
                          if (invDetails) {
                            const myDetail = invDetails.find((d) => isMyIdentity(d.user_id, d.user_name));
                            const matchedItem = myDetail?.items.find((dIt) => dIt.item_name === dishName);
                            if (matchedItem) itemPrice = matchedItem.cost;
                          }

                          return (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface-2)] text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                                <span className="font-medium text-[var(--text)] truncate">
                                  {dishName}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--surface)] text-[var(--text-2)]">
                                  ×{qty}
                                </span>
                              </div>

                              {itemPrice !== null ? (
                                <span className="font-bold text-[var(--text)] whitespace-nowrap">
                                  ${itemPrice.toFixed(2)}
                                </span>
                              ) : myOrderSubtotal > 0 ? (
                                <span className="text-[10px] text-[var(--text-muted)] italic">
                                  Included in subtotal
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)] italic">
                                  Price pending
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Order Footer Subtotal */}
                    {myOrderSubtotal > 0 && (
                      <div className="flex items-center justify-end gap-2 pt-1 text-xs border-t border-dashed border-[var(--border)]">
                        <span className="text-[var(--text-muted)] font-medium">My Order Total:</span>
                        <span className="font-bold text-base text-[var(--color-primary)]">
                          ${myOrderSubtotal.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </Card>
                );
              })}

              {myFilteredOrders.length > visibleCount && (
                <div ref={observerTarget} className="pt-1">
                  <button
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ background: "var(--surface)", color: "var(--text-2)", borderColor: "var(--border)" }}
                  >
                    <ChevronDown size={14} className="animate-bounce" />
                    Scroll to load more ({myFilteredOrders.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
