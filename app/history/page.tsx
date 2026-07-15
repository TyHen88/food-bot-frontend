"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdminGuard } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
import { clsx } from "clsx";

interface HistoryEvent {
  event_id: string;
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  chat_id?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

interface HistoryPage {
  items: HistoryEvent[];
  total: number;
  limit: number;
  offset: number;
}

const EVENT_TYPES = ["ALL", "POLL_CREATED", "VOTE_CAST", "ORDER_CLOSED", "SETTING_UPDATED", "SCHEDULE_TOGGLED"];

const EVENT_COLORS: Record<string, "primary" | "accent" | "success" | "warning" | "danger" | "default"> = {
  POLL_CREATED:     "primary",
  VOTE_CAST:        "success",
  ORDER_CLOSED:     "accent",
  SETTING_UPDATED:  "warning",
  SCHEDULE_TOGGLED: "default",
};

const EVENT_ICONS: Record<string, string> = {
  POLL_CREATED:     "📊",
  VOTE_CAST:        "✅",
  ORDER_CLOSED:     "🍽️",
  SETTING_UPDATED:  "⚙️",
  SCHEDULE_TOGGLED: "🕐",
};

function EventCard({ event }: { event: HistoryEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color  = EVENT_COLORS[event.event_type] ?? "default";
  const icon   = EVENT_ICONS[event.event_type] ?? "📋";
  const hasPayload = event.payload && Object.keys(event.payload).length > 0;

  return (
    <div
      className="flex gap-3 py-3 animate-fade-in"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Icon */}
      <div className="flex-shrink-0 text-lg leading-none mt-0.5">{icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={color} className="text-[10px]">{event.event_type}</Badge>
          {event.entity_type && (
            <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
              {event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {event.user_id && <span>User {event.user_id} · </span>}
          {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
        </p>

        {/* Payload expand */}
        {hasPayload && (
          <div>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs border-0 cursor-pointer p-0 mt-1"
              style={{ background: "transparent", color: "var(--text-muted)" }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Hide" : "Show"} payload
            </button>
            {expanded && (
              <pre
                className="mt-2 p-2 rounded-[var(--radius-sm)] text-[10px] overflow-x-auto leading-relaxed"
                style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
              >
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AdminGuard>
      <HistoryContent />
    </AdminGuard>
  );
}

function HistoryContent() {
  const { toast } = useToast();
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const offset = useRef(0);
  const LIMIT = 20;

  const load = useCallback(async (reset = false, f?: string) => {
    const eventType = f ?? filter;
    if (reset) { offset.current = 0; setLoading(true); }
    else setLoadingMore(true);

    try {
      const qs = `?limit=${LIMIT}&offset=${offset.current}${eventType !== "ALL" ? `&event_type=${eventType}` : ""}`;
      const data = await api.get<HistoryPage>(`/history${qs}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      if (reset) setEvents(items);
      else setEvents(prev => [...prev, ...items]);
      setHasMore(items.length === LIMIT);
      offset.current += items.length;
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, toast]);

  useEffect(() => { load(true); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function changeFilter(f: string) {
    setFilter(f);
    load(true, f);
  }

  return (
    <>
      <TopBar title="History" />
      <main className="page-content">
        <DesktopHeader
          title="History"
          subtitle="Audit log of all bot events"
        />

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap mb-5 overflow-x-auto pb-1">
          {EVENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => changeFilter(t)}
              className={clsx(
                "px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border-0 cursor-pointer transition-all",
                filter === t ? "text-white" : "hover:bg-[var(--surface-2)]"
              )}
              style={{
                background: filter === t ? "var(--color-primary)" : "var(--surface)",
                color:      filter === t ? "#fff" : "var(--text-muted)",
                border:     filter === t ? "none" : "1px solid var(--border)",
              }}
            >
              {t === "ALL" ? "All Events" : t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {loading ? (
          <Card padding="md">
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14" />)}
            </div>
          </Card>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<History size={40} />}
            title="No events yet"
            description="Bot activity will appear here as an audit trail."
          />
        ) : (
          <Card variant="default" padding="none" className="overflow-hidden animate-fade-in">
            <div className="px-4">
              {events.map(e => <EventCard key={e.event_id} event={e} />)}
            </div>

            {hasMore && (
              <div className="flex justify-center p-4" style={{ borderTop: "1px solid var(--border)" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={() => load(false)}
                >
                  Load More
                </Button>
              </div>
            )}
          </Card>
        )}
      </main>
    </>
  );
}
