"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, BookTemplate } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { AdminGuard } from "@/contexts/AuthContext";
import { TopBar } from "@/components/layout/TopBar";
import { DesktopHeader } from "@/components/layout/TopBar";

interface Template {
  template_id: string;
  name: string;
  question: string;
  options: string;
  is_active: boolean;
  created_at?: string;
}

function parseOptions(raw: string): string[] {
  try { return JSON.parse(raw); } catch { return raw.split("\n").filter(Boolean); }
}

export default function TemplatesPage() {
  return (
    <AdminGuard>
      <TemplatesContent />
    </AdminGuard>
  );
}

function TemplatesContent() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: "", question: "", options: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Template[]>("/templates");
      setTemplates(data ?? []);
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name.trim() || !form.question.trim() || !form.options.trim()) {
      toast("Please fill in all fields", "error"); return;
    }
    const optionsList = form.options.split("\n").map(s => s.trim()).filter(Boolean);
    if (optionsList.length < 2) {
      toast("At least 2 options required", "error"); return;
    }
    setSaving(true);
    try {
      await api.post("/templates", {
        name: form.name.trim(),
        question: form.question.trim(),
        options: JSON.stringify(optionsList),
      });
      toast("Template created!", "success");
      setShowModal(false);
      setForm({ name: "", question: "", options: "" });
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(t: Template) {
    try {
      await api.delete(`/templates/${t.template_id}`);
      toast("Template deleted", "success");
      setConfirmDelete(null);
      load();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <>
      <TopBar title="Templates" actions={
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={14} /> New
        </Button>
      } />
      <main className="page-content">
        <DesktopHeader
          title="Poll Templates"
          subtitle="Reusable food poll templates"
          actions={
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus size={14} /> New Template
            </Button>
          }
        />

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<BookTemplate size={40} />}
            title="No templates yet"
            description="Create your first poll template to quickly run food polls."
            action={<Button onClick={() => setShowModal(true)}><Plus size={14} /> Create Template</Button>}
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">
            {templates.map(t => {
              const opts = parseOptions(t.options);
              return (
                <Card key={t.template_id} variant="default" padding="md" className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>{t.name}</h3>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-muted)" }}>{t.question}</p>
                    </div>
                    <Badge variant={t.is_active ? "active" : "inactive"}>
                      {t.is_active ? "Active" : "Off"}
                    </Badge>
                  </div>
                  {/* Options preview */}
                  <div className="flex flex-wrap gap-1.5">
                    {opts.slice(0, 5).map((o, i) => (
                      <Badge key={i} variant="default" className="text-xs">{o}</Badge>
                    ))}
                    {opts.length > 5 && (
                      <Badge variant="default" className="text-xs">+{opts.length - 5} more</Badge>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => setConfirmDelete(t)}
                      className="text-[var(--color-danger)] hover:bg-[var(--color-danger-light)]"
                    >
                      <Trash2 size={13} /> Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* New template modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Template"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={save}>Create</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            placeholder="e.g. Daily Lunch Poll"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Poll Question"
            placeholder="e.g. What do you want for lunch today?"
            value={form.question}
            onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
          />
          <Textarea
            label="Options (one per line)"
            placeholder={"Fried Rice\nNoodle Soup\nSandwich\nSalad"}
            value={form.options}
            onChange={e => setForm(f => ({ ...f, options: e.target.value }))}
            hint="Each line becomes one poll option"
          />
        </div>
      </Modal>

      {/* Confirm delete modal */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete Template?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => confirmDelete && deleteTemplate(confirmDelete)}>Delete</Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Are you sure you want to delete <strong>&quot;{confirmDelete?.name}&quot;</strong>? This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
