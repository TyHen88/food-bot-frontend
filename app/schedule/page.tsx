"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Clock, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery, launchChatId } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { AdminGuard } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";

interface Schedule {
  schedule_id: string;
  name: string;
  action_type: string;
  time_of_day: string;
  days_of_week: string;
  target_chat_ids: string;
  is_active: boolean;
}

const DAY_LABELS: Record<string, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

function DayPills({ days }: { days: string }) {
  const parts = days.split(",").map(d => d.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map(d => (
        <Badge key={d} variant="primary" className="text-[10px] px-1.5 py-0.5">
          {DAY_LABELS[d] ?? d}
        </Badge>
      ))}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <AdminGuard>
      <ScheduleContent />
    </AdminGuard>
  );
}

function ScheduleContent() {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Scope to the group the Mini App was opened from; outside a group
      // (bot DM / dev browser) the backend returns every schedule.
      const data = await api.get<Schedule[]>(`/schedules${chatIdQuery(true)}`);
      setSchedules(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function toggleSchedule(s: Schedule) {
    setToggling(s.schedule_id);
    try {
      // PUT, not PATCH — older deployed backends only route PUT here and
      // answer PATCH with 405 Method Not Allowed.
      await api.put(`/schedules/${s.schedule_id}`, { is_active: !s.is_active });
      setSchedules(prev => prev.map(x => x.schedule_id === s.schedule_id ? { ...x, is_active: !x.is_active } : x));
      toast(`Schedule ${s.is_active ? "disabled" : "enabled"}`, "success");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setToggling(null);
    }
  }

  return (
    <>
      <TopBar title="Schedule" />
      <main className="page-content">
        <DesktopHeader
          title="Schedules"
          subtitle="Automated bot jobs and reminders"
        />

        {loading ? (
          <Card padding="md">
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[1,2,3].map(i => <SkeletonRow key={i} />)}
            </div>
          </Card>
        ) : schedules.length === 0 ? (
          <EmptyState
            icon={<Calendar size={40} />}
            title="No schedules configured"
            description="Add scheduled reminders and automated messages."
          />
        ) : (
          <div className="space-y-3 animate-fade-in">
            {schedules.map(s => (
              <Card key={s.schedule_id} variant="default" padding="md">
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <div className="flex-shrink-0 mt-0.5">
                    <Toggle
                      checked={s.is_active}
                      onChange={() => toggleSchedule(s)}
                      disabled={toggling === s.schedule_id}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        {s.name}
                      </h3>
                      <Badge variant={s.is_active ? "active" : "inactive"}>
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="default" className="text-[10px]">{s.action_type}</Badge>
                    </div>

                    {/* Time + days */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} style={{ color: "var(--color-primary)" }} />
                        <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                          {s.time_of_day}
                        </span>
                      </div>
                      <DayPills days={s.days_of_week} />
                    </div>

                    {/* Target */}
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Target: {s.target_chat_ids === "ALL" ? "All subscribed chats" : s.target_chat_ids}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
