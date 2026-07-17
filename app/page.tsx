"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, getDay } from "date-fns";
import {
  ChevronLeft, ChevronRight, ShoppingBag, BarChart3, CalendarDays,
  BookTemplate, CalendarClock, Settings, History, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card, StatCard } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { OrderItemsEditor, type Order } from "@/components/orders/OrderItemsEditor";

interface DaySummary { count: number; orderIds: string[]; orders: Order[]; }

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
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const loadMonth = useCallback(async (m: Date) => {
    setLoading(true);
    setSelectedDay(null);
    try {
      const from = format(startOfMonth(m), "yyyy-MM-dd");
      const to   = format(endOfMonth(m),   "yyyy-MM-dd");
      const data = await api.get<Order[]>(`/orders?from=${from}&to=${to}${chatIdQuery()}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Wait for AuthContext to finish (it sets the initData auth header) —
  // fetching earlier hits the API without credentials and 401s.
  useEffect(() => {
    if (authLoading) return;
    loadMonth(month);
  }, [month, loadMonth, authLoading]);

  // Build per-day summaries from the fetched orders
  const dayMap: Record<string, DaySummary> = {};
  for (const o of orders) {
    const key = o.order_date?.slice(0, 10) ?? "";
    if (!key) continue;
    if (!dayMap[key]) dayMap[key] = { count: 0, orderIds: [], orders: [] };
    dayMap[key].count += o.item_count ?? o.items?.length ?? 1;
    dayMap[key].orderIds.push(o.order_id);
    dayMap[key].orders.push(o);
  }

  // Stats for this month
  const totalItems    = orders.reduce((s, o) => s + (o.item_count ?? o.items?.length ?? 1), 0);
  const activeDays    = Object.keys(dayMap).length;
  const uniquePolls   = new Set(orders.map(o => o.poll_id)).size;

  // Calendar
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const firstDow = getDay(days[0]);

  // Selected day data
  const selectedKey  = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedData = selectedKey ? dayMap[selectedKey] : null;

  return (
    <>
      <TopBar title="Dashboard" />
      <main className="page-content">
        <DesktopHeader
          title="Dashboard"
          subtitle={format(month, "MMMM yyyy")}
        />

        {/* Stats */}
        <div className="stats-grid mb-6">
          {loading ? (
            <><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></>
          ) : (
            <>
              <StatCard icon={<ShoppingBag size={18} />}  value={totalItems}  label="Items ordered"   color="primary" />
              <StatCard icon={<BarChart3 size={18} />}    value={uniquePolls} label="Polls this month" color="accent" />
              <StatCard icon={<CalendarDays size={18} />} value={activeDays}  label="Active days"      color="success" />
            </>
          )}
        </div>

        {/* Quick Actions (Ask AI for everyone; admin tools for admins) */}
        {!authLoading && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)", margin: 0 }}>
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              {QUICK_ACTIONS.filter(a => !a.adminOnly || isAdmin).map(({ href, icon: Icon, label, desc, iconClass }) => (
                <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-[var(--radius-lg)] border bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all cursor-pointer" style={{ borderColor: "var(--border)", textDecoration: "none" }}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight m-0" style={{ color: "var(--text)" }}>{label}</p>
                    <p className="text-[10px] m-0 truncate" style={{ color: "var(--text-muted)" }}>{desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Calendar card */}
        <Card variant="default" padding="none" className="overflow-hidden">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()-1); return n; })}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] border-0 cursor-pointer"
              style={{ background: "transparent", color: "var(--text-muted)" }}
            ><ChevronLeft size={16} /></button>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)", margin: 0 }}>
              {format(month, "MMMM yyyy")}
            </h2>
            <button
              onClick={() => setMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()+1); return n; })}
              className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-2)] border-0 cursor-pointer"
              style={{ background: "transparent", color: "var(--text-muted)" }}
            ><ChevronRight size={16} /></button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 px-2 pt-3 pb-1">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold pb-2"
                style={{ color: "var(--text-muted)" }}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-y-1 px-2 pb-3">
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}

            {days.map(day => {
              const key      = format(day, "yyyy-MM-dd");
              const info     = dayMap[key];
              const today    = isToday(day);
              const selected = selectedKey === key;

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(selected ? null : day)}
                  className="flex flex-col items-center py-1.5 rounded-[var(--radius-md)] transition-all duration-150 border-0 cursor-pointer"
                  style={{
                    background: selected
                      ? "var(--color-primary)"
                      : today ? "var(--color-primary-light)" : "transparent",
                    color: selected ? "#fff" : today ? "var(--color-primary)" : "var(--text)",
                  }}
                >
                  <span className="text-sm font-semibold leading-none">{format(day, "d")}</span>
                  {info ? (
                    <span className="mt-1 text-[10px] font-bold px-1.5 rounded-full"
                      style={{
                        background: selected ? "rgba(255,255,255,0.25)" : "var(--color-accent-light)",
                        color:      selected ? "#fff" : "var(--color-accent)",
                      }}>
                      {info.count}
                    </span>
                  ) : (
                    <span className="mt-1 h-4" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Day detail — bottom sheet on mobile, dialog on desktop */}
        <Modal
          open={!!selectedDay}
          onClose={() => setSelectedDay(null)}
          title={selectedDay ? format(selectedDay, "EEEE, d MMMM") : ""}
          maxWidth="560px"
        >
          {!selectedData ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              No orders on this day
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="accent">{selectedData.count} items</Badge>
                <Badge variant="default">{selectedData.orders.length} order{selectedData.orders.length > 1 ? "s" : ""}</Badge>
              </div>
              {selectedData.orders.map(o => (
                <Card key={o.order_id} variant="flat" padding="sm">
                  {/* Card header: which group + who paid */}
                  <div className="flex items-center justify-between gap-2 pb-1.5"
                    style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>
                      {o.chat_title || `Poll #${o.poll_id.slice(-6)}`}
                    </span>
                    {(o.paid_by?.username || o.paid_by?.user_id) && (
                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                        💳 Paid by{" "}
                        <span className="font-semibold" style={{ color: "var(--color-primary)" }}>
                          {o.paid_by.username || o.paid_by.user_id}
                        </span>
                      </span>
                    )}
                  </div>
                  <OrderItemsEditor
                    order={o}
                    isAdmin={isAdmin}
                    onSaved={() => loadMonth(month)}
                  />
                </Card>
              ))}
            </div>
          )}
        </Modal>
      </main>
    </>
  );
}
