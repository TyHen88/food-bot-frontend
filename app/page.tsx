"use client";

import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, getDay } from "date-fns";
import { ChevronLeft, ChevronRight, ShoppingBag, BarChart3, CalendarDays, X } from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card, StatCard } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { OrderItemsEditor, type Order } from "@/components/orders/OrderItemsEditor";
import { Trash2, Plus, Edit2, Check } from "lucide-react";

interface DaySummary { count: number; orderIds: string[]; orders: Order[]; }

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

        {/* Day detail panel */}
        {selectedDay && (
          <div className="mt-5 animate-slide-up">
            <Card variant="default" padding="none" className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)", margin: 0 }}>
                  {format(selectedDay, "EEEE, d MMMM")}
                </h3>
                <div className="flex items-center gap-2">
                  {selectedData && (
                    <Badge variant="accent">{selectedData.count} items</Badge>
                  )}
                  <button onClick={() => setSelectedDay(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-2)] border-0 cursor-pointer"
                    style={{ background: "transparent", color: "var(--text-muted)" }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                {!selectedData ? (
                  <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                    No orders on this day
                  </p>
                ) : (
                  <div className="space-y-4">
                    {selectedData.orders.map(o => (
                      <div key={o.order_id}>
                        {/* Items Component */}
                        <OrderItemsEditor 
                          order={o} 
                          isAdmin={isAdmin} 
                          onSaved={() => loadMonth(month)} 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
