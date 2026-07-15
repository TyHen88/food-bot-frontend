"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { 
  ClipboardCopy, 
  ChevronLeft, 
  ChevronRight, 
  ShoppingBag, 
  Users, 
  Package, 
  Wallet, 
  Search, 
  SlidersHorizontal,
  RefreshCw,
  Calendar,
  MoreHorizontal
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { OrderItemsEditor, type Order } from "@/components/orders/OrderItemsEditor";
import { InvoiceModal } from "@/components/orders/InvoiceModal";

interface GroupedPoll { poll_id: string; chat_title?: string; orders: Order[]; }

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

export default function OrdersPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<Order | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const data = await api.get<Order[]>(`/orders?date=${d}${chatIdQuery()}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Wait for AuthContext (it sets the initData auth header) before fetching.
  useEffect(() => {
    if (authLoading) return;
    load(date);
  }, [date, load, authLoading]);

  function prevDay() { 
    const d = new Date(date + "T00:00:00"); 
    d.setDate(d.getDate() - 1); 
    setDate(format(d, "yyyy-MM-dd")); 
  }
  
  function nextDay() { 
    const d = new Date(date + "T00:00:00"); 
    d.setDate(d.getDate() + 1); 
    setDate(format(d, "yyyy-MM-dd")); 
  }

  // 1. Stats Calculations
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    
    const customersSet = new Set<string>();
    let totalItems = 0;
    let firstPayer = "";

    orders.forEach(o => {
      (o.items ?? []).forEach(it => {
        if (it.name) customersSet.add(it.name);
        totalItems += (it.qty ?? 1);
      });
      if (!firstPayer && (o.paid_by?.username || o.paid_by?.user_id)) {
        firstPayer = o.paid_by.username || o.paid_by.user_id || "";
      }
    });

    return {
      totalOrders,
      customers: customersSet.size,
      totalItems,
      payer: firstPayer || "None"
    };
  }, [orders]);

  // 2. Search & Filtering
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const query = searchQuery.toLowerCase();
    
    return orders.map(o => {
      const matchingItems = (o.items ?? []).filter(item => 
        (item.name || "").toLowerCase().includes(query) || 
        (item.item_name || "").toLowerCase().includes(query)
      );
      if (matchingItems.length > 0) {
        return { ...o, items: matchingItems };
      }
      return null;
    }).filter(Boolean) as Order[];
  }, [orders, searchQuery]);

  // Group filtered orders by poll
  const groups: GroupedPoll[] = Object.values(
    filteredOrders.reduce<Record<string, GroupedPoll>>((acc, o) => {
      if (!acc[o.poll_id]) acc[o.poll_id] = { poll_id: o.poll_id, chat_title: o.chat_title, orders: [] };
      acc[o.poll_id].orders.push(o);
      return acc;
    }, {})
  );

  function copyToClipboard() {
    const lines: string[] = [`📋 Orders — ${date}`, ""];
    groups.forEach(g => {
      lines.push(`Poll: ${g.poll_id}${g.chat_title ? ` (${g.chat_title})` : ""}`);
      g.orders.forEach(o => {
        const payer = o.paid_by?.username || o.paid_by?.user_id || "?";
        (o.items ?? []).forEach(item => {
          const name = item.name || item.item_name || "?";
          const qty  = item.qty ?? 1;
          lines.push(`  • ${payer}: ${name}${qty > 1 ? ` ×${qty}` : ""}`);
        });
      });
      lines.push("");
    });
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => toast("Copied to clipboard!", "success"),
      () => toast("Copy failed", "error")
    );
  }

  const displayDate = format(new Date(date + "T00:00:00"), "EEEE, d MMMM yyyy");
  const headerDate = format(new Date(date + "T00:00:00"), "EEEE • LLL d, yyyy");

  return (
    <>
      {/* Top Bar for Mobile */}
      <div className="flex sm:hidden items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-10">
        <h1 className="text-base font-bold text-[var(--text)]">Orders</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={copyToClipboard} disabled={orders.length === 0}>
            <ClipboardCopy size={13} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => load(date)}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <main className="page-content max-w-6xl mx-auto px-4 py-6 space-y-6">
        
        {/* Page Header (Desktop) */}
        <div className="hidden sm:flex items-center justify-between pb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Orders</h1>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium">
              <Calendar size={13} />
              <span>Today, {headerDate}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={copyToClipboard} disabled={orders.length === 0}>
              <ClipboardCopy size={13} className="mr-1" /> Copy
            </Button>
            <Button size="sm" variant="secondary" onClick={() => load(date)}>
              <RefreshCw size={13} className="mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* 1. Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <ShoppingBag size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.totalOrders}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Total Orders</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">All items for today</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              <Users size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.customers}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Customers</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Unique customers</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
              <Package size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.totalItems}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Total Items</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Across all orders</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
              <Wallet size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] leading-tight">Paid by</div>
              <div className="text-sm font-bold text-[var(--text)] truncate">{stats.payer}</div>
              <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Payment</div>
            </div>
          </Card>
        </div>

        {/* 2. Date Picker (Wide Card) */}
        <Card variant="flat" padding="none" className="flex items-center justify-between px-3 py-2 bg-[var(--surface)] border border-[var(--border)]">
          <button onClick={prevDay}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] border-0 cursor-pointer text-[var(--text-muted)]"
            style={{ background: "transparent" }}>
            <ChevronLeft size={16} />
          </button>
          
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text)] select-none">
            <Calendar size={14} className="text-[var(--text-muted)]" />
            <span>Today, {displayDate}</span>
          </div>

          <button onClick={nextDay}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] border-0 cursor-pointer text-[var(--text-muted)]"
            style={{ background: "transparent" }}>
            <ChevronRight size={16} />
          </button>
        </Card>

        {/* 3. Search Bar & Filter Row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input 
              type="text"
              placeholder="Search customer or item..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-[var(--radius-md)] border focus:outline-none focus:ring-1 bg-[var(--surface)] text-[var(--text)] border-[var(--border)]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] border hover:bg-[var(--surface-2)] text-[var(--text-muted)] cursor-pointer bg-[var(--surface)] border-[var(--border)]">
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {/* 4. Poll Cards */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-44 rounded-[var(--radius-lg)]" />)}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="🍽️" title="No orders found"
            description={searchQuery ? "Try checking another date or adjusting your search filter." : `No food orders recorded for ${displayDate}.`} />
        ) : (
          <div className="space-y-6">
            {groups.map(g => (
              <Card key={g.poll_id} variant="default" padding="none" className="overflow-hidden border border-[var(--border)] rounded-[var(--radius-lg)]">
                {/* Redesigned Poll Header */}
                <div className="px-4 py-3 flex items-center justify-between bg-[var(--color-primary-light)]/60 dark:bg-[var(--color-primary-light)]/20 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--color-primary)] text-white">
                      <ShoppingBag size={14} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold text-[var(--text)] truncate">
                        Poll #{g.poll_id.slice(-6)} • {g.chat_title || "Group Chat"}
                      </h2>
                      {g.orders[0]?.paid_by?.username && (
                        <p className="text-[10px] text-[var(--text-muted)] font-medium">
                          Paid by: <span className="text-[var(--color-primary)] font-semibold">{g.orders[0].paid_by.username}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                      {g.orders.reduce((s, o) => s + (o.items?.length ?? 0), 0)} Orders
                    </span>
                    <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 border-0 text-[var(--text-muted)] cursor-pointer">
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>

                {/* Voter Rows */}
                <div className="px-4 py-2 divide-y divide-[var(--border)]">
                  {g.orders.map(o => (
                    <div key={o.order_id} className="py-2">
                      <OrderItemsEditor 
                        order={o} 
                        isAdmin={isAdmin} 
                        onSaved={() => load(date)}
                        onInvoiceClick={() => setActiveInvoiceOrder(o)}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Invoice Generator Modal */}
      {activeInvoiceOrder && (
        <InvoiceModal
          open={!!activeInvoiceOrder}
          onClose={() => setActiveInvoiceOrder(null)}
          order={activeInvoiceOrder}
          onInvoiceSent={() => load(date)}
        />
      )}
    </>
  );
}
