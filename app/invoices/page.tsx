"use client";

import { useEffect, useState, useCallback } from "react";
import { Receipt, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { chatIdQuery } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { TopBar, DesktopHeader } from "@/components/layout/TopBar";
import { InvoiceViewModal } from "@/components/orders/InvoiceViewModal";

interface InvoiceRow {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  total: number;
  payer_name: string;
  person_count: number;
  sent_count: number;
  last_sent_at: string;
}

export default function InvoicesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<InvoiceRow[]>(`/invoices${chatIdQuery(true)}`);
      setInvoices(data ?? []);
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

  return (
    <>
      <TopBar title="Invoices" />
      <main className="page-content">
        <DesktopHeader title="Invoices" subtitle="Sent order invoices" />

        {loading ? (
          <Card padding="md">
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          </Card>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} />}
            title="No invoices yet"
            description="Invoices appear here after an admin sends one from the Orders page."
          />
        ) : (
          <div className="space-y-2 animate-fade-in">
            {invoices.map(inv => (
              <Card
                key={inv.invoice_id}
                variant="default"
                padding="sm"
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setViewId(inv.invoice_id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                    <Receipt size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold truncate" style={{ color: "var(--text)" }}>
                        {inv.chat_title || `Order ${inv.order_id.slice(-6)}`}
                      </p>
                      {inv.sent_count > 1 && (
                        <Badge variant="default" className="text-[10px] shrink-0">×{inv.sent_count}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {inv.order_date} · {inv.person_count} {inv.person_count === 1 ? "person" : "people"}
                      {inv.payer_name ? ` · 💳 ${inv.payer_name}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono shrink-0" style={{ color: "var(--color-primary)" }}>
                    ${(inv.total ?? 0).toFixed(2)}
                  </span>
                  <ChevronRight size={14} className="shrink-0" style={{ color: "var(--text-muted)" }} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <InvoiceViewModal
        invoiceId={viewId}
        open={!!viewId}
        onClose={() => setViewId(null)}
        isAdmin={isAdmin}
        onResent={load}
      />
    </>
  );
}
