"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { 
  Search, 
  Users, 
  Shield, 
  Activity, 
  RefreshCw, 
  Phone, 
  Calendar,
  Wallet,
  Check,
  Zap,
  Loader2,
  ChevronDown,
  CreditCard,
  Copy,
  Landmark,
  AlertCircle,
  X,
  Sun,
  Moon,
  Clock,
  ArrowUpRight,
  UserCheck
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MemberSpendModal } from "@/components/members/MemberSpendModal";

interface Member {
  user_id: string;
  name?: string;
  full_name?: string;
  username?: string;
  bank_name?: string;
  phone?: string;
  role: string;      // "Admin" | "Member"
  status: string;    // "Active" | "Inactive"
  last_active_at?: string;
  unpaid_debt?: number;
  total_spend?: number;
  paid_spend?: number;
  unpaid_invoices_count?: number;
  payer_receivables?: number;
  owed_to_payers?: Array<{
    payer_name: string;
    payer_user_id?: string;
    amount: number;
    order_date?: string;
    invoice_id?: string;
  }>;
  pending_debtors?: Array<{
    user_name: string;
    user_id?: string;
    amount: number;
    order_date?: string;
    invoice_id?: string;
  }>;
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

/** Aggregates multiple order debts grouped by payer name */
interface AggregatedDebt {
  payerName: string;
  totalAmount: number;
  ordersCount: number;
}

function aggregateDebts(owedToPayers?: Member["owed_to_payers"]): AggregatedDebt[] {
  if (!owedToPayers || owedToPayers.length === 0) return [];
  const map = new Map<string, { total: number; count: number }>();
  for (const item of owedToPayers) {
    const key = item.payer_name?.trim() || "Payer";
    const current = map.get(key) || { total: 0, count: 0 };
    current.total += item.amount || 0;
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.entries()).map(([payerName, data]) => ({
    payerName,
    totalAmount: data.total,
    ordersCount: data.count,
  }));
}

/** Aggregates receivables from debtors */
interface AggregatedDebtor {
  userName: string;
  totalAmount: number;
  ordersCount: number;
}

function aggregateDebtors(pendingDebtors?: Member["pending_debtors"]): AggregatedDebtor[] {
  if (!pendingDebtors || pendingDebtors.length === 0) return [];
  const map = new Map<string, { total: number; count: number }>();
  for (const item of pendingDebtors) {
    const key = item.user_name?.trim() || "Member";
    const current = map.get(key) || { total: 0, count: 0 };
    current.total += item.amount || 0;
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.entries()).map(([userName, data]) => ({
    userName,
    totalAmount: data.total,
    ordersCount: data.count,
  }));
}

interface PaginatedMembersResponse {
  items: Member[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  stats: {
    total: number;
    admins: number;
    active: number;
    total_debt: number;
    total_receivables?: number;
    total_payers_waiting?: number;
  };
}

const PAGE_SIZE = 50;

type FilterTab = "all" | "debtors" | "payers" | "settled";

export default function MembersPage() {
  const { loading: authLoading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    admins: 0,
    active: 0,
    totalDebt: 0,
    totalReceivables: 0,
    totalPayersWaiting: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [dark, setDark] = useState(false);

  const observerTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleDark = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("fb_theme", next ? "dark" : "light");
    } catch (_) {}
    setDark(next);
  };

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const load = useCallback(async (pageNum = 1, isAppend = false, query = debouncedSearch) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("page_size", String(PAGE_SIZE));
      if (query.trim()) params.set("search", query.trim());

      const res = await api.get<PaginatedMembersResponse | Member[]>(
        `/members?${params.toString()}${chatIdQuery()}`
      );

      if (res && "items" in res) {
        const fetched = res.items || [];
        setMembers(prev => isAppend ? [...prev, ...fetched] : fetched);
        setTotalCount(res.total ?? 0);
        setTotalPages(res.total_pages ?? 1);
        setPage(res.page ?? pageNum);
        if (res.stats) {
          setStats({
            total: res.stats.total ?? 0,
            admins: res.stats.admins ?? 0,
            active: res.stats.active ?? 0,
            totalDebt: res.stats.total_debt ?? 0,
            totalReceivables: res.stats.total_receivables ?? 0,
            totalPayersWaiting: res.stats.total_payers_waiting ?? 0,
          });
        }
      } else if (Array.isArray(res)) {
        setMembers(res);
        setTotalCount(res.length);
        setTotalPages(1);
      }
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, toast]);

