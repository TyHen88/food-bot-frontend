"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Clock, Calendar, ImageIcon, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery, launchChatId } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { AdminGuard } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";

interface Schedule {
  schedule_id: string;
  name: string;
  action_type: string;
  message_text: string;
  image: string;
  image_name: string;
  run_date: string;        // YYYY-MM-DD => one-time; "" => weekly
  time_of_day: string;
  days_of_week: string;
  target_chat_ids: string;
  is_active: boolean;
}

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
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

interface FormState {
  name: string;
  message_text: string;
  image: string;        // Telegram file_id (or assets/ filename)
  image_name: string;
  oneTime: boolean;
  run_date: string;
  time_of_day: string;
  days: Set<string>;
  target_chat_ids: string;
  is_active: boolean;
}

function emptyForm(defaultTarget: string): FormState {
  return {
    name: "",
    message_text: "",
    image: "",
    image_name: "",
    oneTime: false,
    run_date: "",
    time_of_day: "",
    days: new Set(["MON", "TUE", "WED", "THU", "FRI"]),
    target_chat_ids: defaultTarget,
    is_active: true,
  };
}

function formFromSchedule(s: Schedule): FormState {
  return {
    name: s.name || "",
    message_text: s.message_text || "",
    image: s.image || "",
    image_name: s.image_name || "",
    oneTime: !!s.run_date,
    run_date: s.run_date || "",
    time_of_day: s.time_of_day || "",
    days: new Set(s.days_of_week.split(",").map(d => d.trim()).filter(Boolean)),
    target_chat_ids: s.target_chat_ids || "ALL",
    is_active: !!s.is_active,
  };
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

  // Form modal state: null = closed, "" = create, "<id>" = edit that row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm("ALL"));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const chatId = launchChatId();

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

  function openCreate() {
    // New schedules made from a group default to targeting that group.
    setForm(emptyForm(chatId || "ALL"));
    setConfirmDelete(false);
    setEditingId("");
  }

  function openEdit(s: Schedule) {
    setForm(formFromSchedule(s));
    setConfirmDelete(false);
    setEditingId(s.schedule_id);
  }

  function closeForm() {
    setEditingId(null);
    setConfirmDelete(false);
  }

  async function pickImage(file: File) {
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read the image file"));
        r.readAsDataURL(file);
      });
      const res = await api.post<{ file_id: string }>("/schedules/upload-image", {
        data_base64: dataUrl,
        filename: file.name,
      });
      setForm(f => ({ ...f, image: res.file_id, image_name: file.name }));
      toast("Image uploaded", "success");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function toggleDay(d: string) {
    setForm(f => {
      const days = new Set(f.days);
      if (days.has(d)) days.delete(d); else days.add(d);
      return { ...f, days };
    });
  }

  async function save() {
    // Mirror the backend's validation so errors show before the request.
    if (!form.time_of_day) { toast("Pick a time", "error"); return; }
    if (!form.message_text.trim() && !form.image) {
      toast("Add a message text and/or an image", "error"); return;
    }
    if (form.oneTime && !form.run_date) { toast("Pick a date", "error"); return; }
    if (!form.oneTime && form.days.size === 0) {
      toast("Pick at least one weekday", "error"); return;
    }

    const body = {
      name: form.name.trim(),
      message_text: form.message_text,
      image: form.image,
      image_name: form.image_name,
      run_date: form.oneTime ? form.run_date : "",
      days_of_week: form.oneTime ? "" : ALL_DAYS.filter(d => form.days.has(d)).join(","),
      time_of_day: form.time_of_day,
      target_chat_ids: form.target_chat_ids || "ALL",
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/schedules/${editingId}`, body);
        toast("Schedule updated", "success");
      } else {
        await api.post("/schedules", body);
        toast("Schedule created", "success");
      }
      closeForm();
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await api.delete(`/schedules/${editingId}`);
      toast("Schedule deleted", "success");
      closeForm();
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const newButton = (
    <Button size="sm" onClick={openCreate}>
      <Plus size={14} /> New
    </Button>
  );

  return (
    <>
      <TopBar title="Schedule" actions={newButton} />
      <main className="page-content">
        <DesktopHeader
          title="Schedules"
          subtitle={chatId ? "Automated jobs for this group" : "Automated bot jobs and reminders"}
          actions={<span className="hidden md:block">{newButton}</span>}
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
            action={<Button onClick={openCreate}><Plus size={14} /> New Schedule</Button>}
          />
        ) : (
          <div className="space-y-3 animate-fade-in">
            {schedules.map(s => (
              <Card
                key={s.schedule_id}
                variant="default"
                padding="md"
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openEdit(s)}
              >
                <div className="flex items-start gap-4">
                  {/* Toggle (stop propagation so it doesn't open the editor) */}
                  <div className="flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
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
                      {s.image && (
                        <Badge variant="default" className="text-[10px]">
                          <ImageIcon size={10} className="inline mr-0.5" />
                          {s.image_name || "image"}
                        </Badge>
                      )}
                    </div>

                    {s.message_text && (
                      <p className="text-xs line-clamp-2" style={{ color: "var(--text-2)" }}>
                        {s.message_text}
                      </p>
                    )}

                    {/* Time + recurrence */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} style={{ color: "var(--color-primary)" }} />
                        <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                          {s.time_of_day}
                        </span>
                      </div>
                      {s.run_date ? (
                        <Badge variant="accent" className="text-[10px]">Once · {s.run_date}</Badge>
                      ) : (
                        <DayPills days={s.days_of_week} />
                      )}
                    </div>

                    {/* Target */}
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Target: {s.target_chat_ids === "ALL"
                        ? "All subscribed chats"
                        : chatId && s.target_chat_ids.trim() === chatId
                          ? "This group"
                          : s.target_chat_ids}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create / edit form — bottom sheet on mobile, dialog on desktop */}
      <Modal
        open={editingId !== null}
        onClose={closeForm}
        title={editingId ? "Edit Schedule" : "New Schedule"}
        footer={
          <>
            {editingId && !confirmDelete && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}
                className="mr-auto text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]">
                <Trash2 size={14} /> Delete
              </Button>
            )}
            {editingId && confirmDelete && (
              <div className="mr-auto flex items-center gap-2">
                <Button variant="danger" size="sm" loading={deleting} onClick={remove}>
                  Confirm delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            )}
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button loading={saving} onClick={save}>{editingId ? "Save" : "Create"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Lunch reminder"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />

          <Textarea
            label="Message text"
            placeholder="Text the bot sends (optional if an image is set)"
            value={form.message_text}
            onChange={e => setForm(f => ({ ...f, message_text: e.target.value }))}
          />

          {/* Image */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Image (optional)
            </label>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); }}
            />
            {form.image ? (
              <div className="flex items-center gap-2">
                <Badge variant="primary" className="text-xs">
                  <ImageIcon size={11} className="inline mr-1" />
                  {form.image_name || "image"}
                </Badge>
                <button
                  onClick={() => setForm(f => ({ ...f, image: "", image_name: "" }))}
                  className="w-6 h-6 flex items-center justify-center rounded-full border-0 cursor-pointer"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" loading={uploading}
                onClick={() => fileInput.current?.click()}>
                <ImageIcon size={14} /> Upload image
              </Button>
            )}
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Uploading registers the image with Telegram — open a DM with the bot first.
            </p>
          </div>

          <Input
            label="Time"
            type="time"
            value={form.time_of_day}
            onChange={e => setForm(f => ({ ...f, time_of_day: e.target.value }))}
          />

          {/* Recurrence: weekly days OR a one-time date */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Repeat
            </label>
            <div className="flex gap-2">
              {[{ v: false, l: "Weekly" }, { v: true, l: "One-time" }].map(opt => (
                <button
                  key={opt.l}
                  onClick={() => setForm(f => ({ ...f, oneTime: opt.v }))}
                  className="flex-1 h-9 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer transition-colors"
                  style={form.oneTime === opt.v
                    ? { background: "var(--color-primary-light)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
                    : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {form.oneTime ? (
            <Input
              label="Date"
              type="date"
              value={form.run_date}
              onChange={e => setForm(f => ({ ...f, run_date: e.target.value }))}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                Days
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_DAYS.map(d => {
                  const on = form.days.has(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleDay(d)}
                      className="h-8 px-2.5 text-xs font-semibold rounded-full border cursor-pointer transition-colors"
                      style={on
                        ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" }
                        : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target chats */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Send to
            </label>
            <div className="flex gap-2">
              {chatId && (
                <button
                  onClick={() => setForm(f => ({ ...f, target_chat_ids: chatId }))}
                  className="flex-1 h-9 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer transition-colors"
                  style={form.target_chat_ids.trim() === chatId
                    ? { background: "var(--color-primary-light)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
                    : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
                >
                  This group
                </button>
              )}
              <button
                onClick={() => setForm(f => ({ ...f, target_chat_ids: "ALL" }))}
                className="flex-1 h-9 text-xs font-semibold rounded-[var(--radius-md)] border cursor-pointer transition-colors"
                style={form.target_chat_ids === "ALL"
                  ? { background: "var(--color-primary-light)", color: "var(--color-primary)", borderColor: "var(--color-primary)" }
                  : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }}
              >
                All subscribed chats
              </button>
            </div>
            {form.target_chat_ids !== "ALL" && (!chatId || form.target_chat_ids.trim() !== chatId) && (
              <Input
                placeholder="Comma-separated chat ids"
                value={form.target_chat_ids}
                onChange={e => setForm(f => ({ ...f, target_chat_ids: e.target.value }))}
                hint="Custom target list"
              />
            )}
          </div>

          {/* Active */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Active</span>
            <Toggle
              checked={form.is_active}
              onChange={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
