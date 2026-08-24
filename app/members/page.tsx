"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { 
  Search, 
  Users, 
  Shield, 
  Activity, 
  RefreshCw, 
  Phone, 
  Calendar,
  SlidersHorizontal,
  MoreHorizontal,
  Wallet,
  Check,
  Zap,
  Loader2
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

export default function MembersPage() {
  const { loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Member[]>(`/members${chatIdQuery(true)}`);
      setMembers(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Wait for AuthContext (it sets the initData auth header) before fetching.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading]);

  const { isAdmin } = useAuth();

  // 1. Stats Calculations
  const stats = useMemo(() => {
    const total = members.length;
    const admins = members.filter(m => m.role?.toLowerCase() === "admin").length;
    const active = members.filter(m => m.status?.toLowerCase() === "active").length;
    const totalDebt = members.reduce((acc, m) => acc + (m.unpaid_debt || 0), 0);
    return { total, admins, active, totalDebt };
  }, [members]);

  // 2. Search Filter
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.toLowerCase();
    return members.filter(m => {
      const displayName = m.name || m.full_name || "";
      const username = m.username || "";
      const userId = m.user_id || "";
      return (
        displayName.toLowerCase().includes(query) ||
        username.toLowerCase().includes(query) ||
        userId.includes(query)
      );
    });
  }, [members, searchQuery]);

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
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSettlingUserId(null);
    }
  };

  const handleSettleAllGroupDebt = async () => {
    const debtMembers = members.filter((m) => (m.unpaid_debt || 0) > 0.009);
    if (debtMembers.length === 0) {
      toast("No outstanding debt in group", "info");
      return;
    }
    setBulkSettling(true);
    try {
      const res = await api.post<{
        settled_users_count: number;
        settled_invoices_count: number;
        settled_amount: number;
      }>("/members/settle-bulk", {
        user_ids: debtMembers.map((m) => m.user_id),
      });
      toast(
        `Successfully settled $${res.settled_amount.toFixed(2)} across ${res.settled_users_count} members!`,
        "success"
      );
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setBulkSettling(false);
    }
  };

  const handleCopyUserlist = () => {
    const text = members.map(m => {
      const name = m.name || m.full_name || "Unknown";
      const handle = m.username ? `@${m.username}` : `ID: ${m.user_id}`;
      return `• ${name} (${m.role}) - ${handle}`;
    }).join("\n");

    navigator.clipboard.writeText(`👥 Food Bot Members:\n\n${text}`).then(
      () => toast("Copied member list to clipboard!", "success"),
      () => toast("Copy failed", "error")
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="flex sm:hidden items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-10">
        <h1 className="text-base font-bold text-[var(--text)]">Members</h1>
        <div className="flex gap-2">
          {isAdmin && stats.totalDebt > 0.009 && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConfirmGroupSettle(true)}
              disabled={bulkSettling}
              className="gap-1 font-bold text-[11px] px-2"
            >
              {bulkSettling ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              <span>Settle All</span>
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={handleCopyUserlist} disabled={members.length === 0}>
            Copy
          </Button>
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <main className="page-content max-w-6xl mx-auto px-4 py-6 space-y-6">
        
        {/* Desktop Header */}
        <div className="hidden sm:flex items-center justify-between pb-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Members</h1>
            <p className="text-xs text-[var(--text-muted)] font-medium">
              Registered chat and bot participants
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {isAdmin && stats.totalDebt > 0.009 && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setConfirmGroupSettle(true)}
                disabled={bulkSettling}
                className="gap-1 font-bold"
              >
                {bulkSettling ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                <span>⚡ Settle All Debt (${stats.totalDebt.toFixed(2)})</span>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={handleCopyUserlist} disabled={members.length === 0}>
              Copy Members List
            </Button>
            <Button size="sm" variant="secondary" onClick={load}>
              <RefreshCw size={13} className="mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* 1. Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shrink-0">
              <Users size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text)] leading-tight">{stats.total}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">Total Members</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Shield size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text)] leading-tight">{stats.admins}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">Admins</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shrink-0">
              <Activity size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text)] leading-tight">{stats.active}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">Active Users</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
              stats.totalDebt > 0.009
                ? "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300"
                : "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
            }`}>
              <Wallet size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text)] leading-tight">
                ${stats.totalDebt.toFixed(2)}
              </div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)] truncate">
                {stats.totalDebt > 0.009 ? "Group Debt" : "All Settled"}
              </div>
            </div>
          </Card>
        </div>

        {/* 2. Search & Filter Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input 
              type="text"
              placeholder="Search by name, username, or ID..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-[var(--radius-md)] border focus:outline-none focus:ring-1 bg-[var(--surface)] text-[var(--text)] border-[var(--border)]"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-md)] border hover:bg-[var(--surface-2)] text-[var(--text-muted)] cursor-pointer bg-[var(--surface)] border-[var(--border)]">
            <SlidersHorizontal size={14} />
          </button>
        </div>

        {/* 3. Members List Container */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />)}
          </div>
        ) : filteredMembers.length === 0 ? (
          <EmptyState 
            icon={<Users size={32} />} 
            title={searchQuery ? "No members found" : "No registered members"}
            description={searchQuery ? "Try refining your search filter." : "Members will appear here once they register or participate in polls."} 
          />
        ) : (
          <Card variant="default" padding="none" className="overflow-hidden border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm animate-fade-in bg-[var(--surface)]">
            <div className="divide-y divide-[var(--border)]">
              {filteredMembers.map(m => {
                const displayName = m.name || m.full_name || `User ${m.user_id}`;
                const isAdm = m.role?.toLowerCase() === "admin";
                const isActive = m.status?.toLowerCase() === "active";
                const avatarStyle = getAvatarStyle(displayName);
                const initials = getInitials(displayName);

                return (
                  <div 
                    key={m.user_id}
                    className="flex items-center justify-between p-3 sm:p-4 hover:bg-[var(--surface-2)] transition-colors gap-3"
                  >
                    {/* Left: Avatar + Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${avatarStyle.bg} ${avatarStyle.text}`}>
                          {initials}
                        </div>
                        <span 
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[var(--surface)] ${
                            isActive ? "bg-emerald-500" : "bg-neutral-400"
                          }`}
                        />
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-[var(--text)] truncate">{displayName}</span>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full ${
                            isAdm 
                              ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          }`}>
                            {isAdm ? "Admin" : "Member"}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate font-medium">
                          {m.username ? `@${m.username}` : `ID: ${m.user_id}`}
                          {m.last_active_at && (
                            <> · Active {formatDistanceToNow(parseISO(m.last_active_at), { addSuffix: true })}</>
                          )}
                        </p>
                        {m.bank_name && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 truncate">
                            🏦 ABA: {m.bank_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions / Debt Status / Info */}
                    <div className="flex items-center gap-2 shrink-0">
                      {(m.unpaid_debt ?? 0) > 0.009 ? (
                        <Badge variant="danger" className="text-[10px] font-bold whitespace-nowrap">
                          Debt: ${(m.unpaid_debt ?? 0).toFixed(2)}
                        </Badge>
                      ) : (m.total_spend ?? 0) > 0 ? (
                        <Badge variant="success" className="text-[10px] whitespace-nowrap">
                          ✓ Settled
                        </Badge>
                      ) : null}

                      {isAdmin && (m.unpaid_debt ?? 0) > 0.009 && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setConfirmMemberForSettle(m)}
                          disabled={settlingUserId === m.user_id}
                          className="gap-1 text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 font-bold"
                          title={`Mark all unpaid orders as paid for ${displayName}`}
                        >
                          {settlingUserId === m.user_id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Check size={11} />
                          )}
                          <span>Mark Paid</span>
                        </Button>
                      )}

                      {m.phone && (
                        <div className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold bg-[var(--surface-2)] px-2 py-1 rounded-[var(--radius-sm)]">
                          <Phone size={10} />
                          <span>{m.phone}</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedMember(m)}
                        className="gap-1 text-[11px] px-2.5 py-1"
                      >
                        <Wallet size={12} className="text-[var(--color-primary)]" />
                        <span>View</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>

      <MemberSpendModal
        member={selectedMember}
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        onUpdated={load}
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
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
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
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Total group debt to settle: <strong className="text-[var(--text)]">${stats.totalDebt.toFixed(2)}</strong>.
            </p>
          </div>
        }
      />
    </>
  );
}
