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
  MoreHorizontal
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

interface Member {
  user_id: string;
  name?: string;
  full_name?: string;
  username?: string;
  phone?: string;
  role: string;      // "Admin" | "Member"
  status: string;    // "Active" | "Inactive"
  last_active_at?: string;
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

  // 1. Stats Calculations
  const stats = useMemo(() => {
    const total = members.length;
    const admins = members.filter(m => m.role?.toLowerCase() === "admin").length;
    const active = members.filter(m => m.status?.toLowerCase() === "active").length;
    return { total, admins, active };
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
          <Button size="sm" variant="secondary" onClick={handleCopyUserlist} disabled={members.length === 0}>
            Copy List
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
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopyUserlist} disabled={members.length === 0}>
              Copy Members List
            </Button>
            <Button size="sm" variant="secondary" onClick={load}>
              <RefreshCw size={13} className="mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* 1. Stats Grid */}
        <div className="grid grid-cols-3 gap-4">
          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
              <Users size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.total}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Total Members</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <Shield size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.admins}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Admins</div>
            </div>
          </Card>

          <Card variant="default" padding="sm" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
              <Activity size={18} />
            </div>
            <div>
              <div className="text-xl font-bold text-[var(--text)] leading-tight">{stats.active}</div>
              <div className="text-[10px] font-semibold text-[var(--text-muted)]">Active Users</div>
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
                  <div key={m.user_id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-2)]/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar with Active Dot */}
                      <div className="relative flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${avatarStyle.bg} ${avatarStyle.text}`}>
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
                      </div>
                    </div>

                    {/* Actions / Info */}
                    <div className="flex items-center gap-3">
                      {m.phone && (
                        <div className="hidden sm:flex items-center gap-1 text-[10px] text-[var(--text-muted)] font-semibold bg-[var(--surface-2)] px-2 py-1 rounded-[var(--radius-sm)]">
                          <Phone size={10} />
                          <span>{m.phone}</span>
                        </div>
                      )}
                      <button className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 border-0 text-[var(--text-muted)] cursor-pointer">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
