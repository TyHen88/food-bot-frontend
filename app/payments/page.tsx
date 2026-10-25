"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  User, 
  ArrowUpRight,
  UserCheck,
  Zap,
  Building2,
  DollarSign
} from "lucide-react";
import { api } from "@/lib/api";
import { launchChatId } from "@/lib/telegram";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";

interface SettledOrder {
  order_id: string;
  date?: string;
  amount?: number;
  status?: string;
}

interface PaymentRecord {
  payment_id: string;
  trx_id: string;
  user_id: string;
  user_name?: string;
  username?: string;
  bank_name?: string;
  sender_name: string;
  amount: number;
  currency: string;
  amount_usd: number;
  settled_orders: SettledOrder[];
  status: "MATCHED" | "UNMATCHED" | "MANUAL" | string;
  apv?: string;
  raw_text?: string;
  created_at: string;
}

interface PaginatedPaymentsResponse {
  items: PaymentRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  stats: {
    total: number;
    matched: number;
    unmatched: number;
    total_usd: number;
  };
}

interface MemberOption {
  user_id: string;
  name: string;
  username: string;
}

const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCHED" | "UNMATCHED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [stats, setStats] = useState({
    total: 0,
    matched: 0,
    unmatched: 0,
    total_usd: 0,
  });

  // Assign payment modal state
  const [assignPaymentTarget, setAssignPaymentTarget] = useState<PaymentRecord | null>(null);
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  const observerTarget = useRef<HTMLDivElement | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadPayments = useCallback(async (pageNum = 1, isAppend = false, query = debouncedSearch, status = statusFilter) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("page_size", String(PAGE_SIZE));
      if (status !== "ALL") params.set("status", status);
      if (query.trim()) params.set("search", query.trim());

      const res = await api.get<PaginatedPaymentsResponse | PaymentRecord[]>(
        `/payments?${params.toString()}`
      );

      if (res && "items" in res) {
        const fetched = res.items || [];
        setPayments(prev => isAppend ? [...prev, ...fetched] : fetched);
        setTotalCount(res.total ?? 0);
        setTotalPages(res.total_pages ?? 1);
        setPage(res.page ?? pageNum);
        if (res.stats) {
          setStats(res.stats);
        }
      } else if (Array.isArray(res)) {
        setPayments(res);
        setTotalCount(res.length);
        setTotalPages(1);
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, statusFilter, toast]);

  useEffect(() => {
    if (authLoading) return;
    setPage(1);
    loadPayments(1, false, debouncedSearch, statusFilter);
  }, [loadPayments, authLoading, debouncedSearch, statusFilter]);

  // Load members for assignment dialog if admin
  useEffect(() => {
    if (!isAdmin) return;
    const activeChatId = launchChatId();
    const queryStr = activeChatId ? `?chat_id=${encodeURIComponent(activeChatId)}` : "";
    api.get<{ items?: Array<{ user_id: string; name: string; username: string }> } | Array<{ user_id: string; name: string; username: string }>>(`/members${queryStr}`)
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.items || []);
        setMembersList(list.map(m => ({ user_id: m.user_id, name: m.name, username: m.username })));
      })
      .catch(() => {});
  }, [isAdmin]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadPayments(nextPage, true, debouncedSearch, statusFilter);
  }, [loading, loadingMore, page, totalPages, loadPayments, debouncedSearch, statusFilter]);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && page < totalPages && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [page, totalPages, loading, loadingMore, loadMore]);

  const handleAssign = async () => {
    if (!assignPaymentTarget || !selectedUserId) return;
    setAssigning(true);
    try {
      await api.post(`/payments/${assignPaymentTarget.payment_id}/assign`, {
        user_id: selectedUserId,
      });
      toast(`Successfully assigned payment to member!`, "success");
      setAssignPaymentTarget(null);
      setSelectedUserId("");
      loadPayments(1, false);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="page-content max-w-5xl mx-auto px-4 py-5 sm:py-6 space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">Payments</h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
              {totalCount} total
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
            Real-time ABA KHQR payments received and settled against lunch orders
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => loadPayments(1, false)}
            disabled={loading}
            className="gap-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── Metric Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 space-y-1 bg-[var(--surface)] border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-semibold">Total Received</span>
            <DollarSign size={14} className="text-emerald-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            ${stats.total_usd.toFixed(2)}
          </p>
        </Card>

        <Card className="p-3.5 space-y-1 bg-[var(--surface)] border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-semibold">Matched Payments</span>
            <CheckCircle2 size={14} className="text-indigo-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)]">
            {stats.matched}
          </p>
        </Card>

        <Card className="p-3.5 space-y-1 bg-[var(--surface)] border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-semibold">Unmatched</span>
            <AlertCircle size={14} className="text-amber-500" />
          </div>
          <p className="text-lg sm:text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            {stats.unmatched}
          </p>
        </Card>

        <Card className="p-3.5 space-y-1 bg-[var(--surface)] border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-semibold">Total Transactions</span>
            <CreditCard size={14} className="text-[var(--text-muted)]" />
          </div>
          <p className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text)]">
            {stats.total}
          </p>
        </Card>
      </div>

      {/* ── Filters & Search ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-2)] rounded-[var(--radius-lg)] border border-[var(--border)] w-fit">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("MATCHED")}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === "MATCHED"
                ? "bg-[var(--surface)] text-emerald-600 dark:text-emerald-400 shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Matched
          </button>
          <button
            onClick={() => setStatusFilter("UNMATCHED")}
            className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === "UNMATCHED"
                ? "bg-[var(--surface)] text-amber-600 dark:text-amber-400 shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Unmatched
          </button>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search sender, Trx ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] text-[var(--text)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand)]"
          />
        </div>
      </div>

      {/* ── Payments List ─────────────────────────────────────────────────── */}
      {loading && payments.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </Card>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={36} className="text-[var(--text-muted)]" />}
          title="No payments found"
          description={
            searchQuery
              ? `No transactions matching "${searchQuery}"`
              : "No payment transactions have been recorded yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {payments.map((p) => {
            const isMatched = p.status?.toUpperCase() === "MATCHED";
            const dateStr = p.created_at ? format(new Date(p.created_at), "dd MMM yyyy, HH:mm") : "Unknown Date";

            return (
              <Card
                key={p.payment_id || p.trx_id}
                className="p-4 bg-[var(--surface)] border-[var(--border)] hover:border-[var(--brand)]/30 transition-all rounded-[var(--radius-lg)] shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-[var(--text)]">
                        {p.sender_name || "Unknown Sender"}
                      </span>
                      {p.user_name && p.user_name !== p.sender_name && (
                        <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-medium">
                          <User size={12} />
                          {p.user_name}
                          {p.username ? ` (@${p.username})` : ""}
                        </span>
                      )}
                      <Badge
                        variant={isMatched ? "success" : "warning"}
                        className="text-[10px] px-2 py-0.5"
                      >
                        {p.status}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] flex-wrap">
                      <span>Trx: <code className="text-[11px] font-mono text-[var(--text)]">{p.trx_id || p.payment_id}</code></span>
                      {p.apv && <span>APV: <code className="text-[11px] font-mono">{p.apv}</code></span>}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {dateStr}
                      </span>
                    </div>

                    {/* Settled Orders breakdown */}
                    {p.settled_orders && p.settled_orders.length > 0 && (
                      <div className="pt-1.5 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] font-semibold text-[var(--text-muted)]">Settled:</span>
                        {p.settled_orders.map((ord, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]"
                          >
                            📅 {ord.date || ord.order_id}: ${(ord.amount || 0).toFixed(2)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)] shrink-0">
                    <div className="text-right">
                      <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {p.currency === "KHR"
                          ? `${Math.round(p.amount).toLocaleString()} ៛`
                          : `$${p.amount.toFixed(2)}`}
                      </div>
                      {p.currency === "KHR" && (
                        <div className="text-[11px] text-[var(--text-muted)] font-medium">
                          ≈ ${p.amount_usd.toFixed(2)} USD
                        </div>
                      )}
                    </div>

                    {isAdmin && !isMatched && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setAssignPaymentTarget(p);
                          setSelectedUserId(p.user_id || "");
                        }}
                        className="gap-1 text-xs py-1 px-2.5 bg-[var(--brand)] text-white hover:opacity-90"
                      >
                        <UserCheck size={12} />
                        <span>Assign Member</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          <div ref={observerTarget} className="h-6 flex items-center justify-center">
            {loadingMore && (
              <span className="text-xs text-[var(--text-muted)] animate-pulse">
                Loading more transactions...
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Assign Payment Modal ─────────────────────────────────────────── */}
      {assignPaymentTarget && (
        <Modal
          open={true}
          onClose={() => setAssignPaymentTarget(null)}
          title="Assign Payment to Member"
        >
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Sender:</span>
                <span className="font-semibold text-[var(--text)]">{assignPaymentTarget.sender_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Amount:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  ${assignPaymentTarget.amount_usd.toFixed(2)} USD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Trx ID:</span>
                <span className="font-mono">{assignPaymentTarget.trx_id}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text)]">Select Member to Settle</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] text-[var(--text)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand)]"
              >
                <option value="">-- Choose Member --</option>
                {membersList.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name} {m.username ? `(@${m.username})` : ""} (ID: {m.user_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAssignPaymentTarget(null)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAssign}
                disabled={!selectedUserId || assigning}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {assigning ? "Processing..." : "Confirm & Settle Debt"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
