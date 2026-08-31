"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { 
  ChevronDown, 
  ChevronUp, 
  History, 
  MessageSquare, 
  User, 
  Tag, 
  Clock,
  Filter,
  RefreshCw
} from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
import { useAuth } from "@/contexts/AuthContext";
import { clsx } from "clsx";

interface HistoryEvent {
  event_id: string;
  event_type: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  user_name?: string;
  chat_id?: string;
  chat_title?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

interface HistoryPage {
  items: HistoryEvent[];
  total: number;
  limit: number;
  offset: number;
}

const EVENT_TYPES = [
  "ALL",
  "POLL_CREATED",
  "VOTE_CAST",
  "ORDER_CLOSED",
  "INVOICE_SENT",
  "SETTING_UPDATED",
  "SCHEDULE_TOGGLED",
];

const EVENT_COLORS: Record<string, "primary" | "accent" | "success" | "warning" | "danger" | "default"> = {
  POLL_CREATED:     "primary",
  VOTE_CAST:        "success",
  ORDER_CLOSED:     "accent",
  INVOICE_SENT:     "primary",
  SETTING_UPDATED:  "warning",
  SCHEDULE_TOGGLED: "default",
};

const EVENT_ICONS: Record<string, string> = {
  POLL_CREATED:     "📊",
  VOTE_CAST:        "✅",
  ORDER_CLOSED:     "🍽️",
  INVOICE_SENT:     "🧾",
  SETTING_UPDATED:  "⚙️",
  SCHEDULE_TOGGLED: "🕐",
};

function EventCard({ event }: { event: HistoryEvent }) {
  const [expanded, setExpanded] = useState(false);
  const color = EVENT_COLORS[event.event_type] ?? "default";
  const icon = EVENT_ICONS[event.event_type] ?? "📋";
  const hasPayload = event.payload && typeof event.payload === "object" && Object.keys(event.payload).length > 0;

  // Display user name or fallback to user_id
  const userDisplay = event.user_name 
    ? event.user_name.startsWith("@") ? event.user_name : `@${event.user_name}`
    : event.user_id 
    ? `User ${event.user_id}` 
    : "";

  // Display chat title or fallback to chat_id
  const chatDisplay = event.chat_title || (event.chat_id ? `Group (${event.chat_id})` : "");

  return (
    <div
      className="flex gap-3 py-3 animate-fade-in text-xs"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Icon */}
      <div className="flex-shrink-0 text-base leading-none mt-0.5 select-none">{icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant={color} className="text-[10px] px-2 py-0.2 font-bold">
            {event.event_type.replace(/_/g, " ")}
          </Badge>

          {/* Group / Chat Name Badge */}
          {chatDisplay && (
            <Badge variant="member" className="text-[10px] px-2 py-0.2 font-semibold flex items-center gap-1">
              <MessageSquare size={10} />
              <span className="truncate max-w-[160px]">{chatDisplay}</span>
            </Badge>
          )}

          {/* Entity Details */}
          {event.entity_type && (
            <span className="text-[10px] font-medium text-[var(--text-muted)] flex items-center gap-1">
              <Tag size={10} />
              {event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}
            </span>
          )}
        </div>

        {/* User & Time Metadata */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--text-muted)]">
          {userDisplay && (
            <span className="flex items-center gap-1 font-semibold text-[var(--text)]">
              <User size={11} className="text-[var(--color-primary)]" /> {userDisplay}
            </span>
          )}
          {userDisplay && <span>•</span>}
          <span className="flex items-center gap-1" title={event.created_at ? format(new Date(event.created_at), "yyyy-MM-dd HH:mm:ss") : ""}>
            <Clock size={11} />
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Payload expand */}
        {hasPayload && (
          <div className="pt-0.5">
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] font-medium border-0 cursor-pointer p-0 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              style={{ background: "transparent" }}
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Hide Details" : "Show Details"}
            </button>
            {expanded && (
              <pre
                className="mt-1.5 p-2 rounded-[var(--radius-sm)] text-[10px] font-mono overflow-x-auto leading-relaxed border border-[var(--border)]"
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
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const offset = useRef(0);
  const LIMIT = 25;

  const load = useCallback(async (reset = false, f?: string) => {
    const eventType = f ?? filter;
    if (reset) { offset.current = 0; setLoading(true); }
    else setLoadingMore(true);

    try {
      const qs = `?limit=${LIMIT}&offset=${offset.current}${eventType !== "ALL" ? `&event_type=${eventType}` : ""}${chatIdQuery()}`;
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

  useEffect(() => {
    if (authLoading) return;
    load(true);
  }, [filter, load, authLoading]);

  function changeFilter(f: string) {
    setFilter(f);
    load(true, f);
  }

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <TopBar title="History" />
      <main className="page-content max-w-4xl mx-auto px-4 py-4 space-y-4">
        <DesktopHeader
          title="Audit History"
          subtitle="Real-time activity log of bot votes, polls, and group events"
        />

        {/* Filter chips */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex gap-1.5 flex-nowrap">
            {EVENT_TYPES.map(t => (
              <button
                key={t}
                onClick={() => changeFilter(t)}
                className={clsx(
                  "px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border cursor-pointer transition-all",
                  filter === t
                    ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs"
                    : "bg-[var(--surface-2)] text-[var(--text-muted)] border-transparent hover:text-[var(--text)]"
                )}
              >
                {t === "ALL" ? "All Events" : t.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => load(true)}
            disabled={loading}
            className="h-7.5 w-7.5 p-0 shrink-0 flex items-center justify-center rounded-[var(--radius-md)]"
            title="Refresh history"
            aria-label="Refresh history"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {loading ? (
          <Card padding="md" className="space-y-3 border border-[var(--border)]">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </Card>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<History size={36} />}
            title="No events found"
            description="Bot activity will appear here as an audit trail."
          />
        ) : (
          <Card variant="default" padding="none" className="overflow-hidden animate-fade-in border border-[var(--border)]">
            <div className="px-4">
              {events.map(e => <EventCard key={e.event_id} event={e} />)}
            </div>

            {hasMore && (
              <div className="flex justify-center p-3.5" style={{ borderTop: "1px solid var(--border)" }}>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={loadingMore}
                  onClick={() => load(false)}
                  className="font-semibold text-xs px-4"
                >
                  Load More Events
                </Button>
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
