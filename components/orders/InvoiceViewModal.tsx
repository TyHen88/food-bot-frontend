"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { Send } from "lucide-react";

export interface InvoiceItem {
  item_name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface InvoiceDetailEntry {
  user_name: string;
  items: InvoiceItem[];
  subtotal: number;
}

export interface Invoice {
  invoice_id: string;
  order_id: string;
  chat_id: string;
  chat_title?: string;
  order_date: string;
  details: InvoiceDetailEntry[];
  total: number;
  payer_name: string;
  sent_count: number;
  last_sent_at: string;
}

/** Read-only invoice breakdown — any role can view; admins can re-send the
 * Telegram message. Fetches by id so it always shows the stored invoice. */
export function InvoiceViewModal({
  invoiceId,
  open,
  onClose,
  isAdmin,
  onResent,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onResent?: () => void;
}) {
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) { setInvoice(null); return; }
    let cancelled = false;
    setLoading(true);
    api.get<Invoice>(`/invoices/${invoiceId}`)
      .then(inv => { if (!cancelled) setInvoice(inv); })
      .catch((e: unknown) => { if (!cancelled) toast((e as Error).message, "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, invoiceId, toast]);

  async function resend() {
    if (!invoice) return;
    setResending(true);
    try {
      const res = await api.post<{ sent_count: number }>(`/invoices/${invoice.invoice_id}/resend`, {});
      setInvoice({ ...invoice, sent_count: res?.sent_count ?? invoice.sent_count + 1 });
      toast("Invoice re-sent to the group", "success");
      onResent?.();
    } catch (e: unknown) {
      toast((e as Error).message, "error");
    } finally {
      setResending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="🧾 Invoice"
      maxWidth="480px"
      footer={
        <>
          {isAdmin && (
            <Button variant="secondary" size="sm" loading={resending} onClick={resend} className="mr-auto">
              <Send size={13} /> Resend
            </Button>
          )}
          <Button size="sm" onClick={onClose}>Close</Button>
        </>
      }
    >
      {loading || !invoice ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "var(--text)" }}>
                {invoice.chat_title || `Order ${invoice.order_id.slice(-6)}`}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{invoice.order_date}</p>
            </div>
            <Badge variant="default" className="text-[10px]">
              Sent ×{invoice.sent_count}
            </Badge>
          </div>

          {/* Per-person breakdown */}
          <div className="divide-y rounded-[var(--radius-md)] border overflow-hidden"
            style={{ borderColor: "var(--border)" }}>
            {invoice.details.map((d, i) => (
              <div key={i} className="px-3 py-2" style={{ background: "var(--surface)" }}>
                <p className="text-xs font-bold mb-1" style={{ color: "var(--text)" }}>
                  ▪️ {d.user_name}
                </p>
                {(d.items ?? []).map((it, j) => (
                  <div key={j} className="flex items-center justify-between gap-2 text-xs py-0.5">
                    <span className="truncate flex-1" style={{ color: "var(--text-2)" }}>
                      • {it.item_name} ×{it.qty}
                    </span>
                    <span className="font-mono shrink-0" style={{ color: "var(--text)" }}>
                      ${(it.cost ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
                {(d.items ?? []).length > 1 && (
                  <div className="flex items-center justify-between text-xs pt-1 font-semibold"
                    style={{ color: "var(--text)" }}>
                    <span>Subtotal</span>
                    <span className="font-mono">${(d.subtotal ?? 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Total block */}
          <div className="rounded-[var(--radius-md)] px-3 py-2 space-y-1"
            style={{ background: "var(--color-primary-light)" }}>
            <div className="flex items-center justify-between text-sm font-bold"
              style={{ color: "var(--color-primary)" }}>
              <span>💰 Total Due</span>
              <span className="font-mono">${(invoice.total ?? 0).toFixed(2)}</span>
            </div>
            <p className="text-xs" style={{ color: "var(--color-primary)" }}>
              💳 Pay to <span className="font-semibold">{invoice.payer_name || "—"}</span>
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
