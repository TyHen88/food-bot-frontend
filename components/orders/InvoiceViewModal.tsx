"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadInvoicePdf } from "@/lib/invoicePdf";
import { Download, Send } from "lucide-react";
import { InvoicePdfDocument } from "./InvoicePdfDocument";

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
  /** Payer's QR image as a data URI, when their payer row has one. */
  payer_qr_image?: string;
  /** Raw KHQR payload, when set on the payer row. */
  payer_khqr_text?: string;
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
  const [downloading, setDownloading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

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

  async function downloadPdf() {
    if (!invoice || !pdfRef.current) return;
    setDownloading(true);
    try {
      // Let images (QR data URI) and fonts settle before the snapshot.
      await document.fonts?.ready;
      await downloadInvoicePdf(
        pdfRef.current,
        `invoice_${invoice.order_date}_${invoice.order_id.slice(-6)}.pdf`,
      );
    } catch (e: unknown) {
      toast((e as Error).message || "PDF generation failed", "error");
    } finally {
      setDownloading(false);
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
          <Button
            variant="secondary"
            size="sm"
            loading={downloading}
            disabled={!invoice}
            onClick={downloadPdf}
          >
            <Download size={13} /> PDF
          </Button>
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

          {/* Payer QR — scan to pay */}
          {invoice.payer_qr_image && (
            <div className="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border px-3 py-3"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {/* White backing keeps the QR scannable in dark mode. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={invoice.payer_qr_image}
                alt={`KHQR to pay ${invoice.payer_name || "the payer"}`}
                className="w-44 max-w-full rounded-[var(--radius-sm)] bg-white p-1.5"
              />
              <p className="text-[11px] font-medium m-0" style={{ color: "var(--text-muted)" }}>
                📱 Scan to pay {invoice.payer_name || "the payer"}
              </p>
              {invoice.payer_khqr_text && (
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(invoice.payer_khqr_text!).then(
                      () => toast("KHQR code copied", "success"),
                      () => toast("Copy failed", "error"),
                    )
                  }
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-[var(--radius-sm)] border cursor-pointer hover:bg-[var(--surface-2)]"
                  style={{ background: "transparent", color: "var(--text-2)", borderColor: "var(--border)" }}
                >
                  Copy KHQR code
                </button>
              )}
            </div>
          )}

          {/* Off-screen print layout captured by the PDF download. */}
          <InvoicePdfDocument ref={pdfRef} invoice={invoice} />
        </div>
      )}
    </Modal>
  );
}