  // Wait for AuthContext before initial fetch & reload on search change
  useEffect(() => {
    if (authLoading) return;
    setPage(1);
    load(1, false, debouncedSearch);
  }, [load, authLoading, debouncedSearch]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || page >= totalPages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, true, debouncedSearch);
  }, [loading, loadingMore, page, totalPages, load, debouncedSearch]);

  // Infinite Scroll Observer
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

  const [settlingUserId, setSettlingUserId] = useState<string | null>(null);
  const [bulkSettling, setBulkSettling] = useState(false);
  const [confirmMemberForSettle, setConfirmMemberForSettle] = useState<Member | null>(null);
  const [confirmGroupSettle, setConfirmGroupSettle] = useState(false);

  const handleSettleMember = async (member: Member) => {
    setSettlingUserId(member.user_id);
    try {
      const res = await api.post<{ settled_invoices_count: number; settled_amount: number }>(
        `/members/${member.user_id}/settle`,
        {}
      );
      toast(
        `Settled ${res.settled_invoices_count} orders ($${res.settled_amount.toFixed(2)}) for ${member.name || member.full_name}`,
        "success"
      );
      load(1, false);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSettlingUserId(null);
    }
  };

  const handleSettleAllGroupDebt = async () => {
    const debtMembers = members.filter((m) => (m.unpaid_debt || 0) > 0.009);
    if (debtMembers.length === 0 && stats.totalDebt <= 0.009) {
      toast("No outstanding debt in group", "info");
      return;
    }
    setBulkSettling(true);
    try {
      const targetIds = debtMembers.length > 0 ? debtMembers.map((m) => m.user_id) : [];
      const res = await api.post<{
        settled_users_count: number;
        settled_invoices_count: number;
        settled_amount: number;
      }>("/members/settle-bulk", {
        user_ids: targetIds,
      });
      toast(
        `Successfully settled $${res.settled_amount.toFixed(2)} across ${res.settled_users_count} members!`,
        "success"
      );
      load(1, false);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setBulkSettling(false);
    }
  };

  const handleCopyList = () => {
    if (filterTab === "debtors") {
      const debtors = members.filter(m => (m.unpaid_debt ?? 0) > 0.009);
      if (debtors.length === 0) {
        toast("No members currently owe money", "info");
        return;
      }
      const lines = debtors.map(m => {
        const name = m.name || m.full_name || `User ${m.user_id}`;
        const handle = m.username ? ` (@${m.username})` : "";
        return `• ${name}${handle}: $${(m.unpaid_debt ?? 0).toFixed(2)}`;
      });
      const total = debtors.reduce((acc, m) => acc + (m.unpaid_debt ?? 0), 0);
      const text = `📋 Unpaid Food Debts (${debtors.length} members):\n\n${lines.join("\n")}\n\n💰 Total Due: $${total.toFixed(2)}`;
      navigator.clipboard.writeText(text).then(
        () => toast("Copied unpaid debt list to clipboard!", "success"),
        () => toast("Copy failed", "error")
      );
    } else {
      const text = members.map(m => {
        const name = m.name || m.full_name || "Unknown";
        const handle = m.username ? `@${m.username}` : `ID: ${m.user_id}`;
        const debt = (m.unpaid_debt ?? 0) > 0.009 ? ` [Owes $${(m.unpaid_debt ?? 0).toFixed(2)}]` : "";
        return `• ${name} (${m.role}) - ${handle}${debt}`;
      }).join("\n");

      navigator.clipboard.writeText(`👥 Food Bot Members (${members.length}):\n\n${text}`).then(
        () => toast("Copied members list to clipboard!", "success"),
        () => toast("Copy failed", "error")
      );
    }
  };

  const handleCopyBank = (bankName: string) => {
    navigator.clipboard.writeText(bankName).then(
      () => toast(`Copied ABA Account: ${bankName}`, "success"),
      () => toast("Failed to copy bank info", "error")
    );
  };

  const debtorCount = useMemo(() => members.filter(m => (m.unpaid_debt ?? 0) > 0.009).length, [members]);
  const payerCount = useMemo(() => members.filter(m => (m.payer_receivables ?? 0) > 0.009).length, [members]);
  const settledCount = useMemo(() => members.filter(m => (m.unpaid_debt ?? 0) <= 0.009 && (m.total_spend ?? 0) > 0).length, [members]);

  const displayedMembers = useMemo(() => {
    return members.filter(m => {
      // Client-side quick filter query fallback
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (m.name || "").toLowerCase().includes(q) || (m.full_name || "").toLowerCase().includes(q);
        const matchesUser = (m.username || "").toLowerCase().includes(q) || m.user_id.includes(q);
        const matchesBank = (m.bank_name || "").toLowerCase().includes(q);
        const matchesPhone = (m.phone || "").toLowerCase().includes(q);
        if (!matchesName && !matchesUser && !matchesBank && !matchesPhone) return false;
      }
      if (filterTab === "debtors") return (m.unpaid_debt ?? 0) > 0.009;
      if (filterTab === "payers") return (m.payer_receivables ?? 0) > 0.009;
      if (filterTab === "settled") return (m.unpaid_debt ?? 0) <= 0.009 && (m.total_spend ?? 0) > 0;
      return true;
    });
  }, [members, filterTab, searchQuery]);

  return (
    <>
      {/* ── Mobile Sticky Header ────────────────────────────────────── */}
      <header className="sm:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] transition-colors">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold tracking-tight text-[var(--text)]">Members</h1>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
            {totalCount || members.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isAdmin && stats.totalDebt > 0.009 && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirmGroupSettle(true)}
              disabled={bulkSettling}
              className="gap-1 font-bold text-[11px] px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-xs rounded-[var(--radius-md)]"
            >
              {bulkSettling ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="fill-current" />}
              <span>Settle (${stats.totalDebt.toFixed(2)})</span>
            </Button>
          )}

          <button
            onClick={handleCopyList}
            disabled={members.length === 0}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title="Copy members or debtors list"
            aria-label="Copy list"
          >
            <Copy size={13} />
          </button>

          <button
            onClick={() => load(1, false)}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            title="Refresh members"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={toggleDark}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label="Toggle theme"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* ── Main Page Content ───────────────────────────────────────── */}
      <main className="page-content max-w-5xl mx-auto px-4 py-5 sm:py-6 space-y-5">
        
        {/* Desktop Header */}
        <div className="hidden sm:flex items-center justify-between pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Members</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)]">
                {totalCount || members.length} total
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] font-medium">
              Manage participant balances, track unpaid lunch debts, and ABA account info
            </p>
          </div>

          <div className="flex gap-2 items-center">
            {isAdmin && stats.totalDebt > 0.009 && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setConfirmGroupSettle(true)}
                disabled={bulkSettling}
                className="gap-1.5 font-bold px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-[var(--radius-md)] shadow-xs"
              >
                {bulkSettling ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} className="fill-current" />}
                <span>Settle All Group Debt (${stats.totalDebt.toFixed(2)})</span>
              </Button>
            )}

            <Button 
              size="sm" 
              variant="secondary" 
              onClick={handleCopyList} 
              disabled={members.length === 0}
              className="gap-1.5 text-xs font-medium"
            >
              <Copy size={13} />
              <span>{filterTab === "debtors" ? "Copy Debtors List" : "Copy Members"}</span>
            </Button>

            <Button 
              size="sm" 
              variant="secondary" 
              onClick={() => load(1, false)}
              className="gap-1.5 text-xs font-medium"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </Button>

            <button
              onClick={toggleDark}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        {/* 1. Stat Summary Cards (Responsive & Never Truncated) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* Card 1: Group Unpaid Debt */}
          <div 
            className={`p-3.5 sm:p-4 rounded-[var(--radius-lg)] border transition-all ${
              stats.totalDebt > 0.009 
                ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 shadow-2xs" 
                : "bg-[var(--surface)] border-[var(--border)] shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Group Debt
              </span>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                stats.totalDebt > 0.009
                  ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
                  : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
              }`}>
                <Wallet size={14} />
              </div>
            </div>
            <div className="mt-1">
              <div className={`text-xl sm:text-2xl font-black tracking-tight ${
                stats.totalDebt > 0.009 
                  ? "text-rose-600 dark:text-rose-400" 
                  : "text-emerald-600 dark:text-emerald-400"
              }`}>
                ${stats.totalDebt.toFixed(2)}
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                {stats.totalDebt > 0.009 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">{debtorCount} {debtorCount === 1 ? "member owes" : "members owe"}</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                    <Check size={11} /> All settled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Payers Waiting (Receivables) */}
          <div 
            className={`p-3.5 sm:p-4 rounded-[var(--radius-lg)] border transition-all ${
              stats.totalReceivables > 0.009 
                ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 shadow-2xs" 
                : "bg-[var(--surface)] border-[var(--border)] shadow-xs"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Payers Waiting
              </span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <CreditCard size={14} />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-xl sm:text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400">
                ${stats.totalReceivables.toFixed(2)}
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                {stats.totalPayersWaiting > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    {stats.totalPayersWaiting} {stats.totalPayersWaiting === 1 ? "payer" : "payers"} waiting
                  </span>
                ) : (
                  <span>No pending collections</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Active Members */}
          <div className="p-3.5 sm:p-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Active Members
              </span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                <Activity size={14} />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
                {stats.active}
              </div>
              <div className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                Active in last 30d
              </div>
            </div>
          </div>

          {/* Card 4: Total & Roles */}
          <div className="p-3.5 sm:p-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                Total Registered
              </span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                <Users size={14} />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
                {stats.total || members.length}
              </div>
              <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 font-semibold">
                {stats.admins} {stats.admins === 1 ? "Admin" : "Admins"} configured
              </div>
            </div>
          </div>
        </div>

        {/* 2. Filter Pills & Search Bar */}
        <div className="space-y-3">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setFilterTab("all")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer ${
                filterTab === "all"
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-xs"
                  : "bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface-2)]"
              }`}
            >
              All Members ({members.length})
            </button>

            <button
              onClick={() => setFilterTab("debtors")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 ${
                filterTab === "debtors"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-[var(--surface)] text-rose-600 dark:text-rose-400 border-[var(--border)] hover:bg-rose-50 dark:hover:bg-rose-950/30"
              }`}
            >
              <span>Owes Money</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                filterTab === "debtors" ? "bg-white/20 text-white" : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
              }`}>
                {debtorCount}
              </span>
            </button>

            <button
              onClick={() => setFilterTab("payers")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 ${
                filterTab === "payers"
                  ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                  : "bg-[var(--surface)] text-amber-600 dark:text-amber-400 border-[var(--border)] hover:bg-amber-50 dark:hover:bg-amber-950/30"
              }`}
            >
              <span>Payers Waiting</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                filterTab === "payers" ? "bg-white/20 text-white" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
              }`}>
                {payerCount}
              </span>
            </button>

            <button
              onClick={() => setFilterTab("settled")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all border cursor-pointer flex items-center gap-1.5 ${
                filterTab === "settled"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-[var(--surface)] text-emerald-600 dark:text-emerald-400 border-[var(--border)] hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <span>Settled</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                filterTab === "settled" ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              }`}>
                {settledCount}
              </span>
            </button>
          </div>

          {/* Search Bar with Clear Button */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input 
              type="text"
              placeholder="Search by name, @username, user ID, or ABA bank name..."
              className="w-full pl-9 pr-9 py-2.5 text-xs rounded-[var(--radius-md)] border focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 bg-[var(--surface)] text-[var(--text)] border-[var(--border)] shadow-2xs transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* 3. Members List Container (Card-based, Clean, No-overlap) */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="p-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] space-y-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--surface-2)]" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-32 h-4 bg-[var(--surface-2)] rounded" />
                    <div className="w-48 h-3 bg-[var(--surface-2)] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : displayedMembers.length === 0 ? (
          <EmptyState 
            icon={<Users size={32} />} 
            title={searchQuery ? "No members match your search" : filterTab !== "all" ? `No members in '${filterTab}' category` : "No registered members yet"}
            description={searchQuery ? "Try searching by another name or clearing the filter." : "Members will appear here once they vote or place orders in your group."} 
          />
        ) : (
          <div className="space-y-3">
            {displayedMembers.map(m => {
              const displayName = m.name || m.full_name || `User ${m.user_id}`;
              const isAdm = m.role?.toLowerCase() === "admin";
              const isActive = m.status?.toLowerCase() === "active";
              const avatarStyle = getAvatarStyle(displayName);
              const initials = getInitials(displayName);
              const owesMoney = (m.unpaid_debt ?? 0) > 0.009;
              const isPayerWaiting = (m.payer_receivables ?? 0) > 0.009;
              const isSettled = !owesMoney && (m.total_spend ?? 0) > 0;
              const aggregatedDebts = aggregateDebts(m.owed_to_payers);
              const aggregatedDebtors = aggregateDebtors(m.pending_debtors);

              return (
                <div 
                  key={m.user_id}
                  className={`bg-[var(--surface)] border rounded-[var(--radius-lg)] p-3.5 sm:p-4 hover:border-[var(--border-strong)] transition-all shadow-[var(--shadow-xs)] space-y-3 ${
                    owesMoney ? "border-rose-200/70 dark:border-rose-900/40" : "border-[var(--border)]"
                  }`}
                >
                  {/* Top Row: Avatar + Identity + Top Status Pill */}
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Avatar + Names */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${avatarStyle.bg} ${avatarStyle.text} shadow-2xs`}>
                          {initials}
                        </div>
                        <span 
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--surface)] ${
                            isActive ? "bg-emerald-500 ring-1 ring-emerald-500/30" : "bg-neutral-400"
                          }`}
                          title={isActive ? "Active participant" : "Inactive"}
                        />
                      </div>

                      {/* Identity & Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[var(--text)] truncate max-w-[170px] sm:max-w-xs">
                            {displayName}
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                            isAdm 
                              ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                              : "bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]"
                          }`}>
                            {isAdm ? "Admin" : "Member"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-0.5 flex-wrap font-medium">
                          <span className="text-[var(--text-2)]">
                            {m.username ? `@${m.username}` : `ID: ${m.user_id}`}
                          </span>
                          {m.last_active_at && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-0.5">
                                <Clock size={10} className="inline opacity-70" />
                                {formatDistanceToNow(parseISO(m.last_active_at), { addSuffix: true })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Prominent Financial Status Badge */}
                    <div className="shrink-0 text-right">
                      {owesMoney ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span>Owes ${(m.unpaid_debt ?? 0).toFixed(2)}</span>
                          </span>
                          {(m.unpaid_invoices_count ?? 0) > 0 && (
                            <div className="text-[10px] text-[var(--text-muted)] font-medium">
                              {m.unpaid_invoices_count} {m.unpaid_invoices_count === 1 ? "unpaid meal" : "unpaid meals"}
                            </div>
                          )}
                        </div>
                      ) : isPayerWaiting ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
                            <CreditCard size={11} />
                            <span>+${(m.payer_receivables ?? 0).toFixed(2)}</span>
                          </span>
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            To collect
                          </div>
                        </div>
                      ) : isSettled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <Check size={11} strokeWidth={2.5} />
                          <span>Settled</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--text-muted)] bg-[var(--surface-2)]">
                          No orders
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Bank Account (Click to Copy ABA) */}
                  {m.bank_name && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyBank(m.bank_name!)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors border border-emerald-300/60 dark:border-emerald-800/60 cursor-pointer group"
                        title="Click to copy ABA account name"
                      >
                        <Landmark size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>ABA: <strong className="font-bold underline decoration-dotted">{m.bank_name}</strong></span>
                        <Copy size={11} className="text-emerald-600/70 group-hover:text-emerald-600 ml-0.5" />
                      </button>
                    </div>
                  )}

                  {/* Row 3: Itemized Debt or Receivables Breakdown (Aggregated Cleanly!) */}
                  {owesMoney && aggregatedDebts.length > 0 && (
                    <div className="bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 rounded-[var(--radius-md)] p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-rose-700 dark:text-rose-400">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle size={12} />
                          <span>Debt Breakdown:</span>
                        </span>
                        <span>${(m.unpaid_debt ?? 0).toFixed(2)} Total</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {aggregatedDebts.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-white dark:bg-rose-900/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800/60 shadow-2xs"
                          >
                            <strong>${item.totalAmount.toFixed(2)}</strong> to {item.payerName}
                            <span className="text-[10px] opacity-75">
                              ({item.ordersCount} {item.ordersCount === 1 ? "order" : "orders"})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {isPayerWaiting && aggregatedDebtors.length > 0 && (
                    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 rounded-[var(--radius-md)] p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        <span className="flex items-center gap-1.5">
                          <CreditCard size={12} />
                          <span>Waiting to collect from:</span>
                        </span>
                        <span>${(m.payer_receivables ?? 0).toFixed(2)} Total</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {aggregatedDebtors.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-white dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 shadow-2xs"
                          >
                            <span>{item.userName}:</span>
                            <strong>${item.totalAmount.toFixed(2)}</strong>
                            <span className="text-[10px] opacity-75">
                              ({item.ordersCount} {item.ordersCount === 1 ? "order" : "orders"})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row 4: Dedicated Action Footer */}
                  <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[11px] text-[var(--text-muted)] font-medium flex items-center gap-2">
                      {(m.total_spend ?? 0) > 0 ? (
                        <span>
                          Total Spend: <strong className="text-[var(--text)] font-bold">${(m.total_spend ?? 0).toFixed(2)}</strong>
                        </span>
                      ) : (
                        <span>No past orders</span>
                      )}
                      {m.phone && (
                        <span className="hidden sm:inline-flex items-center gap-1 bg-[var(--surface-2)] px-2 py-0.5 rounded text-[10px]">
                          <Phone size={10} />
                          {m.phone}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdmin && owesMoney && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setConfirmMemberForSettle(m)}
                          disabled={settlingUserId === m.user_id}
                          className="gap-1.5 text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[var(--radius-md)] shadow-xs cursor-pointer"
                          title={`Mark all unpaid orders as paid for ${displayName}`}
                        >
                          {settlingUserId === m.user_id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} strokeWidth={2.5} />
                          )}
                          <span>Mark Paid (${(m.unpaid_debt ?? 0).toFixed(2)})</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedMember(m)}
                        className="gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-md)] cursor-pointer"
                      >
                        <Wallet size={12} className="text-[var(--color-primary)]" />
                        <span>View Spend</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination / Infinite Scroll Indicator */}
            {page < totalPages && (
              <div ref={observerTarget} className="pt-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full flex items-center justify-center gap-2 py-3 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer hover:bg-[var(--surface-2)] transition-colors bg-[var(--surface)] text-[var(--text-2)] border-[var(--border)]"
                >
                  <ChevronDown size={14} className={loadingMore ? "animate-spin" : "animate-bounce"} />
                  {loadingMore ? "Loading more members..." : `Load more (${totalCount - members.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Member Spend Modal */}
      <MemberSpendModal
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        onUpdated={() => load(1, false)}
      />

      {/* Confirmation: Single Member Settle */}
      <ConfirmDialog
        open={!!confirmMemberForSettle}
        onClose={() => setConfirmMemberForSettle(null)}
        onConfirm={() => {
          if (confirmMemberForSettle) {
            const m = confirmMemberForSettle;
            setConfirmMemberForSettle(null);
            handleSettleMember(m);
          }
        }}
        title="Confirm Mark as Paid"
        variant="success"
        confirmText="Yes, Mark as Paid"
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              Mark all unpaid lunch orders as <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span> for{" "}
              <span className="font-bold">{confirmMemberForSettle?.name || confirmMemberForSettle?.full_name}</span>?
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              Total amount to settle: <strong className="text-[var(--text)]">${(confirmMemberForSettle?.unpaid_debt || 0).toFixed(2)}</strong> across {confirmMemberForSettle?.unpaid_invoices_count || 0} orders.
            </p>
          </div>
        }
      />

      {/* Confirmation: All Group Debt Settle */}
      <ConfirmDialog
        open={confirmGroupSettle}
        onClose={() => setConfirmGroupSettle(false)}
        onConfirm={() => {
          setConfirmGroupSettle(false);
          handleSettleAllGroupDebt();
        }}
        title="Confirm Group Debt Settlement"
        variant="success"
        confirmText="Yes, Settle All Debt"
        message={
          <div>
            <p className="font-semibold text-[var(--text)]">
              Are you sure you want to mark all outstanding lunch debt across the entire group as <span className="text-emerald-600 dark:text-emerald-400 font-bold">PAID</span>?
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              Total group debt to settle: <strong className="text-[var(--text)]">${stats.totalDebt.toFixed(2)}</strong> across {debtorCount} members.
            </p>
          </div>
        }
      />
    </>
  );
}
