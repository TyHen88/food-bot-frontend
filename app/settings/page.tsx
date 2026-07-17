"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Check, X, Plus, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { AdminGuard } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";
import { Avatar } from "@/components/ui/Avatar";
import { clsx } from "clsx";

interface Setting {
  key: string;
  value: string;
  value_type: string;
  description?: string;
  updated_at?: string;
  updated_by?: string;
}

/** Group settings by their prefix (POLL_*, ORDER_*, MESSAGE_*, etc.) */
function groupSettings(settings: Setting[]): Record<string, Setting[]> {
  return settings.reduce<Record<string, Setting[]>>((acc, s) => {
    const prefix = s.key.includes("_") ? s.key.split("_")[0] : "GENERAL";
    if (!acc[prefix]) acc[prefix] = [];
    acc[prefix].push(s);
    return acc;
  }, {});
}

function InlineEdit({ setting, onSave }: { setting: Setting; onSave: (key: string, value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(setting.value);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(setting.key, value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancel() { setValue(setting.value); setEditing(false); }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            className="flex-1 px-2 py-1 text-sm rounded-[var(--radius-sm)] border focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] min-w-0"
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              borderColor: "var(--color-primary)",
            }}
          />
          <button
            onClick={save}
            disabled={saving}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-0 cursor-pointer flex-shrink-0"
            style={{ background: "var(--color-success-light)", color: "var(--color-success)" }}
          >
            <Check size={13} />
          </button>
          <button
            onClick={cancel}
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-0 cursor-pointer flex-shrink-0"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            <X size={13} />
          </button>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={clsx(
            "flex-1 text-left text-sm px-2 py-1 rounded-[var(--radius-sm)] border border-transparent",
            "hover:border-[var(--border)] hover:bg-[var(--surface-2)] transition-all cursor-pointer truncate"
          )}
          style={{ color: "var(--text)", background: "transparent" }}
          title="Click to edit"
        >
          {setting.value || <span style={{ color: "var(--text-muted)" }}>(empty)</span>}
        </button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AdminGuard>
      <TopBar title="Settings" />
      <main className="page-content space-y-12 pb-12">
        <SettingsSection />
        <PayersSection />
      </main>
    </AdminGuard>
  );
}

function SettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ key: "", value: "", description: "" });
  const [confirmDel, setConfirmDel] = useState<Setting | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Setting[]>("/settings");
      setSettings(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function saveSetting(key: string, value: string) {
    try {
      await api.put(`/settings/${key}`, { value });
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
      toast("Saved", "success");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
      throw e;
    }
  }

  async function addSetting() {
    if (!newForm.key.trim()) { toast("Key required", "error"); return; }
    setSaving(true);
    try {
      await api.post("/settings", {
        key: newForm.key.trim().toUpperCase(),
        value: newForm.value,
        description: newForm.description,
      });
      toast("Setting added", "success");
      setShowAdd(false);
      setNewForm({ key: "", value: "", description: "" });
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSetting(s: Setting) {
    try {
      await api.delete(`/settings/${s.key}`);
      toast("Setting deleted", "success");
      setConfirmDel(null);
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  const groups = groupSettings(settings);

  return (
    <section>
      <DesktopHeader
          title="Settings"
          subtitle="Bot configuration key-value pairs"
          actions={
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Setting
            </Button>
          }
        />

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-3" />
                <Card padding="none">
                  {[1,2,3].map(j => <Skeleton key={j} className="h-12 m-3 rounded" />)}
                </Card>
              </div>
            ))}
          </div>
        ) : settings.length === 0 ? (
          <EmptyState
            title="No settings configured"
            description="Add bot configuration settings here."
            action={<Button onClick={() => setShowAdd(true)}><Plus size={14} /> Add Setting</Button>}
          />
        ) : (
          <div className="space-y-6 animate-fade-in">
            {Object.entries(groups).map(([prefix, items]) => (
              <div key={prefix}>
                <p className="section-label">{prefix}</p>
                <Card variant="default" padding="none" className="overflow-hidden">
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {items.map(s => (
                      <div key={s.key} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors group">
                        <div className="w-40 flex-shrink-0">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{s.key}</p>
                          {s.description && (
                            <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{s.description}</p>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <InlineEdit setting={s} onSave={saveSetting} />
                        </div>
                        <button
                          onClick={() => setConfirmDel(s)}
                          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border-0 cursor-pointer flex-shrink-0 transition-opacity"
                          style={{ background: "var(--color-danger-light)", color: "var(--color-danger)" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        )}

      {/* Add modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Setting"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button loading={saving} onClick={addSetting}>Add</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Key (UPPER_SNAKE_CASE)"
            placeholder="e.g. POLL_QUESTION"
            value={newForm.key}
            onChange={e => setNewForm(f => ({ ...f, key: e.target.value.toUpperCase() }))}
          />
          <Input
            label="Value"
            placeholder=""
            value={newForm.value}
            onChange={e => setNewForm(f => ({ ...f, value: e.target.value }))}
          />
          <Input
            label="Description (optional)"
            placeholder="What this setting controls"
            value={newForm.description}
            onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Delete Setting?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => confirmDel && deleteSetting(confirmDel)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Delete setting <strong>{confirmDel?.key}</strong>? This cannot be undone.
        </p>
      </Modal>
    </section>
  );
}

// --- Payers Section ---

interface Payer {
  user_id: string;
  username?: string;
  full_name?: string;
  times_paid?: number;
  qr_filename?: string;
  khqr_text?: string;
}

function PayersSection() {
  const { toast } = useToast();
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Payer | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", qr_filename: "", khqr_text: "" });
  const [uploading, setUploading] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Payer[]>("/payers");
      setPayers(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function openEdit(p: Payer) {
    setEditing(p);
    setEditForm({
      full_name: p.full_name || p.username || "",
      qr_filename: p.qr_filename || "",
      khqr_text: p.khqr_text || "",
    });
    // Show the currently stored QR (assets file or uploaded image), if any.
    setQrPreview(null);
    if (p.qr_filename) {
      api.get<{ qr: string }>(`/payers/${p.user_id}/qr`)
        .then(res => { if (res?.qr) setQrPreview(res.qr); })
        .catch(() => { /* preview is best-effort */ });
    }
  }

  async function uploadQrImage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("Image too large (max 8MB)", "error");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
      });
      // Reuses the schedule image upload: the bot registers the photo with
      // Telegram and returns a reusable file_id we store on the payer row.
      const res = await api.post<{ file_id: string }>("/schedules/upload-image", {
        data_base64: dataUrl,
        filename: file.name,
      });
      if (!res?.file_id) throw new Error("Upload failed — no file id returned");
      setEditForm(f => ({ ...f, qr_filename: res.file_id }));
      setQrPreview(dataUrl);
      toast("QR image uploaded — press Save to keep it", "success");
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function savePayer() {
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/payers/${editing.user_id}`, {
        full_name: editForm.full_name.trim(),
        qr_filename: editForm.qr_filename.trim(),
        khqr_text: editForm.khqr_text,
      });
      toast("Payer updated", "success");
      setEditing(null);
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <DesktopHeader
        title="Paid List"
        subtitle="Manage who pays for orders and their payment details"
      />

      {loading ? (
        <Card padding="md">
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded" />)}
          </div>
        </Card>
      ) : payers.length === 0 ? (
        <EmptyState
          title="No payers yet"
          description="Someone becomes a payer the first time they tap the Order button."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {payers.map(p => {
            const name = p.full_name || p.username || `User ${p.user_id}`;
            return (
              <Card key={p.user_id} padding="md" className="flex items-center gap-4 hover:shadow-md transition-shadow">
                <Avatar name={name} size={42} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{name}</p>
                  <p className="text-xs truncate mt-1" style={{ color: "var(--text-muted)" }}>
                    {p.username ? `@${p.username} · ` : ""}Paid {p.times_paid || 0}×
                  </p>
                  {p.qr_filename && (
                    <Badge variant="primary" className="text-[10px] mt-2">
                      QR: {p.qr_filename.includes(".") ? p.qr_filename : "uploaded image"}
                    </Badge>
                  )}
                </div>
                <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>Edit</Button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Payer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={savePayer}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Display name"
            placeholder="Name shown as payer"
            value={editForm.full_name}
            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
          />
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Payment QR image
            </label>
            {qrPreview && (
              <div className="flex justify-center rounded-[var(--radius-md)] border p-2"
                style={{ borderColor: "var(--border)", background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrPreview} alt="Payment QR" className="w-36 max-w-full" />
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) uploadQrImage(file);
              }}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> {editForm.qr_filename ? "Replace image" : "Upload image"}
              </Button>
              {editForm.qr_filename && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditForm(f => ({ ...f, qr_filename: "" })); setQrPreview(null); }}
                >
                  <Trash2 size={13} /> Remove
                </Button>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Attached to invoices as “scan to pay”. Uploading needs the admin to
              have a DM open with the bot (/start).
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              KHQR text
            </label>
            <textarea
              className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
              rows={4}
              placeholder="Raw KHQR payload (optional)"
              value={editForm.khqr_text}
              onChange={e => setEditForm(f => ({ ...f, khqr_text: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </section>
  );
}
